"""Filtrare candidați, validare IBAN, potrivire cu catalogul și grupare pe furnizor."""
import re
import sqlite3
import unicodedata

KEYWORDS = re.compile(r"factur|invoice|chitan", re.IGNORECASE)
NAME_STOPWORDS = {"sa", "srl", "s", "a", "romania", "ro", "the", "de"}


def is_candidate(message: dict) -> bool:
    """Filtru ieftin înainte de LLM: cuvinte cheie în subiect/corp sau PDF atașat."""
    haystack = f"{message.get('subject', '')} {message.get('body', '')[:2000]}"
    return bool(message.get("pdfs")) or bool(KEYWORDS.search(haystack))


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
            "invoice_numbers": set(), "confidences": [], "source_message_id": None,
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
        })
    return providers
