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
                d.last_due_date, d.invoice_count, d.confidence, d.status, d.catalog_id, c.logo
         FROM discovered_providers d
         JOIN scan_jobs j ON j.id = d.job_id
         LEFT JOIN provider_catalog c ON c.id = d.catalog_id
         WHERE d.job_id = ? AND j.user_id = ?
         ORDER BY CASE d.status WHEN \'proposed\' THEN 0 ELSE 1 END, d.invoice_count DESC, d.name'
    );
    $stmt->execute([$jobId, $uid]);
    json_out(['job_id' => $jobId, 'providers' => $stmt->fetchAll()]);
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
    json_out(['added' => $count]);
}
