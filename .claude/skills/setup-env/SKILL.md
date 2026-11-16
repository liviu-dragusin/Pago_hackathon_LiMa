---
name: setup-env
description: Check that a developer's machine has everything needed to run this project (XAMPP/Apache, PHP, Node, Python, packages, config files, junction), install or configure whatever is missing, and give a report of what was found and what was done. Use when someone has just cloned the repo, on a new machine, or when the app fails to start for environment reasons.
---

# Set up the development environment

Goal: after this skill runs, a developer who just cloned the repo can start the app with `/start-app`. Check everything, fix what is missing, and finish with a report.

## Required technologies

| Technology | Needed for | Required version | Check |
|---|---|---|---|
| Git | version control | any recent | `git --version` |
| XAMPP (Apache + PHP) | serves the PHP API in `api/` and the Gmail backend | PHP 8.2+, installed at `C:\xampp` | `C:\xampp\php\php.exe -v` |
| PHP extensions | `pdo_sqlite`, `curl`, `openssl`, `mbstring`, `json` | all enabled | `C:\xampp\php\php.exe -m` |
| `curl.cainfo` (`cacert.pem`) in `php.ini` | HTTPS calls to Google fail without it | valid file path | `php.ini` |
| Node.js + npm | frontend (Vite 8, React 19, Tailwind 4) | Node 20.19+ or 22.12+ | `node -v`, `npm -v` |
| Python | Gmail scan scripts in `modules/gmail-import/scripts/` | 3.10+ | `python --version` |
| Python packages | `anthropic`, `pydantic>=2`, `google-api-python-client`, `google-auth` | from `requirements.txt` | `pip list` in the venv |
| Junction `C:\xampp\htdocs\pago` | lets Apache serve the repo wherever it was cloned | points to the repo | see `start-app` |
| `modules/gmail-import/config.json` | Gmail module settings | exists, `python_path` set | file check |
| GitHub CLI `gh` | optional, only for opening pull requests | any | `gh --version` |

The SQLite database needs no setup: it is created on the first request, or with `php api\seed.php`.

## Steps

Run the checks first and write the results down. Fix only what failed. Do not reinstall things that already work.

### 1. Check everything
Run the check commands from the table (PowerShell). Note for each item: OK, missing, or wrong version. Ignore the harmless PHP warning `Module "openssl" is already loaded`.

### 2. Fix what is missing
- **Git, Node, Python, XAMPP missing:** install with `winget` (for example `winget install OpenJS.NodeJS.LTS`, `winget install Python.Python.3.12`, `winget install Git.Git`, `winget install ApacheFriends.Xampp.8.2`). If `winget` is not available, don't look for other download sources. Tell the user which program to install and from where, and mark it as "not done" in the report.
- **Wrong version** (for example Node older than 20.19 or Python older than 3.10): tell the user, and install a newer one with `winget` only if the user agrees, because it can change what other projects use.
- **PHP extension disabled:** in `C:\xampp\php\php.ini`, remove the `;` before `extension=pdo_sqlite`, `curl`, `openssl`, `mbstring`. Make a backup first (`php.ini.bak`). Apache must be restarted afterwards by the user.
- **`curl.cainfo`:** if missing, tell the user. Don't download certificate files from unknown sources. Point it to a `cacert.pem` that already exists on the machine if there is one (XAMPP usually ships one in `C:\xampp\apache\bin\curl-ca-bundle.crt`).
- **Junction missing:** create it as described in the `start-app` skill, with the real repo path as target.
- **Frontend packages:** `npm install` in `web/` if `node_modules` is missing.
- **Python packages:** create a virtual environment so global Python stays clean (it is already in `.gitignore`), then install:
  ```powershell
  python -m venv modules\gmail-import\scripts\.venv
  modules\gmail-import\scripts\.venv\Scripts\python.exe -m pip install -r modules\gmail-import\scripts\requirements.txt
  ```
- **`config.json` missing:** copy `config.example.json` to `config.json` and set `python_path` to the full path of the venv's `python.exe`, with forward slashes. Apache doesn't always see `python` from PATH. If `config.json` already exists, only fix `python_path` if it is wrong, and leave the rest alone.
- **Database:** nothing to do. Run `C:\xampp\php\php.exe api\seed.php` only if the user asks for fresh data.

### 3. Things Claude must not do
- Never fill in `google.client_id`, `google.client_secret` or `anthropic_api_key`, and never print them. These are secrets that each developer gets from Google Cloud Console and Anthropic. Leave them empty and tell the user where to put them. The demo mode works without them.
- Never commit `config.json`. It is in `.gitignore`.
- Don't start or stop Apache. The user does that from the XAMPP Control Panel.

### 4. Verify
After the fixes, re-run the checks. If Apache is running, test `curl.exe -s http://localhost/pago/api/`. Then the user can run `/start-app`.

## Report (always give it at the end)

Use this format, with one row per item from the table:

| Item | Status found | Action taken | Result |
|---|---|---|---|
| Node.js | v22.1 OK | none | OK |
| Python venv | missing | created venv, installed requirements | OK |
| `config.json` | missing | copied from example, set `python_path` | OK, secrets still empty |
| Apache | not running | none (user must start it) | needs user |

After the table, add two short lists:
- **Needs the user:** things Claude could not or must not do (start Apache, add Google and Anthropic keys, install a program without `winget`).
- **Next step:** usually `/start-app`.

Be honest in the report. If a step failed or was skipped, say so with the error. Don't mark something OK that was not verified.
