# Plan: „Import furnizori din Gmail” – onboarding Pago (hackathon)

## Context
Utilizatorii noi Pago trebuie să-și adauge manual fiecare furnizor (scanare factură / căutare în catalog). Ideea: la onboarding, utilizatorul conectează **o singură dată** Gmail-ul, aplicația scanează ultimele ~12 luni de emailuri, **descoperă furnizorii** din facturi și îi propune într-un ecran de confirmare. Accesul la Gmail e folosit doar pentru scanare și apoi revocat (argument puternic de confidențialitate). Repo-ul e gol (doar `README.md`), deci construim de la zero. Un coechipier va dezvolta în paralel o hartă interactivă cu date, în același proiect.

## Opinie despre stack (Python + PHP vanilla/XAMPP/SQLite + Vite/Tailwind)
Funcționează bine pentru un hackathon, cu două observații:
- **SQLite ca punct comun** e o alegere bună: zero configurare, PHP (PDO) și Python (`sqlite3`) citesc același fișier. Trebuie activat `extension=pdo_sqlite` în `php.ini` din XAMPP și pus `PRAGMA journal_mode=WAL` ca să nu se blocheze scrierile simultane PHP/Python.
- **Împărțire clară a responsabilităților**, ca să nu dublăm logică în două limbaje: **PHP** = API-ul HTTP + OAuth Google + baza de date; **Python** = partea grea (Gmail fetch, PDF, Claude). PHP pornește scriptul Python în fundal, iar frontend-ul face polling pe status.
- Vite + Tailwind e ok pentru UI cu aspect de aplicație mobilă; pentru hartă, Leaflet merge direct cu vanilla JS. Proxy-ul Vite (`/api` → Apache) rezolvă CORS în dezvoltare.

## Arhitectură
```
frontend/ (Vite+Tailwind) ──/api──> backend/ (PHP, Apache XAMPP) ──> data/app.sqlite <── scripts/ (Python)
                                         │  pornește în fundal ─────────────────────────┘
                                         └─ OAuth Google (curl)          Python → Gmail API + Claude API
```

## Structură proiect
```
backend/
  public/index.php           # router simplu: /api/...
  src/db.php                 # PDO SQLite + WAL
  src/google_oauth.php       # URL autorizare, schimb code→token, revocare (curl, fără composer)
  src/routes/auth.php        # GET /api/auth/google/start, /api/auth/google/callback
  src/routes/scan.php        # POST /api/scan/start, GET /api/scan/status?id=
  src/routes/providers.php   # GET /api/providers/discovered, POST /api/providers/confirm
  src/routes/map.php         # rezervat coechipierului (endpoint-uri hartă)
  config.example.php         # GOOGLE_CLIENT_ID/SECRET, ANTHROPIC_API_KEY, PYTHON_PATH (config.php în .gitignore)
scripts/
  scan_inbox.py              # entrypoint: --job-id N [--demo]
  gmail_client.py            # credențiale din refresh token, căutare, descărcare atașamente
  extractor.py               # Claude: PDF/email → JSON structurat
  matcher.py                 # potrivire cu catalogul (CUI → IBAN → nume), deduplicare
  requirements.txt           # anthropic, google-api-python-client, google-auth
data/
  schema.sql                 # tabele + seed catalog furnizori
  app.sqlite                 # generat, în .gitignore
demo_data/                   # emailuri .eml + PDF-uri de test, marcate clar „DEMO”
frontend/
  src/pages/onboarding.js    # „Conectează Gmail” → progres scanare → confirmare
  src/pages/map/             # modulul coechipierului
  vite.config.js             # proxy /api → http://localhost/pago/backend/public
```

## Model de date (SQLite)
- `users(id, email, created_at)`
- `oauth_tokens(user_id, refresh_token, access_token, expires_at)` – șters după scanare
- `scan_jobs(id, user_id, status[pending|running|done|error], total_emails, processed, found, error, started_at, finished_at)`
- `provider_catalog(id, name, cui, iban, category, logo)` – simulează catalogul Pago (seed ~15 furnizori comuni: energie, gaz, apă, telecom, internet, asigurări)
- `discovered_providers(id, job_id, catalog_id NULL, name, cui, iban, client_code, category, last_amount, currency, last_due_date, invoice_count, confidence, source_message_id, status[proposed|confirmed|rejected])`
- `user_providers(user_id, catalog_id|discovered_id, client_code, added_at)` – rezultatul confirmării

## Flux
1. **Conectare** – `GET /api/auth/google/start` redirecționează spre Google cu scope `gmail.readonly`, `access_type=offline`, `prompt=consent`. Callback-ul salvează refresh token-ul și creează automat un `scan_job`.
2. **Pornire scanare** – `POST /api/scan/start` pornește în fundal pe Windows: `pclose(popen('start /B "" "PYTHON_PATH" scripts/scan_inbox.py --job-id N', 'r'))`. Cu `?demo=1` rulează pe `demo_data/`, fără Gmail (varianta de rezervă pentru prezentare).
3. **Python – căutare**: query Gmail `newer_than:12m (factura OR factură OR "factura fiscala" OR "factura ta" OR invoice) -category:promotions`, plafonat (~300 mesaje). Actualizează `processed/found` în `scan_jobs` pentru bara de progres.
4. **Python – pre-filtrare ieftină**: expeditor din catalog sau atașament PDF sau cuvinte-cheie în subiect; restul e ignorat fără LLM.
5. **Python – extragere cu Claude** (`claude-opus-5-5`, SDK `anthropic`, structured outputs prin `output_config.format`): PDF trimis ca bloc `document` base64 + subiect/expeditor/corp; schemă JSON: `is_invoice, provider_name, cui, iban, client_code, invoice_number, amount, currency, due_date, category, confidence`. Emailurile fără PDF (doar link) se trimit ca text.
6. **Python – potrivire și grupare**: după CUI, apoi IBAN, apoi nume normalizat → `catalog_id`; grupare pe furnizor (număr facturi, ultima sumă și scadență); IBAN validat (checksum mod-97).
7. **Python – final**: `status=done`, revocare token Google (`https://oauth2.googleapis.com/revoke`) și ștergerea lui din DB.
8. **Confirmare** – frontend-ul face polling pe `/api/scan/status`, apoi afișează lista `discovered_providers` (logo, categorie, ultima sumă, cod client, badge „din catalog Pago” / „furnizor nou”), bifate implicit; `POST /api/providers/confirm` scrie în `user_providers`. Ecran final: „Ai adăugat 7 furnizori”.

## Colaborarea cu coechipierul (harta)
- Rutele lui sunt în `backend/src/routes/map.php` (prefix `/api/map/*`), tabelele lui au prefixul `map_` în `schema.sql`, iar UI-ul stă în `frontend/src/pages/map/`. Fișierele se ating doar în `index.php` (router) și `schema.sql`.
- Router-ul și conexiunea DB se fac primele și se comit devreme, ca să poată lucra în paralel.

## Ordine de implementare
1. Schelet: structură, `schema.sql` + seed catalog, `db.php`, router, Vite+Tailwind cu proxy, `.gitignore`.
2. Pipeline Python în **mod demo** (`demo_data/` → extractor → matcher → DB), testabil fără OAuth.
3. Endpoint-uri scan/providers + UI onboarding (progres + confirmare) pe mod demo.
4. OAuth Google în PHP + `gmail_client.py` (Google Cloud project în modul „Testing”, conturile echipei ca test users).
5. Revocare token, tratare erori, finisare UI în stil Pago.

## Verificare
- `python scripts/scan_inbox.py --job-id 1 --demo` → verificare în SQLite că `discovered_providers` conține furnizorii așteptați din `demo_data/`, cu CUI/IBAN/sumă corecte.
- `curl -X POST http://localhost/.../api/scan/start?demo=1`, apoi polling pe `/api/scan/status` până la `done`; `GET /api/providers/discovered`.
- `npm run dev` în `frontend/` → flux complet în browser-ul integrat (onboarding → progres → confirmare → succes), inclusiv la lățime de telefon.
- Test live cu un cont Gmail de test care are facturi reale; verificare că token-ul e revocat după scanare.

## Drumul spre producție (pentru prezentare, nu se implementează acum)
- Un singur proiect Google Cloud deținut de Pago; scope `gmail.readonly` cerut incremental, doar la „Importă furnizorii din Gmail”.
- App mobilă: Google Identity Services / AppAuth → cod de autorizare → backend Pago schimbă codul pe token-uri și face cererile Gmail (list/get/attachments, batch, coadă de joburi); revocare după scanare.
- Cerințe Google pentru scope „restricted”: verificare aplicație, evaluare CASA anuală, respectarea politicii Limited Use.
- Extensii: citire pe dispozitiv (doar PDF-urile filtrate ajung la server), Outlook prin Microsoft Graph `Mail.Read`.
- Prototipul folosește același flux, în modul „Testing” (≤100 conturi de test); se adaugă un slide în prezentare.

## Pre-condiții (de făcut de echipă)
- Google Cloud project + OAuth client (Web), redirect URI `http://localhost/.../api/auth/google/callback`, Gmail API activat, test users adăugați.
- Cheie `ANTHROPIC_API_KEY`; Python 3.10+ instalat, cu calea pusă în `config.php`.
