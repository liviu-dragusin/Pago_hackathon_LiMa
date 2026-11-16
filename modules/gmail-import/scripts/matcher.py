"""Filtrare candidați, validare IBAN, potrivire cu catalogul și grupare pe furnizor."""
import re
import sqlite3
import unicodedata
from email.utils import parseaddr

KEYWORDS = re.compile(r"factur|invoice|chitan", re.IGNORECASE)
NAME_STOPWORDS = {"sa", "srl", "s", "a", "romania", "ro", "the", "de"}

# Pago gestionează doar facturi recurente (utilități, servicii). Magazinele online și
# retailerii trimit „factura ta” pentru comenzi, deci îi excludem înainte de LLM.
STORE_DOMAINS = (
    "sportisimo.ro", "douglas.ro", "emag.ro", "fashiondays.ro", "zalando.ro", "answear.ro",
    "decathlon.ro", "altex.ro", "flanco.ro", "notino.ro", "pepco.ro", "libris.ro",
    "ikea.ro", "shein.com", "temu.com", "aliexpress.com", "amazon.com", "amazon.de",
    "amazon.co.uk", "amazon.fr",
)
STORE_NAMES = (
    "sportisimo", "douglas", "emag", "fashion days", "zalando", "answear", "decathlon",
    "altex", "flanco", "notino", "pepco", "libris", "ikea", "shein", "temu", "aliexpress", "amazon",
)


def is_candidate(message: dict) -> bool:
    """Filtru ieftin înainte de LLM: cuvinte cheie în subiect/corp sau PDF atașat."""
    haystack = f"{message.get('subject', '')} {message.get('body', '')[:2000]}"
    return bool(message.get("pdfs")) or bool(KEYWORDS.search(haystack))


def is_online_store(message: dict) -> bool:
    """Expeditorul e un magazin online/retailer din lista de excludere (domeniu sau nume)."""
    display_name, address = parseaddr(message.get("from", ""))
    domain = address.rsplit("@", 1)[-1].lower()
    if any(domain == d or domain.endswith("." + d) for d in STORE_DOMAINS):
        return True
    padded = f" {normalize_name(display_name)} "
    return any(f" {name} " in padded for name in STORE_NAMES)


def is_from_sender(message: dict, sender: str | None) -> bool:
    """Mesajul e trimis exact de adresa `sender` (fără sender configurat, orice expeditor e acceptat)."""
    if not sender:
        return True
    return parseaddr(message.get("from", ""))[1].strip().lower() == sender.strip().lower()


# Titlul unui email de factură conține numele furnizorului, înconjurat de cuvinte de umplutură
# („Factura”, „nr.”, luna, anul, numărul facturii...). Le scoatem și ce rămâne e furnizorul.
SUBJECT_TAGS = re.compile(r"^\s*(?:\[[^\]]*\]\s*|(?:re|fw|fwd|rv)\s*:\s*)+", re.IGNORECASE)
SUBJECT_TOKEN = re.compile(r"[^\W_]+(?:[.&'\-][^\W_]+)*")
SUBJECT_NOISE = {
    "factura", "facturi", "facturii", "fiscala", "fiscal", "invoice", "invoices", "bill", "receipt",
    "chitanta", "chitante", "plata", "nota", "de", "din", "la", "pentru", "luna", "lunii", "nr", "no",
    "numar", "from", "for", "your", "ta", "noua", "emisa", "scadenta", "pdf", "atasat", "atasata",
    "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie",
    "octombrie", "noiembrie", "decembrie",
}


def _ascii_lower(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def provider_from_subject(subject: str | None) -> str | None:
    """Numele furnizorului din titlul emailului, ex: „Factura Enel nr. 4471293 - noiembrie 2026” -> „Enel”."""
    if not subject:
        return None
    cleaned = SUBJECT_TAGS.sub("", subject)
    words = []
    for token in SUBJECT_TOKEN.findall(cleaned):
        if any(ch.isdigit() for ch in token) or _ascii_lower(token) in SUBJECT_NOISE:
            continue
        words.append(token)
    name = " ".join(words).strip()
    return name[:80] or None


def normalize_name(name: str | None) -> str:
    if not name:
        return ""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    words = re.findall(r"[a-z0-9]+", ascii_name)
    return " ".join(w for w in words if w not in NAME_STOPWORDS)


def validate_iban(iban: str | None) -> bool:
    """Verificare IBAN mod-97 (ISO 13616)."""
    if not iban:
        return False
    iban = iban.replace(" ", "").upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", iban):
        return False
    rearranged = iban[4:] + iban[:4]
    numeric = "".join(str(int(c, 36)) for c in rearranged)
    return int(numeric) % 97 == 1


def _match_catalog(invoice: dict, catalog: list[sqlite3.Row]):
    """Potrivire: CUI, apoi nume normalizat (egalitate sau includere)."""
    if invoice.get("cui"):
        for row in catalog:
            if row["cui"] and row["cui"] == invoice["cui"]:
                return row
    target = normalize_name(invoice.get("provider_name"))
    if not target:
        return None
    for row in catalog:
        candidate = normalize_name(row["name"])
        if target == candidate or (len(candidate) >= 4 and (candidate in target or target in candidate)):
            return row
    return None


def group_invoices(invoices: list[dict], conn: sqlite3.Connection) -> list[dict]:
    """Grupează facturile pe furnizor și alege ultima factură (scadența cea mai recentă)."""
    catalog = conn.execute("SELECT * FROM provider_catalog").fetchall()
    groups: dict[str, dict] = {}

    for inv in invoices:
        catalog_row = _match_catalog(inv, catalog)
        key = (catalog_row["name"] if catalog_row else normalize_name(inv.get("provider_name"))) or "necunoscut"
        group = groups.setdefault(key, {
            "catalog_id": catalog_row["id"] if catalog_row else None,
            "name": catalog_row["name"] if catalog_row else (inv.get("provider_name") or key),
            "cui": None, "iban": None, "client_code": "", "category": None,
            "last_amount": None, "currency": "RON", "last_due_date": None,
            "invoice_numbers": set(), "confidences": [], "source_message_id": None, "pdf": None,
        })
        group["invoice_numbers"].add(inv.get("invoice_number") or inv["source_message_id"])
        group["confidences"].append(inv.get("confidence") or 0.0)
        group["cui"] = group["cui"] or inv.get("cui")
        group["iban"] = group["iban"] or inv.get("iban")
        group["client_code"] = group["client_code"] or (inv.get("client_code") or "")
        group["category"] = group["category"] or inv.get("category")

        due = inv.get("due_date") or ""
        if group["last_due_date"] is None or due >= group["last_due_date"]:
            group["last_due_date"] = due or group["last_due_date"]
            group["last_amount"] = inv.get("amount")
            group["currency"] = inv.get("currency") or "RON"
            group["source_message_id"] = inv["source_message_id"]
            group["pdf"] = inv.get("pdf")

    providers = []
    for group in groups.values():
        iban_ok = validate_iban(group["iban"])
        confidence = sum(group["confidences"]) / len(group["confidences"])
        if group["iban"] and not iban_ok:
            confidence *= 0.5  # IBAN invalid: încredere redusă, utilizatorul verifică
        providers.append({
            "catalog_id": group["catalog_id"],
            "name": group["name"],
            "cui": group["cui"],
            "iban": group["iban"],
            "iban_valid": iban_ok,
            "client_code": group["client_code"],
            "category": group["category"],
            "last_amount": group["last_amount"],
            "currency": group["currency"],
            "last_due_date": group["last_due_date"] or None,
            "invoice_count": len(group["invoice_numbers"]),
            "confidence": round(confidence, 2),
            "source_message_id": group["source_message_id"],
            "pdf": group["pdf"],  # bytes; scan_inbox îl scrie pe disc și îl elimină din dict
        })
    return providers
