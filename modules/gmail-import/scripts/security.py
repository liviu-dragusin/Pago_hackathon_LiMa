"""Nivelul de securitate al importului: lista albă (whitelist) de expeditori.

Doar adresele din `trusted_senders` (config.json) sunt de încredere. O factură primită de la orice
altă adresă nu e respinsă, ci FLAGUITĂ ca posibil malițioasă, cu motivele afișate în UI.
"""
import re
from email.utils import parseaddr
from pathlib import Path

import matcher

DEFAULT_TRUSTED = ("contact@mateimarius.ro",)
FREE_MAIL_DOMAINS = {"gmail.com", "yahoo.com", "yahoo.ro", "outlook.com", "hotmail.com", "mail.com"}


WHITELIST_FILE = Path(__file__).resolve().parent.parent / "whitelist.txt"


def trusted_senders(cfg: dict) -> list[str]:
    """Lista albă: whitelist.txt (o adresă pe linie, # = comentariu); în lipsă, `trusted_senders` /
    `sender_filter` din config.json; în lipsă, implicit demo."""
    raw = None
    if WHITELIST_FILE.is_file():
        lines = (ln.split("#", 1)[0] for ln in WHITELIST_FILE.read_text(encoding="utf-8").splitlines())
        raw = [ln for ln in lines if ln.strip()]
    raw = raw or cfg.get("trusted_senders") or cfg.get("sender_filter") or list(DEFAULT_TRUSTED)
    if isinstance(raw, str):
        raw = [raw]
    return [s.strip().lower() for s in raw if s and s.strip()]


def is_trusted(message: dict, whitelist: list[str]) -> bool:
    return parseaddr(message.get("from", ""))[1].strip().lower() in whitelist


def check_sender(message: dict, whitelist: list[str], catalog_names: list[str]) -> dict:
    """Verifică expeditorul. Returnează {sender, trusted, reasons}; `reasons` explică de ce e suspect."""
    display_name, address = parseaddr(message.get("from", ""))
    address = address.strip().lower()
    if address in whitelist:
        return {"sender": address, "trusted": True, "reasons": []}

    domain = address.rsplit("@", 1)[-1]
    reasons = [
        f"Expeditorul {address or '(necunoscut)'} nu este în lista albă de expeditori de încredere "
        f"({', '.join(whitelist)})."
    ]

    shown = matcher.normalize_name(display_name)
    if shown and any(
        shown == matcher.normalize_name(n) or matcher.normalize_name(n) in shown for n in catalog_names
    ):
        reasons.append(f"Numele afișat «{display_name}» imită un furnizor real, dar adresa nu aparține furnizorului.")
    if domain in FREE_MAIL_DOMAINS:
        reasons.append(f"Adresa folosește un cont de email gratuit ({domain}), nu domeniul unui furnizor.")
    if re.search(r"\d{4,}|-(?:facturi|plati|online|secure)\b|\.(?:top|xyz|click|info)$", domain):
        reasons.append(f"Domeniul {domain} arată ca unul creat pentru a păcăli (nume lung sau extensie suspectă).")
    return {"sender": address, "trusted": False, "reasons": reasons}


UTILITY_CATEGORIES = {"energie", "gaz", "apa", "salubritate", "telecom", "internet", "asigurare", "intretinere"}


def looks_like_bill(message: dict, invoice: dict, catalog: list) -> bool:
    """Pre-filtru pentru expeditorii neaprobați: flaguim doar ce se dă drept factură, ca inbox-ul
    să nu se umple de alerte pentru newslettere sau alte emailuri. Un email trece dacă:
    - titlul zice „factura/invoice” și conține un număr de factură (token cu cifre), SAU
    - furnizorul e din catalogul Pago ori categoria e de utilități, și are sumă sau IBAN."""
    subject = message.get("subject", "")
    if re.search(r"factur|invoice", subject, re.IGNORECASE) and re.search(r"\b(?=\w*\d)\w{4,}\b", subject):
        return True
    utility = bool(matcher._match_catalog(invoice, catalog)) or (invoice.get("category") or "") in UTILITY_CATEGORIES
    return utility and bool(invoice.get("amount") or invoice.get("iban"))
