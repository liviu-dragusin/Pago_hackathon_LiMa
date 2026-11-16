<?php
declare(strict_types=1);

const LEVELS = [
    ['name' => 'Bronze',   'min' => 0],
    ['name' => 'Silver',   'min' => 1000],
    ['name' => 'Gold',     'min' => 2500],
    ['name' => 'Platinum', 'min' => 5000],
];

const POINTS_SPLIT = 10;

/** @return array{0:int,1:string} [puncte, motiv] */
function points_for_payment(string $dueDate, string $paidAt): array
{
    $daysEarly = days_between($paidAt, $dueDate);
    if ($daysEarly >= 3) return [50, 'Plată cu cel puțin 3 zile înainte de scadență'];
    if ($daysEarly >= 0) return [20, 'Plată la timp'];
    return [0, 'Plată după scadență'];
}

function add_points(PDO $pdo, int $userId, int $points, string $reason, ?int $billId = null, ?string $at = null): void
{
    $pdo->prepare('INSERT INTO points_ledger (user_id, points, reason, bill_id, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$userId, $points, $reason, $billId, $at ?? today()]);
}

function level_info(int $points): array
{
    $current = LEVELS[0];
    $next    = null;
    foreach (LEVELS as $i => $lvl) {
        if ($points >= $lvl['min']) {
            $current = $lvl;
            $next    = LEVELS[$i + 1] ?? null;
        }
    }
    $progress = $next ? ($points - $current['min']) / ($next['min'] - $current['min']) : 1;

    return [
        'name'     => $current['name'],
        'next'     => $next['name'] ?? null,
        'to_next'  => $next ? $next['min'] - $points : 0,
        'progress' => round($progress * 100, 1),
    ];
}

/** Câte plăți la timp consecutive are userul (cele mai recente). */
function payment_streak(PDO $pdo, int $userId): int
{
    $st = $pdo->prepare(
        'SELECT b.paid_at <= b.due_date AS on_time
           FROM bills b JOIN user_providers up ON up.id = b.user_provider_id
          WHERE up.user_id = ? AND b.paid_at IS NOT NULL
          ORDER BY b.paid_at DESC, b.id DESC'
    );
    $st->execute([$userId]);
    $streak = 0;
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $onTime) {
        if (!$onTime) break;
        $streak++;
    }
    return $streak;
}

function badge_defs(): array
{
    return [
        'first_pay'  => ['name' => 'Primul pas',    'description' => 'Ai plătit prima factură prin aplicație', 'icon' => 'rocket',  'metric' => 'paid',   'threshold' => 1],
        'punctual'   => ['name' => 'Mereu la timp', 'description' => '10 facturi plătite până la scadență',    'icon' => 'clock',   'metric' => 'ontime', 'threshold' => 10],
        'early_bird' => ['name' => 'Early bird',    'description' => '5 facturi plătite cu 3+ zile mai devreme', 'icon' => 'sunrise', 'metric' => 'early',  'threshold' => 5],
        'streak_10'  => ['name' => 'Serie de foc',  'description' => '10 plăți la timp la rând',               'icon' => 'flame',   'metric' => 'streak', 'threshold' => 10],
        'splitter'   => ['name' => 'Split master',  'description' => '3 facturi împărțite cu alții',           'icon' => 'users',   'metric' => 'splits', 'threshold' => 3],
        'veteran'    => ['name' => 'Veteran',       'description' => '150 de facturi plătite',                 'icon' => 'medal',   'metric' => 'paid',   'threshold' => 150],
    ];
}

function badge_metrics(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare(
        'SELECT COUNT(b.paid_at)                                                   AS paid,
                SUM(b.paid_at IS NOT NULL AND b.paid_at <= b.due_date)             AS ontime,
                SUM(b.paid_at IS NOT NULL AND julianday(b.due_date) - julianday(b.paid_at) >= 3) AS early
           FROM bills b JOIN user_providers up ON up.id = b.user_provider_id
          WHERE up.user_id = ?'
    );
    $st->execute([$userId]);
    $m = array_map('intval', $st->fetch());

    $st = $pdo->prepare(
        'SELECT COUNT(DISTINCT s.bill_id) FROM split_shares s JOIN split_groups g ON g.id = s.group_id WHERE g.owner_id = ?'
    );
    $st->execute([$userId]);
    $m['splits'] = (int) $st->fetchColumn();
    $m['streak'] = payment_streak($pdo, $userId);
    return $m;
}

/** Acordă badge-urile nou câștigate și le întoarce. */
function check_badges(PDO $pdo, int $userId): array
{
    $metrics = badge_metrics($pdo, $userId);
    $st = $pdo->prepare('SELECT badge_code FROM user_badges WHERE user_id = ?');
    $st->execute([$userId]);
    $owned = $st->fetchAll(PDO::FETCH_COLUMN);

    $new = [];
    foreach (badge_defs() as $code => $def) {
        if (in_array($code, $owned, true) || $metrics[$def['metric']] < $def['threshold']) continue;
        $pdo->prepare('INSERT INTO user_badges (user_id, badge_code, earned_at) VALUES (?, ?, ?)')
            ->execute([$userId, $code, today()]);
        $new[] = ['code' => $code] + $def;
    }
    return $new;
}

function rewards_summary(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare('SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE user_id = ?');
    $st->execute([$userId]);
    $points = (int) $st->fetchColumn();

    return ['points' => $points, 'level' => level_info($points), 'streak' => payment_streak($pdo, $userId)];
}
