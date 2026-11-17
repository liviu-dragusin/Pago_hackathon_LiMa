<?php
declare(strict_types=1);

/** GET /api/auth/google/start – trimite utilizatorul la consimțământul Google (doar citire Gmail). */
function auth_google_start(): void
{
    $google = config()['google'] ?? [];
    if (empty($google['client_id'])) {
        json_out(['error' => 'Lipsește google.client_id din config.json'], 500);
    }

    $state = bin2hex(random_bytes(16));
    $_SESSION['oauth_state'] = $state;

    $params = http_build_query([
        'client_id' => $google['client_id'],
        'redirect_uri' => $google['redirect_uri'],
        'response_type' => 'code',
        'scope' => 'openid email https://www.googleapis.com/auth/gmail.readonly',
        'access_type' => 'offline',   // refresh token, doar pentru scanarea unică
        'prompt' => 'consent',
        'state' => $state,
    ]);
    redirect('https://accounts.google.com/o/oauth2/v2/auth?' . $params);
}

/** GET /api/auth/google/callback – salvează refresh token-ul și revine în aplicație. */
function auth_google_callback(): void
{
    $frontend = config()['frontend_url'] ?? 'http://localhost:5173';
    $fail = fn(string $reason) => redirect($frontend . '/?auth=' . $reason);

    if (isset($_GET['error'])) {
        $fail('denied');
    }
    if (!isset($_GET['state'], $_SESSION['oauth_state']) || !hash_equals($_SESSION['oauth_state'], (string) $_GET['state'])) {
        $fail('state');
    }
    unset($_SESSION['oauth_state']);

    try {
        $token = google_exchange_code(config()['google'] ?? [], (string) $_GET['code']);
        if (empty($token['refresh_token'])) {
            $fail('norefresh'); // Google nu a trimis refresh token; reluăm cu prompt=consent
        }
        $info = google_userinfo($token['access_token']);
    } catch (RuntimeException $e) {
        error_log($e->getMessage());
        $fail('error');
    }

    // Doar contul configurat (allowed_google_email din config.json) are voie să se conecteze prin Google.
    // Dacă nu e configurat, refuzăm orice cont (fail closed) și nu salvăm tokenul.
    $allowed = strtolower(trim((string) (config()['allowed_google_email'] ?? '')));
    if ($allowed === '' || strtolower((string) $info['email']) !== $allowed) {
        $fail('forbidden');
    }

    $pdo = db();
    $pdo->prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING')->execute([$info['email']]);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$info['email']]);
    $uid = (int) $stmt->fetchColumn();

    $pdo->prepare(
        'INSERT INTO oauth_tokens (user_id, refresh_token) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token'
    )->execute([$uid, $token['refresh_token']]);

    session_regenerate_id(true);
    $_SESSION['user_id'] = $uid;
    redirect($frontend . '/?auth=ok');
}

/** GET /api/auth/me – cine e conectat. Răspunde 200 și fără utilizator, ca frontend-ul să nu primească 401 la pornire. */
function auth_me(): void
{
    $uid = (int) ($_SESSION['user_id'] ?? 0);
    if ($uid === 0) {
        json_out(['authenticated' => false]);
    }
    $stmt = db()->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $email = $stmt->fetchColumn();
    if (!$email) {
        unset($_SESSION['user_id']);
        json_out(['authenticated' => false]);
    }
    json_out([
        'authenticated' => true,
        'email' => $email,
        'demo' => $email === (config()['demo_email'] ?? 'demo@pago.local'),
    ]);
}

/** POST /api/auth/demo – conectare cu contul de test, fără Google (pentru demo și dezvoltare). */
function auth_demo(): void
{
    $email = config()['demo_email'] ?? 'demo@pago.local';
    $pdo = db();
    $pdo->prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING')->execute([$email]);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $stmt->fetchColumn();
    json_out(['ok' => true]);
}

/** POST /api/auth/logout – încheie sesiunea. */
function auth_logout(): void
{
    $_SESSION = [];
    session_destroy();
    json_out(['ok' => true]);
}
