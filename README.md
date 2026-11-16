# Pago_hackathon_LiMa

Repo pentru Hackathonul Pago 2026 din partea echipei LiMa.

Replică a dashboard-ului de client Pago, plus trei funcționalități noi:

- **Predicție facturi & buget**: estimează factura de luna viitoare pe fiecare furnizor (model sezonier + trend), compară cu bugetul pe categorii și semnalează facturile anormal de mari.
- **Plăți split**: împarți o factură cu colegii de apartament sau familia și ții evidența cine ți-a dat banii.
- **Gamification**: puncte pentru plăți la timp sau în avans și pentru split, niveluri (Bronze → Platinum), serie de plăți la timp, badge-uri.

Plus un modul separat, **Harta furnizorilor** (`/furnizori`): alegi județul pe hartă și vezi furnizorii Pago disponibili acolo, pe categorii. De acolo fie conectezi un cont existent ca să plătești facturile, fie trimiți o cerere de contract nou. Detalii mai jos.

## Stack

| Parte | Tehnologie | Unde |
|---|---|---|
| API | PHP 8.2 simplu (fără framework), PDO SQLite | `api/` → servit de Apache din XAMPP la `http://localhost/pago/api/` |
| DB | SQLite, fișier local | `api/data/pago.sqlite` (generat, nu e în git) |
| Frontend | Vite + React + Tailwind v4 + Recharts | `web/` → `http://localhost:5173` |

## Platforma unificată

O singură aplicație web (`web/`, http://localhost:5173) și un singur API (`api/`, Apache). Modulele adăugate de echipă rămân în `modules/`:

| Modul | Frontend | Backend | Ruta în aplicație |
|---|---|---|---|
| Dashboard, facturi, buget, split, recompense, harta furnizorilor | `web/src/pages`, `web/src/modules/provider-map` | `api/` | `/`, `/facturi`, … |
| Import furnizori din Gmail (de la coleg) | `web/src/modules/gmail-import/` (portat din vanilla JS) | `modules/gmail-import/backend/public/` (PHP) + `scripts/` (Python) | `/importa` |
| Pulse (pagina echipei) | `modules/pulse/pulse.html` (static) | — | — |

Rutele `/api/auth/*`, `/api/scan/*` și `/api/providers/*` sunt trimise prin proxy-ul Vite către backend-ul modulului Gmail (vezi `web/vite.config.js`); restul `/api/*` merge la `api/`.

**Configurare Gmail:** copiază `modules/gmail-import/config.example.json` în `modules/gmail-import/config.json` și completează `python_path` cu interpretorul care are pachetele din `scripts/requirements.txt`. Pe Windows, folosește calea completă (ex: `C:/Users/.../python.exe`), pentru că Apache nu vede mereu `python` din PATH. Pentru demo nu ai nevoie de Google.

## Pornire

1. Repo-ul trebuie să fie în `C:\xampp\htdocs\pago`, iar Apache pornit din XAMPP.
2. Generează baza de date (sau sari peste: se creează singură la primul request):
   ```bash
   C:\xampp\php\php.exe api\seed.php
   ```
3. Frontend:
   ```bash
   cd web
   npm install
   npm run dev
   ```
4. Deschide http://localhost:5173

Vite face proxy de la `/api/*` la `http://localhost/pago/api/*`. Dacă ai repo-ul în alt folder din htdocs:
`API_PREFIX=/alt-folder npm run dev`.

## Date mock

- `api/seed.php` generează **deterministic** (același seed), deci toată echipa are aceleași date. Nu comitem `.sqlite`: binarele fac conflicte în git. Comitem doar schema și seed-ul.
- Istoricul are 18 luni și e generat **relativ la data de azi**, așa că dashboard-ul arată mereu actual.
- Scenarii de demo incluse: factura de gaz din luna curentă e cu ~50% peste estimare (anomalie), internetul de luna trecută e restant, iar Ioana și Vlad îți datorează bani.
- Pentru o dată fixă la demo: setează variabila de mediu `APP_TODAY=2026-11-20` pentru Apache sau PHP CLI.
- Ai stricat datele? `php api/seed.php` le resetează.

Ce s-a schimbat în schemă: modifici `api/schema.sql` + `api/seed.php`, apoi rulezi seed-ul.

## API

| Metodă | Rută | Ce face |
|---|---|---|
| GET | `/dashboard` | sumar, facturi urgente, cheltuieli 12 luni, estimare, anomalii, puncte |
| GET | `/bills?status=unpaid\|overdue\|paid&category=gaz` | lista facturilor |
| POST | `/bills/{id}/pay` | plătește factura → puncte + badge-uri noi |
| GET | `/predictions` | predicție pe furnizor, buget vs. estimare pe categorii, anomalii |
| GET / PUT | `/budgets`, `/budgets/{categorie}` `{monthly_limit}` | bugete lunare |
| GET | `/splits` | grupuri, membri, datorii, facturi împărțite |
| POST | `/splits/{groupId}/bills` `{bill_id, member_ids}` | împarte egal o factură |
| POST | `/splits/shares/{id}/settle` | marchează că un membru și-a dat partea |
| GET | `/rewards` | puncte, nivel, serie, badge-uri, istoric |

Userul logat e hardcodat (`USER_ID = 1` în `api/index.php`).

## Modul: Harta furnizorilor

| Unde | Ce |
|---|---|
| `web/src/modules/provider-map/` | pagina (`ProviderMapPage`), harta SVG (`RomaniaMap`, d3-geo) și dialogul de adăugare / contract |
| `api/lib/catalog.php` | endpoint-urile modulului |
| `api/data/catalog/providers.json` | cei 91 de furnizori din [pago.ro/furnizori](https://www.pago.ro/furnizori), pe cele 7 categorii Pago, cu acoperirea pe județe |
| `api/data/catalog/counties.json` | 42 de județe: cod, regiune, distribuitorul de energie electrică |
| `api/data/catalog/localities.json` | 3.186 de UAT-uri pe județ, pentru formularul de contract (generat) |
| `web/public/geo/judete.geojson` | poligoanele județelor, 88 KB (generat) |

**Cum funcționează:**
- **Harta** colorează județele după numărul de operatori locali din categoria aleasă (apă, salubrizare). Gri = niciun operator în Pago. Pentru categoriile naționale (energie, gaz, comunicații) toate județele au aceeași culoare.
- **Hover pe un furnizor** din listă colorează pe hartă zona pe care o acoperă.
- **„Adaugă”** conectează un cont existent cu codul de client: apare în `user_providers`, cu +15 puncte.
- **„Contract”** trimite o cerere de contract nou cu localitatea, adresa și telefonul: apare în `contract_requests`, cu +25 de puncte, și e listată jos pe pagină cu status.
- **Validări pe server:** furnizorul trebuie să activeze în județul ales, localitatea trebuie să fie în județ, iar telefonul trebuie să fie valid.

**Acoperirea pe județe:** Pago nu publică acoperirea ca date, așa că am extras-o din textul paginilor de furnizor și am verificat-o manual. Furnizorii de energie, gaz, comunicații, E-BLOC și cei din „Diverse” sunt marcați ca naționali. Dacă găsiți o greșeală, o corectați direct în `providers.json`.

**Regenerare geo:** pornește de la fișierul cu UAT-uri, care nu e în repo (15 MB):
```bash
cd web
node scripts/build-geo.mjs "C:/cale/catre/harta/maxp_result.geojson"
```

| Metodă | Rută | Ce face |
|---|---|---|
| GET | `/catalog` | categorii, județe (cu nr. de operatori locali), furnizori, conturile și cererile tale |
| GET | `/catalog/localities/{COD}` | localitățile din județ |
| POST | `/accounts` `{slug, category, county, client_code, alias?}` | conectează un cont existent |
| GET / POST | `/contracts` `{slug, category, county, locality, address, full_name, phone, notes?}` | cereri de contract nou |

## Structură

```
api/
  index.php         router + rute
  schema.sql        schema SQLite
  seed.php          date mock (rulabil din CLI)
  lib/
    handlers.php    logica endpoint-urilor
    predict.php     predicție + detecție anomalii
    rewards.php     puncte, niveluri, badge-uri
    catalog.php     modulul harta furnizorilor (catalog, conturi, contracte)
    db.php, helpers.php
  data/catalog/     furnizori, județe, localități (JSON, în repo)
web/src/
  pages/            Dashboard, Bills, Budget, Split, Rewards
  modules/provider-map/  modulul separat: harta furnizorilor pe județe
  components/       Layout (sidebar + bottom nav mobil), BillRow, ui (Card, Button, Toast…)
  lib/              api.js (fetch + useApi), format.js (RON, date, categorii)
```
