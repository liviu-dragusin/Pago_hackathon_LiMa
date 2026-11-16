<?php
declare(strict_types=1);

require_once __DIR__ . '/../seed.php';

const DB_PATH = __DIR__ . '/../data/pago.sqlite';

/** Conexiunea PDO. Dacă fișierul .sqlite nu există, îl creează și îl populează cu date mock. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $fresh = !file_exists(DB_PATH);
    if (!is_dir(dirname(DB_PATH))) mkdir(dirname(DB_PATH), 0777, true);

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

    if ($fresh) seed($pdo);
    return $pdo;
}
