<?php
declare(strict_types=1);

/** POST /api/scan/start  body: {"mode": "live" | "demo"} */
function scan_start(): void
{
    $mode = (json_body()['mode'] ?? 'live') === 'demo' ? 'demo' : 'live';
    $pdo = db();

    if ($mode === 'demo' && empty($_SESSION['user_id'])) {
        // Modul demo nu cere conectare: creăm un utilizator de test.
        $email = config()['demo_email'] ?? 'demo@pago.local';
        $pdo->prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING')->execute([$email]);
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $_SESSION['user_id'] = (int) $stmt->fetchColumn();
    }
    $uid = require_user();

    if ($mode === 'live') {
        $stmt = $pdo->prepare('SELECT 1 FROM oauth_tokens WHERE user_id = ?');
        $stmt->execute([$uid]);
        if (!$stmt->fetchColumn()) {
            json_out(['error' => 'Conectează întâi Gmail-ul.'], 400);
        }
    }

    // Nu pornim două scanări simultan pentru același utilizator.
    $stmt = $pdo->prepare("SELECT id FROM scan_jobs WHERE user_id = ? AND status IN ('pending','running') ORDER BY id DESC LIMIT 1");
    $stmt->execute([$uid]);
    if ($existing = $stmt->fetchColumn()) {
        json_out(['job_id' => (int) $existing, 'mode' => $mode, 'reused' => true], 200);
    }

    $pdo->prepare('INSERT INTO scan_jobs (user_id, mode, status) VALUES (?, ?, ?)')->execute([$uid, $mode, 'pending']);
    $jobId = (int) $pdo->lastInsertId();

    spawn_scan_worker($jobId, $mode === 'demo');
    json_out(['job_id' => $jobId, 'mode' => $mode], 202);
}

/** Pornește scripts/scan_inbox.py în fundal, fără să blocheze răspunsul HTTP. */
function spawn_scan_worker(int $jobId, bool $demo): void
{
    $python = config()['python_path'] ?? 'python';
    $script = ROOT_DIR . '/scripts/scan_inbox.py';
    $log = ROOT_DIR . '/data/scan_' . $jobId . '.log';
    $args = '--job-id ' . $jobId . ($demo ? ' --demo' : '');

    if (stripos(PHP_OS_FAMILY, 'Windows') !== false) {
        $cmd = 'start "" /B "' . $python . '" "' . $script . '" ' . $args . ' > "' . $log . '" 2>&1';
        pclose(popen($cmd, 'r'));
    } else {
        exec('nohup "' . $python . '" "' . $script . '" ' . $args . ' > "' . $log . '" 2>&1 &');
    }
}

/** GET /api/scan/status?id=N */
function scan_status(): void
{
    $uid = require_user();
    $stmt = db()->prepare('SELECT id, mode, status, total_emails, processed, found, error, detected FROM scan_jobs WHERE id = ? AND user_id = ?');
    $stmt->execute([(int) ($_GET['id'] ?? 0), $uid]);
    $job = $stmt->fetch();
    if (!$job) {
        json_out(['error' => 'Scanare inexistentă.'], 404);
    }
    $job['detected'] = json_decode((string) ($job['detected'] ?? ''), true) ?: [];
    json_out($job);
}
