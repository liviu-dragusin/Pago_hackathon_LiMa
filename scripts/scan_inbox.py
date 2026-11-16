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
import traceback
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import extractor  # noqa: E402
import gmail_client  # noqa: E402
import matcher  # noqa: E402

DB_PATH = ROOT / "data" / "app.sqlite"
CONFIG_PATH = ROOT / "config.json"
DEMO_DIR = ROOT / "demo_data"
MAX_EMAILS = 300


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
    ids = gmail_client.list_message_ids(service, MAX_EMAILS)
    return ids, lambda message_id: gmail_client.get_message(service, message_id)


def save_providers(conn: sqlite3.Connection, job_id: int, providers: list[dict]) -> None:
    for p in providers:
        conn.execute(
            """INSERT INTO discovered_providers
               (job_id, catalog_id, name, cui, iban, iban_valid, client_code, category,
                last_amount, currency, last_due_date, invoice_count, confidence, source_message_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, p["catalog_id"], p["name"], p["cui"], p["iban"], int(p["iban_valid"]),
                p["client_code"], p["category"], p["last_amount"], p["currency"], p["last_due_date"],
                p["invoice_count"], p["confidence"], p["source_message_id"],
            ),
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
        update_job(conn, job_id, total_emails=len(items))

        invoices = []
        for index, item in enumerate(items, start=1):
            message = fetch(item)
            if matcher.is_candidate(message):
                invoice = extractor.extract_invoice(message, cfg)
                if invoice:
                    invoices.append(invoice)
            if index % 3 == 0 or index == len(items):
                update_job(conn, job_id, processed=index)

        providers = matcher.group_invoices(invoices, conn)
        save_providers(conn, job_id, providers)
        update_job(conn, job_id, found=len(providers), status="done", finished_at=now())
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
