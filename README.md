# Pago · Import furnizori din Gmail (hackathon)

Repo pentru Hackathonul Pago 2026 din partea echipei LiMa.

Utilizatorul conectează Gmail-ul o singură dată. Aplicația scanează facturile din ultimele 12 luni, descoperă furnizorii și îi propune spre confirmare. Accesul la Gmail e doar pentru citire și este revocat după scanare.

## Arhitectură

```
frontend/ (Vite + Tailwind) --/api--> backend/ (PHP, Apache XAMPP) --> data/app.sqlite <-- scripts/ (Python)
                                       └── pornește scripts/scan_inbox.py în fundal
```

- `backend/` – API PHP vanilla: OAuth Google, pornire scanare, listă furnizori, confirmare.
- `scripts/` – Python: citește Gmail (sau `demo_data/`), extrage facturile cu Claude, potrivește cu catalogul.
- `data/schema.sql` – schema comună, creată automat de PHP și de Python.
- `frontend/` – ecranele de onboarding (conectare → progres → confirmare).

## Configurare

1. Copiază `config.example.json` în `config.json` și completează valorile (fișierul e ignorat de Git).
2. **XAMPP** – în `php.ini` activează `extension=pdo_sqlite`, `extension=curl`, `extension=openssl`, și setează `curl.cainfo` la un fișier `cacert.pem` valid, altfel cererile HTTPS către Google eșuează.
3. **Apache** – adaugă în `httpd.conf` (sau într-un fișier inclus):

   ```apache
   Alias /pago "C:/Proiecte/Pago_hackathon_LiMa/backend/public"
   <Directory "C:/Proiecte/Pago_hackathon_LiMa/backend/public">
       AllowOverride All
       Require all granted
   </Directory>
   ```

   Repornește Apache. API-ul răspunde la `http://localhost/pago/api/...`.
4. **Python 3.10+** – `pip install -r scripts/requirements.txt`. În `config.json`, `python_path` trebuie să indice interpretorul care are aceste pachete.
5. **Frontend** – `cd frontend && npm install && npm run dev`, apoi deschide `http://localhost:5173`. Dacă Apache e pe alt port sau alias, setează `VITE_API_TARGET`.

## Pornire rapidă (fără Gmail)

Deschide `http://localhost:5173` și apasă **„Încearcă cu date demo”**. Scanează fișierele din `demo_data/` (6 emailuri: 2 facturi Enel, Digi, Apa Nova, o asociație de bloc cu IBAN invalid și un newsletter care trebuie ignorat).

Testare doar din linia de comandă, fără server web:

```bash
python scripts/scan_inbox.py --job-id 1 --demo
```

Înainte trebuie creat un job în `data/app.sqlite` (tabela `scan_jobs`), sau să pornești demo-ul din UI, care îl creează.

## Gmail real

1. În Google Cloud Console creează un proiect, activează **Gmail API**, configurează ecranul de consimțământ în modul **Testing** și adaugă conturile de test.
2. Creează un client OAuth de tip **Web application** cu redirect URI: `http://localhost/pago/api/auth/google/callback`.
3. Pune `client_id` și `client_secret` în `config.json`.
4. Apasă **„Conectează Gmail”**.

Scopurile cerute: `openid`, `email` și `gmail.readonly`. În modul Testing, Google acceptă până la 100 de conturi de test. Pentru producție e nevoie de verificarea aplicației și de o evaluare CASA (vezi `docs/PLAN.md`).

## Cum funcționează extragerea

- Cu `anthropic_api_key` completat, `scripts/extractor.py` trimite emailul (și PDF-ul, dacă există) la `claude-opus-5-5` și primește date structurate prin `messages.parse`.
- Fără cheie, se folosește o rezervă cu regex pe câmpurile „Furnizor:”, „CUI:”, „IBAN:”, „Cod client:” etc. Ea funcționează doar pentru formatul din `demo_data/`.
- IBAN-urile sunt verificate cu mod-97. Un IBAN invalid nu blochează furnizorul, dar scade încrederea și e marcat în UI.

## Limitări cunoscute

- Catalogul `provider_catalog` are doar nume; CUI și IBAN sunt goale. Completează-le cu datele reale ale furnizorilor Pago, altfel potrivirea se face doar după nume.
- Ruta `backend/src/routes/map.php` nu există încă; e rezervată pentru harta coechipierului.
- Nu există autentificare reală a utilizatorului în afara sesiunii Google; datele demo folosesc un utilizator de test.
