<?php
declare(strict_types=1);

define('ROOT_DIR', realpath(__DIR__ . '/../..'));

/** Configurația din config.json (sursa unică, citită și de scripturile Python). */
function config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $path = ROOT_DIR . '/config.json';
        $cfg = is_file($path) ? json_decode((string) file_get_contents($path), true) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

/** Conexiunea PDO la SQLite; creează schema la prima rulare. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . ROOT_DIR . '/data/app.sqlite', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
        $pdo->exec((string) file_get_contents(ROOT_DIR . '/data/schema.sql'));
    }
    return $pdo;
}

function session_boot(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
        session_start();
    }
}

function json_out(mixed $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_body(): array
{
    $data = json_decode((string) file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

/** Returnează ID-ul utilizatorului din sesiune sau oprește cererea cu 401. */
function require_user(): int
{
    $uid = (int) ($_SESSION['user_id'] ?? 0);
    if ($uid === 0) {
        json_out(['error' => 'Sesiune inexistentă. Conectează-te întâi.'], 401);
    }
    return $uid;
}
