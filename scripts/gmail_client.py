"""Acces Gmail (doar citire) pentru scanarea unică a facturilor.

Bibliotecile Google sunt importate leneș, ca modul demo să ruleze fără ele.
"""
import base64
import email
import json
import re
import sqlite3
import urllib.parse
import urllib.request
from email import policy
from pathlib import Path

GMAIL_QUERY = (
    'newer_than:12m -category:promotions '
    '(factura OR "factură" OR "factura fiscala" OR "factura ta" OR invoice OR chitanta)'
)
TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"


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


def list_message_ids(service, max_results: int) -> list[str]:
    ids: list[str] = []
    page_token = None
    while len(ids) < max_results:
        resp = service.users().messages().list(
            userId="me", q=GMAIL_QUERY, maxResults=min(100, max_results - len(ids)), pageToken=page_token,
        ).execute()
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
        att = service.users().messages().attachments().get(
            userId="me", messageId=message_id, id=body["attachmentId"],
        ).execute()
        pdfs.append(_decode(att["data"]))
    for sub in part.get("parts", []) or []:
        _walk_parts(service, message_id, sub, texts, pdfs)


def get_message(service, message_id: str) -> dict:
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
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
