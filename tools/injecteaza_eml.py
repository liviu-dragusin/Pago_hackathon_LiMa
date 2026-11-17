#!/usr/bin/env python3
"""Introduce un fișier .eml direct în inbox-ul unui cont Gmail de test (IMAP APPEND).

Nu trimite nimic pe internet: mesajul apare în căsuța destinatarului ca și cum ar fi venit
prin Gmail, cu header-ele pe care le-ai scris în fișier. Util ca să testezi importul
din Gmail cu mailuri malițioase, fără spoofing real.

Implicit: DRY-RUN (doar afișează ce ar introduce). Introduce efectiv doar cu --trimite.

Utilizare:
    python tools/injecteaza_eml.py --eml modules/gmail-import/demo_data/07-enel-fals-spoofing.eml \
        --cont clientfictiv@gmail.com --trimite

Credențiale (din variabile de mediu, nu se scriu în script):
    GMAIL_APP_PASS   parola de aplicație a contului de test (nu parola contului)

Atenție: folosește doar conturi de test pe care le controlezi.
"""
import argparse
import imaplib
import os
import sys
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eml", required=True, help="fișierul .eml de introdus")
    ap.add_argument("--cont", required=True, help="adresa Gmail de test (destinatarul)")
    ap.add_argument("--folder", default="INBOX", help="implicit INBOX")
    ap.add_argument("--trimite", action="store_true", help="introduce efectiv mesajul")
    args = ap.parse_args()

    with open(args.eml, "rb") as fh:
        raw = fh.read()
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    print(f"Mesaj: {msg.get('Subject', '')}")
    print(f"De la: {msg.get('From', '')}")
    print(f"Auth:  {msg.get('Authentication-Results', '(lipsă)')}")

    if not args.trimite:
        print(f"\nDRY-RUN: nimic nu a fost introdus în {args.cont}. Adaugă --trimite ca să introduci.")
        return

    parola = os.environ.get("GMAIL_APP_PASS")
    if not parola:
        sys.exit("Setează GMAIL_APP_PASS (parola de aplicație a contului de test).")

    try:
        date = parsedate_to_datetime(str(msg.get("Date"))) if msg.get("Date") else None
    except (TypeError, ValueError):
        date = None
    internal_date = imaplib.Time2Internaldate(date.timestamp()) if date else None

    with imaplib.IMAP4_SSL("imap.gmail.com") as imap:
        imap.login(args.cont, parola)
        status, _ = imap.append(args.folder, None, internal_date, raw)
        if status != "OK":
            sys.exit(f"IMAP APPEND a eșuat: {status}")
    print(f"\nGata: mesajul a fost introdus în {args.folder} pentru {args.cont}.")
    print("Verifică în Gmail: ⋮ → Afișează originalul, și apoi rulează scanarea.")


if __name__ == "__main__":
    main()
