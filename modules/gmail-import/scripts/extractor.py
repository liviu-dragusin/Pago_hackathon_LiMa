"""Extrage datele unei facturi dintr-un mesaj.

- Cu ANTHROPIC_API_KEY (în config.json): Claude Opus 5.5 citește PDF-ul/emailul și întoarce date structurate.
- Fără cheie: rezervă regex pe câmpurile „Furnizor:”, „CUI:”, „IBAN:” etc. (folosită la modul demo).
"""
import base64
import re
from email.utils import parseaddr

from pydantic import BaseModel

MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """Ești un asistent care extrage date din facturi românești.
Primești un email și, opțional, PDF-ul atașat.
- Dacă mesajul nu e o factură sau o notificare de plată, returnează is_invoice=false.
- Nu inventa valori. Dacă un câmp lipsește, pune null.
- IBAN-ul copiază-l exact, fără spații. Sumele sunt numere cu punct zecimal.
- due_date în format YYYY-MM-DD.
- category: energie, gaz, apa, salubritate, telecom, internet, asigurare, intretinere sau altele."""


class InvoiceData(BaseModel):
    is_invoice: bool
    provider_name: str | None
    cui: str | None
    iban: str | None
    client_code: str | None
    invoice_number: str | None
    amount: float | None
    currency: str | None
    due_date: str | None
    category: str | None
    confidence: float


def extract_invoice(message: dict, cfg: dict) -> dict | None:
    """Returnează un dict cu datele facturii sau None dacă mesajul nu e factură."""
    api_key = cfg.get("anthropic_api_key")
    data = _extract_with_claude(message, api_key) if api_key else _extract_with_rules(message)
    if data is None or not data.is_invoice or not data.provider_name:
        return None

    invoice = data.model_dump()
    invoice["source_message_id"] = message["id"]
    return invoice


def _extract_with_claude(message: dict, api_key: str) -> InvoiceData | None:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    content = []
    for pdf in message.get("pdfs", []):
        content.append({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(pdf).decode("ascii"),
            },
        })
    content.append({
        "type": "text",
        "text": f"De la: {message['from']}\nSubiect: {message['subject']}\nData: {message['date']}\n\n"
                f"{message['body'][:8000]}",
    })

    response = client.messages.parse(
        model=MODEL,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_format=InvoiceData,
    )
    return response.parsed_output


def _field(text: str, *labels: str) -> str | None:
    for label in labels:
        match = re.search(rf"^\s*{label}\s*[:\-]\s*(.+?)\s*$", text, re.MULTILINE | re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def _parse_amount(raw: str | None) -> float | None:
    if not raw:
        return None
    match = re.search(r"(\d[\d.]*,\d{2}|\d+(?:\.\d{2})?)", raw)
    if not match:
        return None
    number = match.group(1)
    if "," in number:
        number = number.replace(".", "").replace(",", ".")
    return float(number)


def _parse_date(raw: str | None) -> str | None:
    if not raw:
        return None
    iso = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if iso:
        return iso.group(0)
    ro = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", raw)
    return f"{ro.group(3)}-{ro.group(2)}-{ro.group(1)}" if ro else None


def _extract_with_rules(message: dict) -> InvoiceData:
    text = message["body"]
    subject = message["subject"]
    is_invoice = bool(re.search(r"factur|invoice", subject + " " + text, re.IGNORECASE))

    sender_name, sender_addr = parseaddr(message["from"])
    provider = _field(text, "Furnizor") or sender_name or sender_addr.split("@")[-1].split(".")[0].title()

    return InvoiceData(
        is_invoice=is_invoice,
        provider_name=provider,
        cui=_field(text, "CUI"),
        iban=(_field(text, "IBAN") or "").replace(" ", "") or None,
        client_code=_field(text, "Cod client"),
        invoice_number=_field(text, r"Nr\.? ?factur[aă]"),
        amount=_parse_amount(_field(text, r"Total de pl[aă]t[aă]")),
        currency="RON" if re.search(r"\bRON\b|\blei\b", text, re.IGNORECASE) else None,
        due_date=_parse_date(_field(text, r"Scaden[tț][aă]")),
        category=(_field(text, "Categorie") or "").lower() or None,
        confidence=0.6,  # regex: încredere mai mică decât la LLM
    )
