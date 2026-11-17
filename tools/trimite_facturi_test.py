#!/usr/bin/env python3
"""Trimite facturile de test (generate de genereaza_facturi_test.py) pe email, câte una per mesaj.

Implicit: DRY-RUN (doar afișează ce ar trimite). Trimite efectiv doar cu --trimite.

Utilizare:
    python tools/trimite_facturi_test.py --catre colega@exemplu.ro                 # dry-run
    python tools/trimite_facturi_test.py --catre colega@exemplu.ro --trimite       # trimite 15 emailuri
    python tools/trimite_facturi_test.py --catre colega@exemplu.ro --luni 3 --trimite

Scenarii malițioase (trimit UN singur mesaj, ultima factură a furnizorului ales cu --furnizor):
    python tools/trimite_facturi_test.py --catre colega@exemplu.ro --scenariu spoof \
        --de-la contact@mateimarius.ro --furnizor electrica --trimite
    --scenariu: normal (implicit) | spoof | reply-to | nume-fals | iban-schimbat
    --de-la:    adresa din antetul From. Pentru "spoof" adaugă-o în Gmail ca alias
                (Setări → Conturi → Trimite mesaje ca); Gmail o semnează cu gmail.com,
                deci pică DMARC pentru domeniul tău. Fără alias, Gmail rescrie From.
Mesajul „legitim” (SPF/DKIM trec) trebuie trimis prin serverul propriu al domeniului:
SMTP_HOST=<serverul tău> SMTP_USER=contact@mateimarius.ro ... --scenariu normal

Credențiale SMTP, din variabile de mediu (nu se scriu în script):
    SMTP_USER   adresa ta Gmail
    SMTP_PASS   parola de aplicație Gmail (nu parola contului)
    SMTP_HOST   opțional, implicit smtp.gmail.com
    SMTP_PORT   opțional, implicit 465 (SSL)

Ultimele N luni din _istoric_asteptat.csv, pentru toți furnizorii (5 × N emailuri).
"""
import csv
import os
import smtplib
import sys
from email.message import EmailMessage

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
DIR_FACTURI = os.path.join(HERE, "facturi_test")
CSV_PATH = os.path.join(DIR_FACTURI, "_istoric_asteptat.csv")


def opt(name, default=None):
    argv = sys.argv[1:]
    return argv[argv.index(name) + 1] if name in argv else default


def incarca_facturi(luni):
    with open(CSV_PATH, encoding="utf-8-sig") as fh:
        randuri = list(csv.DictReader(fh, delimiter=";"))
    perioade = sorted({r["perioada"] for r in randuri})[-luni:]
    return [r for r in randuri if r["perioada"] in perioade]


SCENARII = ("normal", "spoof", "reply-to", "nume-fals", "iban-schimbat")
IBAN_FALS = "RO50BTRL0000000000099871"  # IBAN valid (mod-97), dar al „atacatorului”
REPLY_TO_FALS = "relatii-clienti@gmail.com"


def construieste_mesaj(r, de_la, catre, scenariu="normal"):
    msg = EmailMessage()
    # La scenariile malițioase numele afișat imită furnizorul, iar subiectul poartă [DEMO].
    msg["From"] = de_la if scenariu == "normal" else f"{r['furnizor']} <{de_la}>"
    msg["To"] = catre
    prefix = "" if scenariu == "normal" else "[DEMO] "
    if scenariu == "spoof":
        prefix += "URGENT: "
    msg["Subject"] = f"{prefix}Factura {r['nr_factura']} – {r['furnizor']} – {r['perioada']}"
    if scenariu == "reply-to":
        msg["Reply-To"] = REPLY_TO_FALS
    corp = (
        f"Bună,\n\nAtașat găsești factura {r['nr_factura']} emisă de {r['furnizor']} "
        f"pentru perioada {r['perioada']}, total {r['total_ron']} RON.\n\n"
    )
    if scenariu == "spoof":
        corp += "Factura este restantă. Dacă nu achitați în 24 de ore, vom deconecta serviciul.\n\n"
    if scenariu == "iban-schimbat":
        corp += f"Ne-am schimbat banca. Plata se face de acum în contul nou:\nIBAN: {IBAN_FALS}\n\n"
    msg.set_content(corp + "Factură de test generată automat (date fictive).\n")
    pdf_path = os.path.join(DIR_FACTURI, r["fisier"])
    with open(pdf_path, "rb") as fh:
        msg.add_attachment(fh.read(), maintype="application", subtype="pdf", filename=r["fisier"])
    return msg


def main():
    catre = opt("--catre")
    luni = int(opt("--luni", 3))
    trimite = "--trimite" in sys.argv
    scenariu = opt("--scenariu", "normal")
    furnizor = (opt("--furnizor", "electrica") or "").lower()
    if scenariu not in SCENARII:
        sys.exit(f"--scenariu invalid. Alege dintre: {', '.join(SCENARII)}.")

    if not catre:
        sys.exit("Lipsește --catre <adresa colegului>.")
    if not os.path.exists(CSV_PATH):
        sys.exit(f"Nu găsesc {CSV_PATH}. Rulează întâi tools/genereaza_facturi_test.py.")

    facturi = incarca_facturi(luni)
    if scenariu != "normal":
        potrivite = [r for r in facturi if furnizor in r["furnizor"].lower()]
        if not potrivite:
            sys.exit(f"Niciun furnizor care conține „{furnizor}”.")
        facturi = potrivite[-1:]  # doar ultima factură
    print(f"{len(facturi)} emailuri (câte o factură), scenariu „{scenariu}”, către {catre}:")
    for r in facturi:
        print(f"  {r['perioada']}  {r['furnizor']:<45} {r['total_ron']:>10} RON  {r['fisier']}")

    if not trimite:
        print("\nDRY-RUN: nimic nu a fost trimis. Adaugă --trimite ca să trimiți efectiv.")
        return

    de_la = os.environ.get("SMTP_USER")
    parola = os.environ.get("SMTP_PASS")
    if not de_la or not parola:
        sys.exit("Setează SMTP_USER și SMTP_PASS (parola de aplicație) înainte de --trimite.")
    de_la_antet = opt("--de-la", de_la)
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))

    with smtplib.SMTP_SSL(host, port) as smtp:
        smtp.login(de_la, parola)
        for r in facturi:
            smtp.send_message(construieste_mesaj(r, de_la_antet, catre, scenariu))
            print(f"trimis: {r['fisier']}")
    print(f"\nGata: {len(facturi)} emailuri trimise către {catre}.")


if __name__ == "__main__":
    main()
