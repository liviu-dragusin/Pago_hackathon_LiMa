<?php
declare(strict_types=1);

/*
 * Date mock deterministe (mt_srand fix) => toată echipa are aceleași date.
 * Istoricul e generat relativ la data de azi, deci dashboard-ul arată mereu "proaspăt".
 *
 * Regenerare:  php api/seed.php
 * (sau pur și simplu șterge api/data/pago.sqlite — se recreează la primul request)
 */

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/rewards.php';

const SEED_MONTHS = 18;
const REWARDS_MONTHS = 8;

const MOCK_PROVIDERS = [
    // slug (din api/catalog/providers.json), name, category, color, client code prefix, alias
    ['ppc-energie',        'PPC Energie',              'energie',     '#f59e0b', 'PPC', 'Curent apartament'],
    ['engie',              'Engie',                    'gaz',         '#ef4444', 'ENG', 'Gaz apartament'],
    ['apa-nova-bucuresti', 'Apa Nova București',       'apa',         '#0ea5e9', 'APN', 'Apă'],
    ['digi',               'Digi',                     'internet',    '#8b5cf6', 'DIG', 'Internet + TV'],
    ['orange',             'Orange',                   'telefonie',   '#f97316', 'ORG', 'Abonament mobil'],
    [null,                 'Asociația de Proprietari', 'intretinere', '#10b981', 'ASP', 'Întreținere bloc'],
];

const MOCK_BUDGETS = [
    'energie' => 250, 'gaz' => 350, 'apa' => 100, 'internet' => 60, 'telefonie' => 80, 'intretinere' => 420,
];

/** Sumă realistă pe categorie: sezonalitate (gaz/întreținere iarna, curent vara la AC) + inflație ~7%/an + zgomot. */
function mock_amount(string $category, int $month, int $index): float
{
    $season = cos(($month - 1) / 12 * 2 * M_PI); // 1 în ianuarie, -1 în iulie
    $base = match ($category) {
        'energie'     => 170 + 35 * $season + (in_array($month, [7, 8], true) ? 45 : 0),
        'gaz'         => max(35, 230 + 210 * $season),
        'apa'         => 72,
        'internet'    => $index >= 12 ? 49 : 45, // scumpire la abonament
        'telefonie'   => 55 + (mt_rand(0, 4) === 0 ? mt_rand(10, 35) : 0), // extra-opțiuni ocazional
        'intretinere' => 280 + 120 * $season,
    };
    if ($category === 'internet') return (float) $base;

    $inflation = 1 + 0.006 * $index;
    $noise     = 1 + mt_rand(-60, 60) / 1000;
    return round($base * $inflation * $noise, 2);
}

function seed(PDO $pdo): void
{
    mt_srand(42);
    $today = today();
    $cur   = current_period();

    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    $pdo->beginTransaction();

    $pdo->exec("INSERT INTO users (id, name, email, county) VALUES (1, 'Andrei Popescu', 'andrei.popescu@example.com', 'B')");

    $insProvider = $pdo->prepare('INSERT INTO providers (slug, name, category, color) VALUES (?, ?, ?, ?)');
    $insAccount  = $pdo->prepare("INSERT INTO user_providers (user_id, provider_id, client_code, alias, county, created_at) VALUES (1, ?, ?, ?, 'B', ?)");
    $insBill     = $pdo->prepare('INSERT INTO bills (user_provider_id, period, amount, issued_at, due_date, paid_at) VALUES (?, ?, ?, ?, ?, ?)');

    $billIds = []; // [category][monthsAgo] => bill id

    foreach (MOCK_PROVIDERS as [$slug, $name, $category, $color, $prefix, $alias]) {
        $insProvider->execute([$slug, $name, $category, $color]);
        $insAccount->execute([$pdo->lastInsertId(), $prefix . mt_rand(1000000, 9999999), $alias, month_add($cur, -SEED_MONTHS) . '-01']);
        $accountId = (int) $pdo->lastInsertId();

        for ($ago = SEED_MONTHS - 1; $ago >= 0; $ago--) {
            $period = month_add($cur, -$ago);
            $issued = sprintf('%s-%02d', $period, mt_rand(3, 8));
            if ($issued > $today) continue; // factura lunii curente nu a fost încă emisă

            $due    = add_days($issued, mt_rand(18, 24));
            $amount = mock_amount($category, (int) substr($period, 5, 2), SEED_MONTHS - 1 - $ago);
            if ($category === 'gaz' && $ago === 0) $amount = round($amount * 1.45, 2); // anomalie pentru demo

            $paidAt = null;
            if ($due < $today) {
                // Facturile trecute sunt plătite, cu excepția internetului de luna trecută (restanță pentru demo)
                if (!($category === 'internet' && $ago === 1)) {
                    $offset = mt_rand(1, 100) <= 8 ? -mt_rand(1, 5) : mt_rand(0, 12); // ~8% întârziate
                    $paidAt = min($today, max($issued, add_days($due, -$offset)));
                }
            } elseif ($category === 'apa' && $ago === 0) {
                $paidAt = min($today, add_days($issued, 2)); // una din luna curentă deja plătită
            }

            $insBill->execute([$accountId, $period, $amount, $issued, $due, $paidAt]);
            $billId = (int) $pdo->lastInsertId();
            $billIds[$category][$ago] = $billId;

            // Userul s-a înscris în programul de recompense acum REWARDS_MONTHS luni
            if ($paidAt && $ago < REWARDS_MONTHS) {
                [$points, $reason] = points_for_payment($due, $paidAt);
                if ($points > 0) add_points($pdo, 1, $points, "$reason · $name", $billId, $paidAt);
            }
        }
    }

    $insBudget = $pdo->prepare('INSERT INTO budgets (user_id, category, monthly_limit) VALUES (1, ?, ?)');
    foreach (MOCK_BUDGETS as $category => $limit) $insBudget->execute([$category, $limit]);

    // Grup de split: colegi de apartament
    $pdo->exec("INSERT INTO split_groups (id, name, owner_id) VALUES (1, 'Apartament Floreasca', 1)");
    $pdo->exec("INSERT INTO split_members (id, group_id, name, is_owner) VALUES
                (1, 1, 'Andrei (tu)', 1), (2, 1, 'Ioana', 0), (3, 1, 'Vlad', 0)");

    $insShare = $pdo->prepare('INSERT INTO split_shares (bill_id, group_id, member_id, amount, settled_at) VALUES (?, 1, ?, ?, ?)');
    $amountOf = $pdo->prepare('SELECT amount, issued_at FROM bills WHERE id = ?');
    foreach (['energie', 'internet', 'intretinere'] as $category) {
        foreach ([2, 1] as $ago) {
            $billId = $billIds[$category][$ago] ?? null;
            if (!$billId) continue;
            $amountOf->execute([$billId]);
            ['amount' => $amount, 'issued_at' => $issued] = $amountOf->fetch();

            $cents = (int) round($amount * 100);
            $each  = intdiv($cents, 3);
            $insShare->execute([$billId, 1, ($cents - 2 * $each) / 100, $issued]);
            $insShare->execute([$billId, 2, $each / 100, $ago === 2 ? add_days($issued, 5) : null]);
            $insShare->execute([$billId, 3, $each / 100, $ago === 2 && $category !== 'intretinere' ? add_days($issued, 9) : null]);
            add_points($pdo, 1, POINTS_SPLIT, 'Factură împărțită · Apartament Floreasca', $billId, $issued);
        }
    }

    // O cerere de contract deja trimisă din harta de furnizori (pentru demo)
    $pdo->prepare(
        "INSERT INTO contract_requests (user_id, provider_slug, provider_name, category, county, locality, address, full_name, phone, status, created_at)
         VALUES (1, 'hidroelectrica', 'Hidroelectrica', 'energie', 'B', 'Sectorul 1', 'Str. Exemplu nr. 1', 'Andrei Popescu', '0700000000', 'in_analiza', ?)"
    )->execute([add_days($today, -3)]);

    check_badges($pdo, 1);
    $pdo->commit();
}

// Rulat direct din CLI: șterge baza și o regenerează.
if (PHP_SAPI === 'cli' && realpath($_SERVER['argv'][0] ?? '') === __FILE__) {
    require_once __DIR__ . '/lib/db.php';
    if (file_exists(DB_PATH)) unlink(DB_PATH);
    $pdo = db();
    $counts = [];
    foreach (['bills', 'points_ledger', 'split_shares', 'user_badges'] as $t) {
        $counts[] = "$t=" . $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    }
    echo 'OK ' . realpath(DB_PATH) . "\n" . implode(', ', $counts) . "\n";
}
