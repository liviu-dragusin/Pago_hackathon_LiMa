"""Acces Gmail (doar citire) pentru scanarea unică a facturilor.

Bibliotecile Google sunt importate leneș, ca modul demo să ruleze fără ele.
"""
import base64
import email
import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from email import policy
from pathlib import Path

from matcher import STORE_DOMAINS

GMAIL_QUERY = (
    'newer_than:12m -category:promotions '
    '(factura OR "factură" OR "factura fiscala" OR "factura ta" OR invoice OR chitanta)'
    + "".join(f" -from:{domain}" for domain in STORE_DOMAINS)  # magazine online: nu le descărcăm deloc
)


def build_query(sender: str | None = None) -> str:
    """Interogarea Gmail. Cu `sender`: doar mesajele primite de la acea adresă, fără alte filtre
    (titlul conține numele furnizorului, nu neapărat cuvântul „factura”). Fără: căutarea generală."""
    if sender:
        return f"from:{sender}"
    return GMAIL_QUERY


TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"

REQUEST_PAUSE = 0.3          # secunde între mesaje: nu depășim limita de unități pe minut
QUOTA_RETRY_DELAYS = (20, 40, 65)  # pauze la erori de cotă (fereastra Gmail e de un minut)


class QuotaExceeded(Exception):
    """Limita API-ului Gmail a rămas depășită și după reîncercări."""


def _is_quota_error(exc) -> bool:
    status = getattr(exc.resp, "status", 0)
    text = str(exc)
    return status == 429 or (
        status == 403
        and any(marker in text for marker in ("Quota exceeded", "rateLimitExceeded", "userRateLimitExceeded"))
    )


def _execute(request):
    """Execută o cerere Gmail; la erori de cotă așteaptă și reîncearcă, apoi ridică QuotaExceeded."""
    from googleapiclient.errors import HttpError

    for delay in (*QUOTA_RETRY_DELAYS, None):
        try:
            return request.execute()
        except HttpError as exc:
            if not _is_quota_error(exc):
                raise
            if delay is None:
                raise QuotaExceeded(str(exc)[:200]) from exc
            print(f"Limită Gmail atinsă; reîncerc peste {delay}s")
            time.sleep(delay)


def service_from_refresh_token(cfg: dict, refresh_token: str):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    google = cfg["google"]
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=google["client_id"],
        client_secret=google["client_secret"],
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def list_message_ids(service, max_results: int, sender: str | None = None) -> list[str]:
    query = build_query(sender)
    ids: list[str] = []
    page_token = None
    while len(ids) < max_results:
        resp = _execute(service.users().messages().list(
            userId="me", q=query, maxResults=min(100, max_results - len(ids)), pageToken=page_token,
        ))
        ids.extend(m["id"] for m in resp.get("messages", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


def _decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _walk_parts(service, message_id: str, part: dict, texts: list[str], pdfs: list[bytes]) -> None:
    mime = part.get("mimeType", "")
    body = part.get("body", {})
    if mime == "text/plain" and body.get("data"):
        texts.append(_decode(body["data"]).decode("utf-8", "replace"))
    elif mime == "text/html" and body.get("data") and not texts:
        html = _decode(body["data"]).decode("utf-8", "replace")
        texts.append(re.sub(r"<[^>]+>", " ", html))
    elif mime == "application/pdf" and body.get("attachmentId"):
        att = _execute(service.users().messages().attachments().get(
            userId="me", messageId=message_id, id=body["attachmentId"],
        ))
        pdfs.append(_decode(att["data"]))
    for sub in part.get("parts", []) or []:
        _walk_parts(service, message_id, sub, texts, pdfs)


def get_message(service, message_id: str) -> dict | None:
    """Aduce un mesaj; returnează None dacă Gmail îl refuză (400/404, ex: „Precondition check failed”)."""
    from googleapiclient.errors import HttpError

    try:
        return _fetch_message(service, message_id)
    except HttpError as exc:
        status = getattr(exc.resp, "status", 0)
        if status in (400, 404):
            print(f"Mesaj {message_id} sărit (HTTP {status}): {str(exc)[:150]}")
            return None
        raise


def _fetch_message(service, message_id: str) -> dict:
    msg = _execute(service.users().messages().get(userId="me", id=message_id, format="full"))
    time.sleep(REQUEST_PAUSE)
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    texts: list[str] = []
    pdfs: list[bytes] = []
    _walk_parts(service, message_id, msg.get("payload", {}), texts, pdfs)
    return {
        "id": message_id,
        "from": headers.get("from", ""),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "body": "\n".join(texts),
        "pdfs": pdfs,
    }


def parse_eml(path: Path) -> dict:
    """Citește un fișier .eml din demo_data/ în același format ca get_message()."""
    with open(path, "rb") as fh:
        msg = email.message_from_binary_file(fh, policy=policy.default)
    body_part = msg.get_body(preferencelist=("plain", "html"))
    body = body_part.get_content() if body_part else ""
    pdfs = []
    for part in msg.iter_attachments():
        if part.get_content_type() == "application/pdf":
            pdfs.append(part.get_payload(decode=True))
    return {
        "id": path.name,
        "from": str(msg.get("From", "")),
        "subject": str(msg.get("Subject", "")),
        "date": str(msg.get("Date", "")),
        "body": body,
        "pdfs": pdfs,
    }


def revoke_and_forget(conn: sqlite3.Connection, user_id: int, cfg: dict) -> None:
    """Revocă refresh token-ul la Google și îl șterge din baza de date."""
    row = conn.execute("SELECT refresh_token FROM oauth_tokens WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return
    data = urllib.parse.urlencode({"token": row[0]}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(REVOKE_URI, data=data), timeout=15).read()
    except Exception as exc:  # noqa: BLE001 - ștergem oricum din DB
        print(f"Avertisment: revocarea la Google a eșuat: {exc}")
    conn.execute("DELETE FROM oauth_tokens WHERE user_id = ?", (user_id,))
    conn.commit()
