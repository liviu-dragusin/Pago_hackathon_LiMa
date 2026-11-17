#!/usr/bin/env python3
"""Verifică autenticitatea unor emailuri (.eml) înainte să le tratăm ca facturi de plătit.

Folosește doar biblioteca standard Python.

Utilizare:
    python tools/verifica_email.py mail.eml
    python tools/verifica_email.py modules/gmail-import/demo_data/      # tot folderul
    python tools/verifica_email.py mail.eml --json                      # ieșire JSON
    python tools/verifica_email.py mail.eml --dns                       # + SPF/DMARC din DNS (nslookup)

Verificări: SPF/DKIM/DMARC (header-ul Authentication-Results pus de Gmail), aliniere
From/Return-Path/Reply-To, domenii lookalike, registru de furnizori, link-uri suspecte,
IBAN (checksum + comparare cu registrul), limbaj de urgență, atașamente periculoase.

Cod de ieșire: 2 dacă măcar un mesaj e ROȘU, altfel 0.
"""
import argparse
import difflib
import json
import re
import subprocess
import sys
import unicodedata
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
from pathlib import Path
from urllib.parse import urlparse

REGISTRY_PATH = Path(__file__).with_name("furnizori_domenii.json")
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc"}
DANGEROUS_EXT = {".exe", ".scr", ".bat", ".cmd", ".js", ".vbs", ".jar", ".msi", ".lnk", ".iso", ".html", ".htm", ".docm", ".xlsm", ".zip", ".rar"}
URGENCY = re.compile(
    r"urgent|imediat|ultima (?:zi|avertizare|notificare)|in (?:cel mult )?\d+ ore|în (?:cel mult )?\d+ ore|"
    r"suspend|deconect|debransar|debranșar|blocat|penaliz|"
    r"verific(?:a|ă)(?:ți|ti)? (?:contul|datele)|actualiz(?:a|ă)(?:ți|ti)? datele|"
    r"confirm(?:a|ă)(?:ți|ti)? (?:identitatea|datele|cardul)",
    re.IGNORECASE,
)
URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)
# Doar valorile care urmează după cuvântul „IBAN”, ca să nu confundăm numerele de factură cu IBAN-uri.
IBAN_RE = re.compile(r"IBAN[ \t]*[:\-]?[ \t]*((?:[A-Z]{2}\d{2})(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?)\b", re.IGNORECASE)
ESP_HINTS = ("amazonses.com", "sendgrid.net", "mailgun.org", "mandrillapp.com", "sparkpostmail.com", "mcsv.net", "salesforce.com", "exacttarget.com")
HOMOGLYPHS = str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "4": "a", "@": "a", "$": "s"})


# ---------- utilitare ----------

def ascii_fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def base_domain(host: str) -> str:
    """Domeniul înregistrabil (euristic): ultimele 2 etichete, sau 3 pentru .com.ro / .co.uk etc."""
    parts = host.lower().strip(".").split(".")
    if len(parts) >= 3 and parts[-2] in {"com", "co", "org", "net", "gov"} and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else ".".join(parts)


def domain_of(addr: str) -> str:
    return addr.rsplit("@", 1)[-1].lower().strip("<> ") if "@" in addr else ""


def same_org(a: str, b: str) -> bool:
    return bool(a and b) and base_domain(a) == base_domain(b)


def validate_iban(iban: str) -> bool:
    iban = iban.replace(" ", "").upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", iban):
        return False
    if iban.startswith("RO") and len(iban) != 24:
        return False
    return int("".join(str(int(c, 36)) for c in iban[4:] + iban[:4])) % 97 == 1


def lookalike_of(domain: str, trusted: set[str]) -> str | None:
    """Domeniul de încredere pe care `domain` îl imită, dacă e cazul."""
    base = base_domain(domain)
    if base in trusted:
        return None
    label = base.split(".")[0]
    for t in trusted:
        t_label = t.split(".")[0]
        norm = label.translate(HOMOGLYPHS).replace("-", "").replace("rn", "m")
        if norm == t_label and label != t_label:
            return t
        if len(t_label) >= 4 and t_label in label.replace("-", ""):
            return t  # ex: enel-energie.ro, enelfacturi.com
        if label != t_label and difflib.SequenceMatcher(None, label, t_label).ratio() >= 0.8:
            return t
    return None


def load_registry() -> list[dict]:
    if not REGISTRY_PATH.exists():
        return []
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8")).get("furnizori", [])


# ---------- parsare mesaj ----------

def get_body_parts(msg) -> tuple[str, str]:
    text, html = "", ""
    for part in msg.walk():
        if part.get_content_disposition() == "attachment":
            continue
        try:
            if part.get_content_type() == "text/plain":
                text += part.get_content()
            elif part.get_content_type() == "text/html":
                html += part.get_content()
        except Exception:
            continue
    return text, html


def extract_links(text: str, html: str) -> list[tuple[str, str | None]]:
    """(url, text afișat) — textul afișat există doar pentru <a href>."""
    links = []
    for m in re.finditer(r'<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL):
        links.append((m.group(1).strip(), re.sub(r"<[^>]+>", "", m.group(2)).strip()))
    seen = {u for u, _ in links}
    for u in URL_RE.findall(text + " " + html):
        if u not in seen:
            links.append((u, None))
            seen.add(u)
    return [(u, t) for u, t in links if u.lower().startswith("http")]


def parse_auth_results(msg) -> dict:
    """Verdictele spf/dkim/dmarc din Authentication-Results (primul header = cel pus de serverul tău, ex. Gmail)."""
    res = {"spf": None, "dkim": None, "dmarc": None}
    for header in msg.get_all("Authentication-Results", []):
        for key in res:
            m = re.search(rf"\b{key}=(\w+)", str(header), re.IGNORECASE)
            if m and res[key] is None:
                res[key] = m.group(1).lower()
    if res["spf"] is None:
        m = re.match(r"\s*(\w+)", str(msg.get("Received-SPF", "")))
        if m:
            res["spf"] = m.group(1).lower()
    return res


def dkim_domains(msg) -> list[str]:
    out = []
    for h in msg.get_all("DKIM-Signature", []):
        m = re.search(r"\bd=([^;\s]+)", str(h))
        if m:
            out.append(m.group(1).lower())
    return out


def dns_txt(name: str) -> list[str]:
    try:
        out = subprocess.run(["nslookup", "-type=TXT", name], capture_output=True, text=True, timeout=8).stdout
        return re.findall(r'"([^"]+)"', out)
    except Exception:
        return []


# ---------- analiza ----------

class Report:
    def __init__(self):
        self.score = 0
        self.findings: list[tuple[int, str]] = []

    def add(self, points: int, message: str):
        self.score += points
        self.findings.append((points, message))


def analyze(path: Path, use_dns: bool = False) -> dict:
    with path.open("rb") as fh:
        msg = BytesParser(policy=policy.default).parse(fh)
    registry = load_registry()
    trusted = {d.lower() for p in registry for d in p["domenii"]}
    rep = Report()

    parsed_from = getaddresses([str(msg.get("From", ""))]) or [("", "")]
    from_name, from_addr = parsed_from[0]
    from_dom = domain_of(from_addr)
    return_dom = domain_of(str(msg.get("Return-Path", "")))
    reply_addrs = getaddresses([str(msg.get("Reply-To", ""))])
    reply_dom = domain_of(reply_addrs[0][1]) if reply_addrs and reply_addrs[0][1] else ""
    text, html = get_body_parts(msg)
    body = text or re.sub(r"<[^>]+>", " ", html)
    subject = str(msg.get("Subject", ""))

    # 1. Autentificare SPF/DKIM/DMARC
    auth = parse_auth_results(msg)
    if all(v is None for v in auth.values()):
        rep.add(10, "Lipsește Authentication-Results: SPF/DKIM/DMARC nu pot fi verificate (normal la .eml de test, suspect în Gmail real)")
    else:
        if auth["dmarc"] == "fail":
            rep.add(60, "DMARC a picat: expeditorul nu e autorizat de domeniul pe care îl pretinde")
        if auth["spf"] in {"fail", "softfail"}:
            rep.add(25, f"SPF={auth['spf']}: serverul de trimitere nu e autorizat pentru domeniu")
        if auth["dkim"] == "fail":
            rep.add(30, "DKIM a picat: mesajul a fost modificat sau semnătura e falsă")
        elif auth["dkim"] is None and auth["dmarc"] != "pass":
            rep.add(10, "Mesaj fără semnătură DKIM validă")
    dk = dkim_domains(msg)
    if dk and not any(same_org(d, from_dom) for d in dk):
        rep.add(20, f"Semnat DKIM de {', '.join(dk)}, nu de domeniul expeditorului ({from_dom})")

    # 2. Aliniere header-e
    if return_dom and not same_org(return_dom, from_dom) and not any(return_dom.endswith(e) for e in ESP_HINTS):
        rep.add(10, f"Return-Path ({return_dom}) diferă de From ({from_dom})")
    if reply_dom and not same_org(reply_dom, from_dom):
        rep.add(25, f"Reply-To duce către alt domeniu ({reply_dom}) decât From ({from_dom})")
    if "xn--" in from_dom:
        rep.add(40, "Domeniul expeditorului folosește punycode (posibile caractere false)")

    # 3. Registru de furnizori
    claimed = None
    name_fold = ascii_fold(f"{from_name} {subject}")
    for p in registry:
        if any(re.search(rf"\b{re.escape(n)}\b", name_fold) for n in p["nume"]):
            claimed = p
            break
    in_registry = base_domain(from_dom) in trusted
    spoof = lookalike_of(from_dom, trusted)
    if spoof:
        rep.add(60, f"Domeniul {from_dom} imită domeniul oficial {spoof}")
    elif claimed and not in_registry:
        rep.add(50, f"Pretinde a fi „{claimed['slug']}” dar domeniul {from_dom} nu e al furnizorului ({', '.join(claimed['domenii'])})")
    elif not in_registry:
        rep.add(15, f"Domeniul {from_dom} nu e în registrul de furnizori (cere confirmarea utilizatorului)")
    provider = next((p for p in registry if base_domain(from_dom) in p["domenii"]), None)
    provider_domains = set(provider["domenii"]) if provider else set()

    if use_dns and from_dom:
        root = base_domain(from_dom)
        if not any(t.lower().startswith("v=spf1") for t in dns_txt(root)):
            rep.add(10, f"{root} nu are înregistrare SPF în DNS")
        if not any("v=dmarc1" in t.lower() for t in dns_txt("_dmarc." + root)):
            rep.add(10, f"{root} nu are politică DMARC în DNS")

    # 4. Link-uri
    for url, shown in extract_links(text, html):
        host = (urlparse(url).hostname or "").lower()
        if not host:
            continue
        look = lookalike_of(host, trusted)
        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
            rep.add(30, f"Link către adresă IP: {url[:80]}")
        elif host in SHORTENERS:
            rep.add(20, f"Link scurtat ({host}) ascunde destinația reală")
        elif "xn--" in host:
            rep.add(30, f"Link cu domeniu punycode: {host}")
        elif look:
            rep.add(50, f"Link către domeniu lookalike {host} (imită {look})")
        elif provider and not any(same_org(host, d) for d in provider_domains | {from_dom}):
            rep.add(25, f"Link către {host}, care nu aparține furnizorului ({from_dom})")
        if shown:
            m = re.search(r"(?:https?://)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)", shown.lower())
            if m and not same_org(m.group(1), host):
                rep.add(40, f"Textul link-ului arată {m.group(1)} dar duce la {host}")

    # 5. IBAN
    ibans = {m.group(1).replace(" ", "").upper() for m in IBAN_RE.finditer(body)}
    known = {i.replace(" ", "").upper() for i in (provider or {}).get("iban", [])}
    for iban in ibans:
        if not validate_iban(iban):
            rep.add(40, f"IBAN invalid (checksum): {iban}")
        elif known and iban not in known:
            rep.add(50, f"IBAN {iban} nu e printre cele cunoscute ale furnizorului — posibilă schimbare de cont")
    if len(ibans) > 1:
        rep.add(20, f"Mai multe IBAN-uri în mesaj ({len(ibans)})")

    # 6. Urgență
    if URGENCY.search(f"{subject} {body}"):
        rep.add(10, "Limbaj de urgență / amenințare cu deconectarea")

    # 7. Atașamente
    for part in msg.iter_attachments():
        name = (part.get_filename() or "").lower()
        if Path(name).suffix in DANGEROUS_EXT:
            rep.add(40, f"Atașament cu extensie riscantă: {name}")
        elif re.search(r"\.(pdf|docx?|xlsx?)\.\w+$", name):
            rep.add(40, f"Atașament cu dublă extensie: {name}")

    level = "ROȘU" if rep.score >= 50 else "GALBEN" if rep.score >= 20 else "VERDE"
    return {
        "fisier": path.name, "de_la": f"{from_name} <{from_addr}>", "subiect": subject,
        "auth": auth, "furnizor_recunoscut": provider["slug"] if provider else None,
        "scor": rep.score, "verdict": level,
        "motive": [m for _, m in sorted(rep.findings, key=lambda x: -x[0])],
    }


def print_report(r: dict):
    icon = {"VERDE": "🟢", "GALBEN": "🟡", "ROȘU": "🔴"}[r["verdict"]]
    a = r["auth"]
    print(f"\n{icon} {r['verdict']}  (scor risc {r['scor']})  —  {r['fisier']}")
    print(f"   De la:   {r['de_la']}")
    print(f"   Subiect: {r['subiect']}")
    print(f"   SPF={a['spf'] or '?'}  DKIM={a['dkim'] or '?'}  DMARC={a['dmarc'] or '?'}  |  furnizor: {r['furnizor_recunoscut'] or 'necunoscut'}")
    for m in r["motive"]:
        print(f"   • {m}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cale", nargs="+", help="fișiere .eml sau foldere")
    ap.add_argument("--json", action="store_true", help="ieșire JSON")
    ap.add_argument("--dns", action="store_true", help="verifică și SPF/DMARC în DNS (necesită internet)")
    args = ap.parse_args()

    files: list[Path] = []
    for c in map(Path, args.cale):
        files += sorted(c.glob("*.eml")) if c.is_dir() else [c]
    if not files:
        sys.exit("Nu am găsit fișiere .eml")
    sys.stdout.reconfigure(encoding="utf-8")
    results = [analyze(f, args.dns) for f in files]
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            print_report(r)
    sys.exit(2 if any(r["verdict"] == "ROȘU" for r in results) else 0)


if __name__ == "__main__":
    main()
