---
name: start-app
description: Start the Pago web application locally (Apache/XAMPP backend + Vite frontend) and verify it works. Use when the user asks to start, run, launch or restart the app, or when the app does not respond.
---

# Start the Pago app

The app has two parts that must both be running: the **PHP API** (served by Apache from XAMPP) and the **Vite frontend** on port 5173. Vite proxies `/api/*` to Apache, so a frontend without Apache shows "Nu am putut încărca datele".

## Steps

### 1. Check the backend (Apache)
- The repo must be reachable at `C:\xampp\htdocs\pago`. The real code stays in the repo folder (the current working directory), and `htdocs\pago` is a junction that points to it.
- Check whether it exists:
  ```powershell
  Get-Item C:\xampp\htdocs\pago -ErrorAction SilentlyContinue | Select-Object FullName,LinkType,Target
  ```
- If it does not exist, create a junction to the local path of the repo (use the real repo path, not a hardcoded one). A junction doesn't need admin rights:
  ```powershell
  New-Item -ItemType Junction -Path C:\xampp\htdocs\pago -Target "<repo path>"
  ```
- If `C:\xampp\htdocs\pago` exists but is a normal folder, or a junction that points somewhere else, do not delete or replace it. Tell the user and ask what to do.
- If `C:\xampp\htdocs` doesn't exist, XAMPP is not installed at the default path. Tell the user.
- Test the API:
  ```powershell
  curl.exe -s http://localhost/pago/api/
  ```
  It should return JSON with `"name": "Pago LiMa API"`.
- If Apache does not answer, Claude can't reliably start it. Ask the user to start Apache from the XAMPP Control Panel (`C:\xampp\xampp-control.exe`), then test again.

### 2. Database
- `api/data/pago.sqlite` is created automatically on the first request, so there is normally nothing to do.
- Run the seed only if the user wants fresh or reset data, because it overwrites the data:
  ```powershell
  C:\xampp\php\php.exe api\seed.php
  ```
- For a fixed demo date, set `APP_TODAY=2026-11-20` for Apache or the PHP CLI.

### 3. Frontend
- If `web/node_modules` is missing, run `npm install` in `web/`.
- Start the dev server with the preview tool, not with a shell command: `preview_start` with `{name: "web"}` (defined in `.claude/launch.json`, it runs `npm --prefix web run dev` on port 5173). Never start dev servers through Bash or PowerShell.
- If the repo sits in another folder under htdocs, the server needs `API_PREFIX=/other-folder`.

### 4. Gmail module (check, then ask if not configured)
- Gmail login is restricted to one account: `allowed_google_email` in `modules/gmail-import/config.json`. If it is empty, every Google login is refused, and the demo account still works.
- Check whether Google auth is configured, without printing values. Use this check:
  ```powershell
  $p = "C:\Proiecte\Pago_hackathon_LiMa\modules\gmail-import\config.json"
  if (Test-Path $p) { $c = Get-Content $p -Raw | ConvertFrom-Json; "config=yes client_id=" + [bool]$c.google.client_id + " secret=" + [bool]$c.google.client_secret + " python=" + [bool]$c.python_path + " allowed=" + [bool]$c.allowed_google_email } else { "config=no" }
  ```
- If `config=no`, or `client_id`, `secret` or `python` is false, Google auth is not set up on this machine. Ask the user with AskUserQuestion: start **without Gmail** (demo login only, Google button will not work) or stop so they can configure it. Do not create or edit `config.json` on your own. If they choose without Gmail, continue to step 5 and say so in the report.
- If Google auth is configured but `allowed=false`, tell the user that only the demo login works until `allowed_google_email` is set in `config.json`.
- Setup for a developer who has Google: copy `config.example.json` to `config.json`, fill `google.client_id`, `google.client_secret`, `allowed_google_email` (their own Gmail address) and `python_path` (full path to a Python with the packages from `scripts/requirements.txt`). Apache often can't see `python` from PATH on Windows.
- Never print the contents of `config.json`, because it can contain secrets.

### 5. Verify
- Check the dev server logs with `preview_logs` and the browser console for errors.
- Check that `http://localhost:5173` loads, and that `/api/dashboard` through the proxy returns JSON (look at `read_network_requests`).
- Report to the user what is running and the URL: http://localhost:5173.

## Common problems
| Symptom | Cause / fix |
|---|---|
| "Nu am putut încărca datele" | Apache is not running, or the junction `C:\xampp\htdocs\pago` is missing |
| 404 on `/api/...` | Wrong `API_PREFIX` (repo folder name under htdocs) |
| Port 5173 busy | An old Vite server is running. Use `preview_list` and stop it with `preview_stop` |
| Gmail scan fails | `python_path` in `config.json` is wrong or the packages are not installed |
| Data looks wrong | Reset it with `php api\seed.php` (ask the user first) |
