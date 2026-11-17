#!/usr/bin/env python3
"""Generează un ISTORIC de facturi de test (PDF + cod de bare Code128), lunar, pentru 5 furnizori:
Vodafone, Distrigaz, Electrica, Apa Nova, Salubritate.

Utilizare:
    pip install reportlab
    python tools/genereaza_facturi_test.py                 # ultimele 12 luni, până la luna trecută
    python tools/genereaza_facturi_test.py --luni 24       # istoric mai lung
    python tools/genereaza_facturi_test.py --pana-la 2026-10
    python tools/genereaza_facturi_test.py --anomalie      # ultima factură Apa Nova ×1,7 (pierdere/avarie)
    python tools/genereaza_facturi_test.py --seed 7 --out C:\\calea\\dorita

Ce e „relevant” în date (ca să se potrivească cu modelele din api/lib/predict.php):
  * Distrigaz: consumul de gaz urmează temperaturile REALE din București (Open-Meteo, aceleași ca în aplicație),
    deci iarna e mult mai mare decât vara -> funcționează modelul meteo (bază + cost/HDD) și cel sezonier.
  * Electrica: consum aproape constant, cu vârf vara (aer condiționat) și puțin iarna.
  * Apa Nova: consum stabil cu mici variații; indexare tarife în ianuarie.
  * Salubritate: sumă fixă pe persoană, schimbată doar la indexarea din ianuarie.
  * Vodafone: CONTRACT FIX -> aceeași sumă TOTALĂ în fiecare lună (prețul include TVA; se schimbă doar
    împărțirea net/TVA când TVA a crescut la 21% din 1 aug. 2025).
Toate datele sunt fictive. Clientul e același în toate lunile (cod client constant per furnizor).
Fără internet, temperaturile se aproximează cu normalele climatice.
"""
import json
import os
import random
import sys
import urllib.request
from calendar import monthrange
from datetime import date, timedelta

from reportlab.graphics.barcode import code128
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- font cu diacritice ----------
FONT, FONT_B = "Helvetica", "Helvetica-Bold"
for reg, bold in [
    (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]:
    if os.path.exists(reg) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont("Body", reg))
        pdfmetrics.registerFont(TTFont("Body-B", bold))
        FONT, FONT_B = "Body", "Body-B"
        break

LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie",
        "octombrie", "noiembrie", "decembrie"]

# ---------- client (același în tot istoricul; se potrivește cu utilizatorul demo din api/seed.php) ----------
CLIENT = dict(nume="Andrei Popescu", strada="Str. Livezilor nr. 12, bl. C4, sc. 2, et. 3, ap. 27",
              oras="București", judet="Sector 3")

# ---------- vreme: HDD real (Open-Meteo, București) cu cache; fallback normale climatice ----------
NORMALE = {1: -1.5, 2: 0.5, 3: 5.0, 4: 10.8, 5: 16.0, 6: 20.0, 7: 22.0, 8: 21.5, 9: 16.5, 10: 10.8, 11: 5.0, 12: 0.2}
HDD_BASE = 18.0


def zile_in_luna(p):
    return monthrange(int(p[:4]), int(p[5:7]))[1]


def hdd_lunar(perioade, rnd):
    """{perioada: HDD}. Încearcă Open-Meteo (doar coordonatele Bucureștiului), apoi cache, apoi normale."""
    cache = os.path.join(HERE, ".cache_meteo_bucuresti.json")
    zile = {}
    if os.path.exists(cache):
        try:
            zile = json.load(open(cache, encoding="utf-8"))
        except Exception:
            zile = {}
    start = f"{perioade[0]}-01"
    end = min(date(int(perioade[-1][:4]), int(perioade[-1][5:7]), zile_in_luna(perioade[-1])),
              date.today() - timedelta(days=3)).isoformat()
    lipsa = [p for p in perioade if sum(1 for d in zile if d.startswith(p)) < zile_in_luna(p)]
    if lipsa and start <= end:
        url = ("https://archive-api.open-meteo.com/v1/archive?latitude=44.43&longitude=26.10"
               f"&start_date={start}&end_date={end}&daily=temperature_2m_mean&timezone=auto")
        try:
            data = json.load(urllib.request.urlopen(url, timeout=15))
            for d, t in zip(data["daily"]["time"], data["daily"]["temperature_2m_mean"]):
                if t is not None:
                    zile[d] = t
            json.dump(zile, open(cache, "w", encoding="utf-8"))
            print("Vreme: temperaturi reale Open-Meteo (București).")
        except Exception as e:
            print(f"Vreme: fără internet/eroare ({e}); folosesc normale climatice pentru zilele lipsă.")
    out = {}
    for p in perioade:
        n = zile_in_luna(p)
        offset = rnd.uniform(-1.5, 1.5)  # luna întreagă mai caldă/rece decât normala, dacă lipsesc date
        total = 0.0
        for d in range(1, n + 1):
            t = zile.get(f"{p}-{d:02d}")
            if t is None:
                t = NORMALE[int(p[5:7])] + offset
            total += max(0.0, HDD_BASE - t)
        out[p] = total
    return out


# ---------- TVA și tarife (valori ilustrative) ----------
def tva(furn, p):
    dupa = p >= "2025-08"  # creșterea TVA din 1 aug. 2025
    if furn == "vodafone":
        return 0.21 if dupa else 0.19
    return 0.11 if dupa else 0.09  # cota redusă: gaz, curent, apă, salubritate


def treapta(p, pre25, iul25, ian26):
    """Alege tariful după perioadă (indexări iulie 2025 și ianuarie 2026)."""
    return ian26 if p >= "2026-01" else iul25 if p >= "2025-07" else pre25


def zgomot(rnd, pct):
    return 1 + rnd.uniform(-pct, pct)


# ---------- furnizori ----------
FURNIZORI = {
    "vodafone": dict(
        nume="Vodafone România S.A.", cui="RO8971726", reg="J40/1585/1997", iban="RO49RNCB0082006162450001",
        adresa="Str. Barbu Văcărescu nr. 201, Sector 2, București", categorie="telecom",
        culoare=(0.90, 0.0, 0.04), prefix="VF", cod_client="71840593", zi_emitere=(3, 3), scadenta=15,
        mod="inainte"),
    "distrigaz": dict(
        nume="Distrigaz Sud Rețele S.R.L.", cui="RO14270911", reg="J40/12565/2000", iban="RO33BACX0000000412345678",
        adresa="Str. Gheorghe Polizu nr. 58-60, Sector 1, București", categorie="gaz",
        culoare=(0.0, 0.5, 0.7), prefix="DG", cod_client="30458216", zi_emitere=(26, 28), scadenta=30,
        mod="consum"),
    "electrica": dict(
        nume="Electrica Furnizare S.A.", cui="RO28909028", reg="J40/7425/2011", iban="RO36BTRL04101205P88899XX",
        adresa="Str. Grigore Alexandrescu nr. 9, Sector 1, București", categorie="energie",
        culoare=(0.97, 0.58, 0.0), prefix="EL", cod_client="52906374", zi_emitere=(23, 26), scadenta=25,
        mod="consum"),
    "apanova": dict(
        nume="Apa Nova București S.A.", cui="RO13462308", reg="J40/7840/2000", iban="RO78BUCU00001234567890AB",
        adresa="Str. Aristide Demetriade nr. 1, Sector 5, București", categorie="apa",
        culoare=(0.0, 0.45, 0.75), prefix="AN", cod_client="64013872", zi_emitere=(21, 25), scadenta=20,
        mod="consum"),
    "salubritate": dict(
        nume="Salubritate Sector 3 – Operator Deșeuri S.R.L.", cui="RO17304822", reg="J40/4417/2005",
        iban="RO57TREZ7035069XXX012345", adresa="Calea Dudești nr. 191, Sector 3, București", categorie="salubritate",
        culoare=(0.40, 0.65, 0.10), prefix="SL", cod_client="18725049", zi_emitere=(8, 10), scadenta=30,
        mod="inainte"),
}


def construieste_facturi(perioade, hdd, rnd, anomalie):
    """Pentru fiecare furnizor și perioadă întoarce dict cu liniile facturii și consumul."""
    idx = {"electrica": 18420, "distrigaz": 2310, "apanova": 640}  # indexuri contor de pornire
    facturi = []
    n_total = len(perioade)
    for k, p in enumerate(perioade):
        luna = int(p[5:7])
        rate = {f: tva(f, p) for f in FURNIZORI}

        # --- Vodafone: contract fix, preț cu TVA inclus constant ---
        facturi.append(dict(
            furn="vodafone", p=p, rata=rate["vodafone"], brut_fix=True, consum=None,
            linii=[("Abonament Internet Fix Fibră 1 Gbps (contract 24 luni)", "lună", 1, 39.00),
                   ("Închiriere router Wi-Fi 6", "lună", 1, 10.00)]))

        # --- Distrigaz: consum după HDD real ---
        mc = max(6.0, (10.0 + 0.145 * hdd[p]) * zgomot(rnd, 0.07))
        mc = round(mc)
        kwh = round(mc * 10.55)
        pret_gaz = treapta(p, 0.2950, 0.3150, 0.3280)
        old, new = idx["distrigaz"], idx["distrigaz"] + mc
        idx["distrigaz"] = new
        facturi.append(dict(
            furn="distrigaz", p=p, rata=rate["distrigaz"], brut_fix=False,
            consum=dict(um="mc", valoare=mc, index_vechi=old, index_nou=new, nota=f"Conversie: {mc} mc × 10,55 kWh/mc = {kwh} kWh"),
            linii=[("Gaze naturale – furnizare", "kWh", kwh, pret_gaz),
                   ("Tarif distribuție + transport", "kWh", kwh, 0.0720),
                   ("Abonament fix lunar", "lună", 1, 11.40)]))

        # --- Electrica: bază + vară (AC) + puțin iarna ---
        kw = 195 + (62 if luna in (7, 8) else 28 if luna in (6, 9) else 0) + 0.06 * hdd[p]
        kw = round(kw * zgomot(rnd, 0.05))
        pret_en = treapta(p, 0.640, 0.690, 0.718)
        old, new = idx["electrica"], idx["electrica"] + kw
        idx["electrica"] = new
        facturi.append(dict(
            furn="electrica", p=p, rata=rate["electrica"], brut_fix=False,
            consum=dict(um="kWh", valoare=kw, index_vechi=old, index_nou=new, nota=None),
            linii=[("Energie electrică activă", "kWh", kw, pret_en),
                   ("Transport + servicii de sistem", "kWh", kw, 0.110),
                   ("Distribuție", "kWh", kw, 0.190),
                   ("Certificate verzi / contribuții", "kWh", kw, 0.090),
                   ("Abonament lunar", "lună", 1, 10.50)]))

        # --- Apa Nova: consum stabil, ușor mai mare vara ---
        mca = 8.0 + (1.2 if luna in (6, 7, 8) else 0) + (0.4 if luna in (12, 1) else 0)
        mca = round(mca * zgomot(rnd, 0.14))
        if anomalie and k == n_total - 1:
            mca = round(mca * 1.7)  # pierdere/avarie
        old, new = idx["apanova"], idx["apanova"] + mca
        idx["apanova"] = new
        facturi.append(dict(
            furn="apanova", p=p, rata=rate["apanova"], brut_fix=False,
            consum=dict(um="mc", valoare=mca, index_vechi=old, index_nou=new, nota=None),
            linii=[("Apă potabilă", "mc", mca, treapta(p, 5.60, 5.85, 6.15)),
                   ("Canalizare – epurare", "mc", mca, treapta(p, 4.15, 4.35, 4.58)),
                   ("Abonament contor", "lună", 1, 3.20)]))

        # --- Salubritate: fix pe persoană, indexare în ianuarie ---
        facturi.append(dict(
            furn="salubritate", p=p, rata=rate["salubritate"], brut_fix=False, consum=None,
            linii=[("Colectare și transport deșeuri menajere (3 persoane)", "pers.", 3, treapta(p, 8.40, 8.40, 8.95)),
                   ("Tratare/depozitare deșeuri (3 persoane)", "pers.", 3, treapta(p, 4.10, 4.10, 4.40))]))
    return facturi


def fmt(x, zec=2):
    return f"{x:,.{zec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def calculeaza_totaluri(f):
    rata = f["rata"]
    if f["brut_fix"]:  # prețul din contract include TVA
        brut = round(sum(q * pu for _, _, q, pu in f["linii"]), 2)
        net_total = round(brut / (1 + rata), 2)
        return net_total, round(brut - net_total, 2), brut
    net_total = round(sum(round(q * pu, 2) for _, _, q, pu in f["linii"]), 2)
    t = round(net_total * rata, 2)
    return net_total, t, round(net_total + t, 2)


def desenează(c, f, nr, emisa, scadenta, perioada_txt, cod_plata, seria_nr, pagina_info):
    furn = FURNIZORI[f["furn"]]
    W, H = A4
    m = 18 * mm
    brand = colors.Color(*furn["culoare"])
    net_total, t_total, brut = calculeaza_totaluri(f)

    c.setFillColor(brand)
    c.rect(0, H - 28 * mm, W, 28 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(FONT_B, 17)
    c.drawString(m, H - 16 * mm, furn["nume"])
    c.setFont(FONT, 9)
    c.drawString(m, H - 22 * mm, "FACTURĂ FISCALĂ")
    c.setFillColor(colors.black)

    y = H - 38 * mm
    c.setFont(FONT_B, 10)
    c.drawString(m, y, "FURNIZOR")
    c.setFont(FONT, 9)
    for i, t in enumerate([furn["nume"], furn["adresa"], f"CUI: {furn['cui']}   Reg. Com.: {furn['reg']}",
                           f"IBAN: {furn['iban']}"]):
        c.drawString(m, y - (i + 1) * 5 * mm, t)
    xc = W / 2 + 5 * mm
    c.setFont(FONT_B, 10)
    c.drawString(xc, y, "CLIENT")
    c.setFont(FONT, 9)
    for i, t in enumerate([f"Nume: {CLIENT['nume']}", f"Cod client: {furn['cod_client']}",
                           f"Adresă: {CLIENT['strada']}", f"{CLIENT['oras']}, {CLIENT['judet']}"]):
        c.drawString(xc, y - (i + 1) * 5 * mm, t)

    y2 = y - 32 * mm
    c.setStrokeColor(brand)
    c.setLineWidth(1)
    c.line(m, y2 + 6 * mm, W - m, y2 + 6 * mm)
    c.setFont(FONT_B, 9)
    c.drawString(m, y2, f"Factura nr.: {nr}")
    c.drawString(m + 62 * mm, y2, f"Data emiterii: {emisa:%d.%m.%Y}")
    c.drawString(m + 117 * mm, y2, f"Data scadentă: {scadenta:%d.%m.%Y}")
    c.setFont(FONT, 9)
    c.drawString(m, y2 - 5 * mm, f"Perioada facturată: {perioada_txt}")
    c.drawString(m, y2 - 10 * mm, f"Cod client: {furn['cod_client']}      Categorie: {furn['categorie']}")

    # tabel
    ty = y2 - 22 * mm
    c.setFillColor(colors.Color(0.93, 0.93, 0.93))
    c.rect(m, ty - 2 * mm, W - 2 * m, 7 * mm, fill=1, stroke=0)
    c.setFillColor(colors.black)
    c.setFont(FONT_B, 8.5)
    cx = dict(den=m + 2 * mm, um=m + 92 * mm, cant=m + 116 * mm, pu=m + 140 * mm, val=W - m - 2 * mm)
    c.drawString(cx["den"], ty, "Serviciu / Descriere")
    c.drawString(cx["um"], ty, "U.M.")
    c.drawRightString(cx["cant"], ty, "Cant.")
    c.drawRightString(cx["pu"], ty, "Preț unitar")
    c.drawRightString(cx["val"], ty, "Valoare fără TVA")
    c.setFont(FONT, 8.5)
    row = ty - 8 * mm
    nete = []
    for den, um, q, pu in f["linii"]:
        if f["brut_fix"]:
            val = round(q * pu / (1 + f["rata"]), 2)
            pu_afis = round(pu / (1 + f["rata"]), 4)
        else:
            val, pu_afis = round(q * pu, 2), pu
        nete.append(val)
        c.drawString(cx["den"], row, den)
        c.drawString(cx["um"], row, um)
        c.drawRightString(cx["cant"], row, fmt(q, 0) if float(q).is_integer() else fmt(q))
        c.drawRightString(cx["pu"], row, fmt(pu_afis, 4 if pu_afis < 1 else 2))
        c.drawRightString(cx["val"], row, fmt(val))
        row -= 6 * mm
    if f["brut_fix"] and nete and abs(sum(nete) - net_total) > 0.001:  # absoarbe rotunjirea în ultima linie
        diff = round(net_total - sum(nete), 2)
        c.setFillColor(colors.white)
        c.rect(cx["val"] - 30 * mm, row + 6 * mm - 1.5 * mm, 32 * mm, 5 * mm, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.drawRightString(cx["val"], row + 6 * mm, fmt(nete[-1] + diff))
    c.line(m, row + 3 * mm, W - m, row + 3 * mm)

    row -= 4 * mm
    c.setFont(FONT, 9)
    c.drawRightString(cx["pu"] + 12 * mm, row, "Total fără TVA:")
    c.drawRightString(cx["val"], row, f"{fmt(net_total)} RON")
    row -= 5.5 * mm
    c.drawRightString(cx["pu"] + 12 * mm, row, f"TVA {int(round(f['rata'] * 100))}%:")
    c.drawRightString(cx["val"], row, f"{fmt(t_total)} RON")
    row -= 7 * mm
    c.setFont(FONT_B, 11)
    c.drawRightString(cx["val"] - 38 * mm, row, "TOTAL DE PLATĂ:")
    c.drawRightString(cx["val"], row, f"{fmt(brut)} RON")

    # consum / contor
    if f["consum"]:
        co = f["consum"]
        row -= 12 * mm
        c.setFont(FONT_B, 9)
        c.drawString(m, row, "DATE CONTOR")
        c.setFont(FONT, 9)
        c.drawString(m, row - 5 * mm, f"Index vechi: {co['index_vechi']} {co['um']}     Index nou: {co['index_nou']} {co['um']}"
                                      f"     Consum facturat: {co['valoare']} {co['um']}")
        if co["nota"]:
            c.drawString(m, row - 10 * mm, co["nota"])

    # cod de bare
    by = 55 * mm
    c.setFont(FONT_B, 9)
    c.drawString(m, by + 22 * mm, "COD DE BARE PLATĂ")
    bc = code128.Code128(cod_plata, barHeight=16 * mm, barWidth=0.5 * mm, humanReadable=False)
    bc.drawOn(c, m, by + 4 * mm)
    c.setFont(FONT, 8.5)
    c.drawString(m, by, cod_plata)

    c.setFont(FONT, 7.5)
    c.setFillColor(colors.grey)
    c.drawString(m, 20 * mm, "Document generat automat cu date fictive – utilizat exclusiv pentru testarea aplicației.")
    c.drawRightString(W - m, 20 * mm, "Pagina 1/1")
    return brut, net_total, t_total


def main():
    argv = sys.argv[1:]

    def opt(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default

    luni = int(opt("--luni", 12))
    seed = int(opt("--seed", 42))
    out = opt("--out", os.path.join(HERE, "facturi_test"))
    anomalie = "--anomalie" in argv
    azi = date.today()
    if opt("--pana-la"):
        an, lu = map(int, opt("--pana-la").split("-"))
    else:  # ultima lună încheiată (facturile lunii curente nu s-au emis încă)
        prima = azi.replace(day=1) - timedelta(days=1)
        an, lu = prima.year, prima.month
    perioade = []
    for i in range(luni - 1, -1, -1):
        t = an * 12 + (lu - 1) - i
        perioade.append(f"{t // 12:04d}-{t % 12 + 1:02d}")

    os.makedirs(out, exist_ok=True)
    rnd = random.Random(seed)
    hdd = hdd_lunar(perioade, rnd)
    facturi = construieste_facturi(perioade, hdd, rnd, anomalie)

    seq = {k: rnd.randint(40000, 90000) for k in FURNIZORI}
    manifest = ["fisier;furnizor;categorie;perioada;cod_client;nume;nr_factura;data_emitere;scadenta;consum;um;"
                "total_fara_tva;tva;total_ron;cod_bare"]
    pivot = {}
    for f in facturi:
        furn = FURNIZORI[f["furn"]]
        p = f["p"]
        an_p, lu_p = int(p[:4]), int(p[5:7])
        zi_min, zi_max = furn["zi_emitere"]
        zi = min(rnd.randint(zi_min, zi_max), zile_in_luna(p))
        emisa = date(an_p, lu_p, zi)
        scadenta = emisa + timedelta(days=furn["scadenta"])
        perioada_txt = f"01.{lu_p:02d}.{an_p} – {zile_in_luna(p)}.{lu_p:02d}.{an_p} ({LUNI[lu_p - 1]} {an_p})"
        seq[f["furn"]] += 1
        nr = f"{furn['prefix']}{an_p}{seq[f['furn']]:06d}"
        _, _, brut = calculeaza_totaluri(f)
        cod_plata = f"{furn['cod_client']}{seq[f['furn']] % 10_000_000:07d}{int(round(brut * 100)):08d}"
        fisier = f"{p}_{f['furn']}.pdf"
        c = canvas.Canvas(os.path.join(out, fisier), pagesize=A4)
        c.setTitle(f"Factura {nr} – {furn['nume']}")
        brut, net, t = desenează(c, f, nr, emisa, scadenta, perioada_txt, cod_plata, seq[f["furn"]], None)
        c.showPage()
        c.save()
        co = f["consum"]
        manifest.append(";".join(map(str, [fisier, furn["nume"], furn["categorie"], p, furn["cod_client"], CLIENT["nume"],
                                           nr, emisa.isoformat(), scadenta.isoformat(), co["valoare"] if co else "",
                                           co["um"] if co else "", f"{net:.2f}", f"{t:.2f}", f"{brut:.2f}", cod_plata])))
        pivot.setdefault(p, {})[f["furn"]] = brut

    with open(os.path.join(out, "_istoric_asteptat.csv"), "w", encoding="utf-8-sig") as fh:
        fh.write("\n".join(manifest) + "\n")

    # sumar în consolă
    nume = list(FURNIZORI)
    print(f"\n{'Luna':8}" + "".join(f"{n:>13}" for n in nume) + f"{'HDD':>8}")
    for p in perioade:
        print(f"{p:8}" + "".join(f"{pivot[p][n]:>13.2f}" for n in nume) + f"{hdd[p]:>8.0f}")
    print(f"\nGata: {len(facturi)} PDF-uri + _istoric_asteptat.csv în {out}")


if __name__ == "__main__":
    main()
