# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

- **Echipa LiMa** are 2 membri: Liviu și Marius.
- Proiectul este un **MVP, nu un produs final**, pentru Hackathonul Pago 2026, organizat de echipa care a dezvoltat aplicația Pago. Scopul este să demonstreze workflow-uri care ar putea fi adoptate de aplicație, nu să fie complet sau production-ready (de aici user hardcodat, date mock, fără teste). Prioritizează demo-ul funcțional în fața completitudinii.
- **Pago** ([pago.ro](https://www.pago.ro/)) este o aplicație românească pentru plata tuturor facturilor într-un singur loc: peste 400 de furnizori de utilități (prin scanarea facturii sau conectarea contului la furnizor), reminder-uri înainte de scadență, reîncărcări de cartelă prepaid, comparare RCA, rovinietă, asigurări de călătorie, eSIM, donații, taxe prin ghiseul.ro, PAD și bilete Loto. Se adresează persoanelor cu multe plăți recurente, iar funcționalitățile de plată sunt oferite și băncilor și retailerilor, care le integrează în aplicațiile lor.

### Ideile de expus în demo (în ordinea importanței)

1. **Preluare automată din Gmail:** furnizorii și facturile (furnizor, sumă etc.) sunt extrase din inbox-ul Gmail și inserate în aplicație (`modules/gmail-import`).
2. **Adăugare manuală prin hartă interactivă:** dacă userul nu vrea detecția automată, selectează pe hartă județul, apoi furnizorii de servicii de acolo, și introduce datele manual, mult mai ușor (`modules/provider-map`).
3. **Estimarea următoarei facturi:** după ce datele ajung în aplicație, un model de regresie liniară antrenat pe facturile din ultimele luni estimează aproximativ cât va fi următoarea factură (`api/lib/predict.php`).
4. **Split the bill:** funcționalitate propusă pentru integrarea în Pago, pentru cuplurile tinere care nu au banii la comun: fiecare plătește partea lui din factură (ex. 50% / 50%), cu cardul propriu.

Când prioritizezi sau alegi ce polish-uiești, respectă această ordine.

### Focus curent: securitatea preluării automate din Gmail

Accentul central al demo-ului este acum idea 1 (`modules/gmail-import`). Vrem să arătăm:
- cum pot fi **detectate facturile malițioase** (phishing, facturi false care imită un furnizor) în inbox;
- **nivele de securitate** ale detecției automate a facturilor, adică cât de multă încredere are sistemul într-o factură înainte să o insereze în aplicație.

Codul existent din modul (`scripts/extractor.py`, `matcher.py`, `scan_inbox.py`) nu conține încă logică de securitate. Orice verificare nouă trebuie să fie vizibilă și explicabilă în UI (ce a fost verificat, de ce o factură e suspectă), fiindcă scopul este demonstrația. Pentru demo se adaugă emailuri malițioase în `modules/gmail-import/demo_data/`, lângă cele legitime.

README.md și textul din UI sunt în română; păstrează limba la text nou.

## Commands

Nu există teste și nici linter. Verificarea se face rulând aplicația.

```bash
# Frontend (din web/): dev server pe :5173, build în web/dist
cd web && npm install && npm run dev
cd web && npm run build

# Reset / generare DB mock (SQLite, api/data/pago.sqlite, nu e în git)
C:\xampp\php\php.exe api\seed.php
```

- Backend-ul NU are server propriu: PHP rulează sub Apache din XAMPP, iar repo-ul trebuie să fie în `C:\xampp\htdocs\pago` (API la `http://localhost/pago/api/`). Alt folder: `API_PREFIX=/alt-folder npm run dev`.
- Dată fixă pentru demo: variabila de mediu `APP_TODAY=2026-11-20` (Apache sau PHP CLI).
- `.claude/launch.json` definește serverul `web` (`npm --prefix web run dev`, port 5173).
- Regenerare hartă județe (necesită un geojson de 15 MB care nu e în repo): `node web/scripts/build-geo.mjs "<cale>/maxp_result.geojson"` → scrie `web/public/geo/judete.geojson` și `api/data/catalog/localities.json`.

## Architecture

O singură aplicație web (`web/`) peste **două backend-uri PHP separate**, legate prin proxy-ul Vite (`web/vite.config.js`):

- `/api/auth`, `/api/scan`, `/api/providers` → `modules/gmail-import/backend/public/` (modulul Gmail al colegului; apelează scripturi Python din `modules/gmail-import/scripts/` pentru citirea inbox-ului și extragerea facturilor; DB și schema proprii în `modules/gmail-import/data/`).
- Restul `/api/*` → `api/index.php`. Regulile specifice sunt puse înaintea lui `/api` în config; la rute noi pe backend-ul Gmail trebuie adăugat prefixul în lista din `vite.config.js`.

**`api/` (PHP 8.2 fără framework, PDO SQLite):** `index.php` are un tabel `$routes` de `[metodă, regex, handler]`; handler-ele sunt funcții `h_*` în `api/lib/` (`handlers.php`, `catalog.php`) și returnează array-uri serializate JSON. Erori: aruncă `HttpError` cu status. Userul e hardcodat (`USER_ID = 1`). Logica de domeniu e separată: `predict.php` (predicție sezonieră + anomalii), `rewards.php` (puncte/niveluri/badge-uri), `weather.php`. `schema.sql` + `seed.php` definesc datele; seed-ul e determinist și generează istoric de 18 luni relativ la „azi”, deci orice schimbare de schemă = editezi ambele și rulezi seed-ul. Catalogul furnizorilor (`api/data/catalog/*.json`) e în repo; acoperirea pe județe se corectează manual în `providers.json`.

**`web/src/` (Vite + React 19 + Tailwind v4 + react-router + Recharts):**
- `main.jsx` definește rutele sub `Layout`, învelite în `ThemeProvider`, `ToastProvider` și `AuthGate`; o pagină nouă = rută aici + intrare în `components/Layout.jsx`.
- Toate apelurile HTTP trec prin `lib/api.js` (`api.*` + hook-ul `useApi(fn)`); adaugi aici fiecare endpoint nou.
- `pages/` = ecranele principale; `modules/<nume>/` = funcționalități autonome cu `index.js` ca punct de intrare (`auth`, `assistant`, `gmail-import`, `provider-map`). `modules/gmail-import/` e portat din vanilla JS, originalul rămâne în `modules/gmail-import/frontend/`.

**Gmail:** `modules/gmail-import/config.json` (necomis; se copiază din `config.example.json`) trebuie să aibă `python_path` cu cale completă pe Windows, fiindcă Apache nu vede mereu `python` din PATH. Pentru demo nu e nevoie de Google (există `demo_data/*.eml`).

`modules/pulse/` e o pagină statică a echipei, fără legătură cu aplicația.
