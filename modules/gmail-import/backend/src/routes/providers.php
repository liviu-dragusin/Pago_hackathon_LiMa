<?php
declare(strict_types=1);

/** GET /api/providers/discovered[?job_id=N] – furnizorii propuși de ultima scanare (sau de jobul cerut). */
function providers_discovered(): void
{
    $uid = require_user();
    $pdo = db();

    $jobId = (int) ($_GET['job_id'] ?? 0);
    if ($jobId === 0) {
        $stmt = $pdo->prepare("SELECT id FROM scan_jobs WHERE user_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1");
        $stmt->execute([$uid]);
        $jobId = (int) $stmt->fetchColumn();
    }

    $stmt = $pdo->prepare(
        'SELECT d.id, d.name, d.cui, d.iban, d.iban_valid, d.client_code, d.category, d.last_amount, d.currency,
                d.last_due_date, d.invoice_count, d.confidence, d.status, d.catalog_id, c.logo,
                (d.invoice_pdf_path IS NOT NULL) AS has_invoice_pdf,
                d.sender_email, d.security_flag, d.security_reasons
         FROM discovered_providers d
         JOIN scan_jobs j ON j.id = d.job_id
         LEFT JOIN provider_catalog c ON c.id = d.catalog_id
         WHERE d.job_id = ? AND j.user_id = ?
         ORDER BY d.security_flag DESC, CASE d.status WHEN \'proposed\' THEN 0 ELSE 1 END, d.invoice_count DESC, d.name'
    );
    $stmt->execute([$jobId, $uid]);
    $providers = $stmt->fetchAll();
    foreach ($providers as &$p) {
        $p['flagged'] = (int) ($p['security_flag'] ?? 0) === 1;
        $p['flag_reasons'] = json_decode((string) ($p['security_reasons'] ?? ''), true) ?: [];
        unset($p['security_flag'], $p['security_reasons']);
    }
    unset($p);
    json_out(['job_id' => $jobId, 'providers' => $providers, 'whitelist' => trusted_senders()]);
}

/** GET /api/providers/invoice?id=N – PDF-ul ultimei facturi a furnizorului propus (doar al utilizatorului). */
function providers_invoice(): void
{
    $uid = require_user();
    $stmt = db()->prepare(
        'SELECT d.invoice_pdf_path FROM discovered_providers d
         JOIN scan_jobs j ON j.id = d.job_id
         WHERE d.id = ? AND j.user_id = ?'
    );
    $stmt->execute([(int) ($_GET['id'] ?? 0), $uid]);
    $relative = $stmt->fetchColumn();
    if (!$relative) {
        json_out(['error' => 'Factura PDF nu este disponibilă.'], 404);
    }

    // Calea trebuie să rămână în data/invoices/ (protecție împotriva path traversal).
    $base = realpath(ROOT_DIR . '/data/invoices');
    $file = realpath(ROOT_DIR . '/data/' . $relative);
    if ($base === false || $file === false || !str_starts_with($file, $base . DIRECTORY_SEPARATOR)) {
        json_out(['error' => 'Factura PDF nu este disponibilă.'], 404);
    }

    header('Content-Type: application/pdf');
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="factura.pdf"');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
}

/** POST /api/providers/confirm  body: {"job_id": N, "ids": [..]} – ce nu e bifat devine „rejected”. */
function providers_confirm(): void
{
    $uid = require_user();
    $body = json_body();
    $jobId = (int) ($body['job_id'] ?? 0);
    $ids = array_values(array_filter(array_map('intval', $body['ids'] ?? []), fn($i) => $i > 0));
    $pdo = db();

    $stmt = $pdo->prepare('SELECT 1 FROM scan_jobs WHERE id = ? AND user_id = ?');
    $stmt->execute([$jobId, $uid]);
    if (!$stmt->fetchColumn()) {
        json_out(['error' => 'Scanare inexistentă.'], 404);
    }

    // Facturile flaguite (expeditor în afara listei albe) nu intră niciodată în aplicație, chiar dacă au fost bifate.
    $blocked = 0;
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $flagged = $pdo->prepare("SELECT id FROM discovered_providers WHERE job_id = ? AND security_flag = 1 AND id IN ($in)");
        $flagged->execute([$jobId, ...$ids]);
        $flaggedIds = array_map('intval', $flagged->fetchAll(PDO::FETCH_COLUMN));
        $blocked = count($flaggedIds);
        $ids = array_values(array_diff($ids, $flaggedIds));
    }

    $placeholders = $ids ? implode(',', array_fill(0, count($ids), '?')) : '0'; // nimic bifat => toate respinse
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE discovered_providers SET status = 'rejected' WHERE job_id = ? AND status = 'proposed' AND id NOT IN ($placeholders)")
        ->execute([$jobId, ...$ids]);

    $selected = $pdo->prepare("SELECT * FROM discovered_providers WHERE job_id = ? AND id IN ($placeholders)");
    $selected->execute([$jobId, ...$ids]);
    $insert = $pdo->prepare(
        "INSERT INTO user_providers (user_id, catalog_id, discovered_id, name, client_code)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, name, client_code) DO NOTHING"
    );
    $count = 0;
    foreach ($selected->fetchAll() as $row) {
        $pdo->prepare("UPDATE discovered_providers SET status = 'confirmed' WHERE id = ?")->execute([$row['id']]);
        $insert->execute([$uid, $row['catalog_id'], $row['id'], $row['name'], (string) ($row['client_code'] ?? '')]);
        $count++;
    }
    $pdo->commit();
    json_out(['added' => $count, 'blocked' => $blocked]);
}
