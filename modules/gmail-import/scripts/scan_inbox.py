#!/usr/bin/env python3
"""Scanează emailurile unui job, extrage facturile și salvează furnizorii propuși.

Utilizare:
    python scripts/scan_inbox.py --job-id 1           # Gmail real (necesită autorizare)
    python scripts/scan_inbox.py --job-id 1 --demo    # fișierele din demo_data/
"""
import argparse
import json
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

# Pe Windows, ieșirea redirecționată în fișier (log-ul worker-ului) folosește cp1252
# și nu poate scrie „ă”, „ș” etc.: forțăm UTF-8, ca un print să nu oprească scanarea.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

import extractor  # noqa: E402
import gmail_client  # noqa: E402
import matcher  # noqa: E402
import security  # noqa: E402

DB_PATH = ROOT / "data" / "app.sqlite"
CONFIG_PATH = ROOT / "config.json"
DEMO_DIR = ROOT / "demo_data"
MAX_EMAILS = 300
INVOICES_DIR = ROOT / "data" / "invoices"  # PDF-urile facturilor, servite de api.php


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def update_job(conn: sqlite3.Connection, job_id: int, **fields) -> None:
    assignments = ", ".join(f"{key} = ?" for key in fields)
    conn.execute(f"UPDATE scan_jobs SET {assignments} WHERE id = ?", (*fields.values(), job_id))
    conn.commit()


def build_source(job: sqlite3.Row, conn: sqlite3.Connection, cfg: dict):
    """Returnează (lista de elemente, funcția care aduce un mesaj după element)."""
    if job["mode"] == "demo":
        return sorted(DEMO_DIR.glob("*.eml")), gmail_client.parse_eml

    row = conn.execute("SELECT refresh_token FROM oauth_tokens WHERE user_id = ?", (job["user_id"],)).fetchone()
    if row is None:
        raise RuntimeError("Lipsește autorizarea Gmail pentru acest utilizator.")
    service = gmail_client.service_from_refresh_token(cfg, row["refresh_token"])
    ids = gmail_client.list_message_ids(service, MAX_EMAILS, security.trusted_senders(cfg))
    return ids, lambda message_id: gmail_client.get_message(service, message_id)


def store_invoice_pdfs(providers: list[dict], job: sqlite3.Row) -> None:
    """Scrie PDF-ul ultimei facturi al fiecărui furnizor pe disc și setează calea relativă la data/."""
    for index, p in enumerate(providers):
        pdf = p.pop("pdf", None)
        p["invoice_pdf_path"] = None
        if not pdf:
            continue
        relative = f"invoices/{job['user_id']}/{job['id']}_{index}.pdf"
        path = ROOT / "data" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pdf)
        p["invoice_pdf_path"] = relative


def save_providers(conn: sqlite3.Connection, job_id: int, providers: list[dict]) -> None:
    for p in providers:
        cursor = conn.execute(
            """INSERT INTO discovered_providers
               (job_id, catalog_id, name, cui, iban, iban_valid, client_code, category,
                last_amount, currency, last_due_date, invoice_count, confidence, source_message_id,
                invoice_pdf_path, sender_email, security_flag, security_reasons)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, p["catalog_id"], p["name"], p["cui"], p["iban"], int(p["iban_valid"]),
                p["client_code"], p["category"], p["last_amount"], p["currency"], p["last_due_date"],
                p["invoice_count"], p["confidence"], p["source_message_id"], p["invoice_pdf_path"],
                p["sender_email"], int(p["flagged"]), json.dumps(p["flag_reasons"], ensure_ascii=False),
            ),
        )
        for inv in p.get("invoices", []):
            conn.execute(
                """INSERT INTO discovered_invoices
                   (discovered_id, invoice_number, amount, currency, issued_at, due_date)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (cursor.lastrowid, inv["invoice_number"], inv["amount"], inv["currency"], inv["issued_at"], inv["due_date"]),
            )
    conn.commit()


def run(job_id: int, demo: bool) -> None:
    conn = connect()
    cfg = load_config()
    job = conn.execute("SELECT * FROM scan_jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise SystemExit(f"Jobul {job_id} nu există.")

    update_job(conn, job_id, status="running", started_at=now())
    try:
        items, fetch = build_source(job, conn, cfg)
        whitelist = security.trusted_senders(cfg)
        catalog = conn.execute("SELECT * FROM provider_catalog").fetchall()
        catalog_names = [r["name"] for r in catalog]
        print(f"Lista albă de expeditori: {', '.join(whitelist)}. Facturile de la alte adrese sunt flaguite.")
        update_job(conn, job_id, total_emails=len(items))

        invoices = []
        note = None
        seen: set[str] = set()
        detected: list[dict] = []  # furnizorii găsiți până acum; UI-ul îi afișează în timp real
        for index, item in enumerate(items, start=1):
            if job["mode"] == "demo":
                time.sleep(0.4)  # demo e instantaneu: încetinim ca detectarea live să se vadă în UI
            try:
                message = fetch(item)
            except gmail_client.QuotaExceeded:
                # Limita Gmail nu s-a eliberat: păstrăm ce am găsit până acum în loc să pierdem totul.
                note = f"Scanare parțială: limita Gmail a fost atinsă după {index - 1} din {len(items)} emailuri."
                print(note)
                break
            if message is not None and matcher.is_candidate(message):
                check = security.check_sender(message, whitelist, catalog_names)
                # Magazinele online nu sunt facturi pentru Pago; expeditorul de încredere nu se filtrează.
                skip = not check["trusted"] and matcher.is_online_store(message)
                # Doar la Gmail real, expeditorul de încredere pune numele furnizorului în titlu.
                invoice = None if skip else extractor.extract_invoice(
                    message, cfg, trusted_sender=check["trusted"] and job["mode"] != "demo"
                )
                if invoice and not check["trusted"]:
                    if not security.looks_like_bill(message, invoice, catalog):
                        invoice = None  # expeditor neaprobat, dar nu se dă drept factură: nu flaguim
                    elif not (invoice.get("amount") or invoice.get("iban") or invoice.get("category")):
                        # Fără date în corp: arătăm furnizorul pe care îl pretinde titlul, nu numele expeditorului.
                        invoice["provider_name"] = matcher.provider_from_subject(message["subject"]) or invoice["provider_name"]
                if invoice:
                    invoice["security"] = check
                    invoices.append(invoice)
                    key = matcher.normalize_name(invoice["provider_name"]) or invoice["provider_name"]
                    key = f"{key}|{check['sender']}" if not check["trusted"] else key
                    if key not in seen:
                        seen.add(key)
                        detected.append({
                            "name": invoice["provider_name"], "category": invoice.get("category"),
                            "flagged": not check["trusted"],
                        })
                        update_job(conn, job_id, detected=json.dumps(detected, ensure_ascii=False), processed=index)
            if index % 3 == 0 or index == len(items):
                update_job(conn, job_id, processed=index)

        providers = matcher.group_invoices(invoices, conn)
        store_invoice_pdfs(providers, job)
        save_providers(conn, job_id, providers)
        update_job(conn, job_id, found=len(providers), status="done", error=note, finished_at=now())
        print(f"Job {job_id}: {len(items)} emailuri, {len(invoices)} facturi, {len(providers)} furnizori.")
    except Exception as exc:  # noqa: BLE001 - salvăm eroarea în job pentru UI
        traceback.print_exc()
        update_job(conn, job_id, status="error", error=str(exc)[:500], finished_at=now())
    finally:
        if job["mode"] == "live":
            # Acces doar pe durata scanării: revocăm și ștergem token-ul, indiferent de rezultat.
            gmail_client.revoke_and_forget(conn, job["user_id"], cfg)
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--job-id", type=int, required=True)
    parser.add_argument("--demo", action="store_true", help="folosește demo_data/ în loc de Gmail")
    args = parser.parse_args()
    run(args.job_id, args.demo)


if __name__ == "__main__":
    main()
