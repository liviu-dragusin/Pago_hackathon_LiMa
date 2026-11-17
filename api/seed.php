<?php
declare(strict_types=1);

/*
 * Baza aplicației pornește GOALĂ: nu există furnizori, facturi sau estimări inventate.
 * Datele apar când userul își importă furnizorii din Gmail (api/lib/import.php) sau îi adaugă de pe hartă,
 * iar dashboard-ul, bugetul și predicția se calculează pe ele.
 *
 * Singurele rânduri create aici sunt contul (completat la import cu emailul Gmail conectat) și grupul
 * de split, ca funcția de împărțire a facturilor să poată fi demonstrată pe facturile importate.
 *
 * Reset:  php api/seed.php   (sau șterge api/data/pago.sqlite — se recreează la primul request)
 */

require_once __DIR__ . '/lib/helpers.php';

function seed(PDO $pdo): void
{
    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    $pdo->beginTransaction();

    $pdo->exec("INSERT INTO users (id, name, email, county) VALUES (1, 'Utilizator', '', 'B')");

    // Grup de split: colegi de apartament (părți create doar când userul împarte o factură reală)
    $pdo->exec("INSERT INTO split_groups (id, name, owner_id) VALUES (1, 'Apartament', 1)");
    $pdo->exec("INSERT INTO split_members (id, group_id, name, is_owner) VALUES
                (1, 1, 'Tu', 1), (2, 1, 'Ioana', 0), (3, 1, 'Vlad', 0)");

    $pdo->commit();
}

// Rulat direct din CLI: șterge baza și o regenerează.
if (PHP_SAPI === 'cli' && realpath($_SERVER['argv'][0] ?? '') === __FILE__) {
    require_once __DIR__ . '/lib/db.php';
    if (file_exists(DB_PATH)) unlink(DB_PATH);
    $pdo = db();
    $counts = [];
    foreach (['bills', 'split_shares'] as $t) {
        $counts[] = "$t=" . $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    }
    echo 'OK ' . realpath(DB_PATH) . "\n" . implode(', ', $counts) . "\n";
}
