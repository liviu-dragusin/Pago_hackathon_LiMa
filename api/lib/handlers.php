<?php
declare(strict_types=1);

// ---------------------------------------------------------------- facturi

function bills_query(string $where = '', array $params = []): array
{
    $st = db()->prepare(
        "SELECT b.id, b.period, b.amount, b.issued_at, b.due_date, b.paid_at,
                up.id AS account_id, up.client_code, up.alias,
                p.slug, p.name AS provider, p.category, p.color,
                EXISTS (SELECT 1 FROM split_shares s WHERE s.bill_id = b.id) AS is_split
           FROM bills b
           JOIN user_providers up ON up.id = b.user_provider_id
           JOIN providers p ON p.id = up.provider_id
          WHERE up.user_id = :uid $where
          ORDER BY b.due_date DESC, b.id DESC"
    );
    $st->execute([':uid' => USER_ID] + $params);
    return array_map('with_status', $st->fetchAll());
}

function with_status(array $b): array
{
    $b['amount']    = (float) $b['amount'];
    $b['is_split']  = (bool) $b['is_split'];
    $b['status']    = $b['paid_at'] ? 'paid' : ($b['due_date'] < today() ? 'overdue' : 'unpaid');
    $b['days_left'] = days_between(today(), $b['due_date']);
    $b['logo']      = catalog()['providers'][$b['slug']]['logo'] ?? null;
    return $b;
}

function find_bill(int $id): array
{
    return bills_query('AND b.id = :id', [':id' => $id])[0] ?? throw new HttpError(404, 'Factura nu există');
}

function h_bills(): array
{
    $bills = bills_query();
    if ($status = $_GET['status'] ?? null)     $bills = array_filter($bills, fn($b) => $b['status'] === $status);
    if ($category = $_GET['category'] ?? null) $bills = array_filter($bills, fn($b) => $b['category'] === $category);
    return array_values($bills);
}

function h_pay_bill(string $id): array
{
    $bill = find_bill((int) $id);
    if ($bill['paid_at']) throw new HttpError(409, 'Factura este deja plătită');

    $pdo = db();
    $pdo->prepare('UPDATE bills SET paid_at = ? WHERE id = ?')->execute([today(), $bill['id']]);

    return ['bill' => find_bill($bill['id'])];
}

// ---------------------------------------------------------------- predicții și buget

/** Istoricul pe fiecare cont de furnizor: [account_id => [...meta, 'history' => [...]]] */
function account_histories(): array
{
    $st = db()->prepare(
        "SELECT up.id AS account_id, up.alias, p.name AS provider, p.category, p.color, b.period, b.amount,
                COALESCE(up.county, u.county, 'B') AS county
           FROM bills b
           JOIN user_providers up ON up.id = b.user_provider_id
           JOIN providers p ON p.id = up.provider_id
           JOIN users u ON u.id = up.user_id
          WHERE up.user_id = ?
          ORDER BY up.id, b.period"
    );
    $st->execute([USER_ID]);

    $accounts = [];
    foreach ($st->fetchAll() as $r) {
        $id = $r['account_id'];
        $accounts[$id] ??= [
            'account_id' => $id, 'provider' => $r['provider'], 'alias' => $r['alias'],
            'category' => $r['category'], 'color' => $r['color'], 'county' => $r['county'], 'history' => [],
        ];
        $accounts[$id]['history'][] = ['period' => $r['period'], 'amount' => (float) $r['amount']];
    }
    return $accounts;
}

function h_predictions(): array
{
    $accounts  = [];
    $anomalies = [];
    $predictedByCat = [];

    $weatherNext = null;
    foreach (account_histories() as $acc) {
        $seasonal   = predict_next($acc['history']);
        $anomaly    = detect_anomaly($acc['history']);
        $meta       = array_diff_key($acc, ['history' => 1]);

        // Pentru facturile care depind de frig, încercăm modelul meteo (grade-zile de încălzire).
        $weather = null;
        if ($seasonal && in_array($acc['category'], WEATHER_CATEGORIES, true)) {
            $periods = array_column($acc['history'], 'period');
            $next    = weather_next_month($acc['county'], $seasonal['period']);
            $weather = weather_model($acc['history'], weather_for_periods($acc['county'], $periods), $next, $anomaly['period'] ?? null);
            $weatherNext ??= $next + ['county' => $acc['county']];
        }
        $prediction = $weather['prediction'] ?? $seasonal;

        if ($anomaly) $anomalies[] = $meta + $anomaly;
        if ($prediction) $predictedByCat[$acc['category']] = ($predictedByCat[$acc['category']] ?? 0) + $prediction['amount'];

        $accounts[] = $meta + [
            'history'             => array_slice($acc['history'], -12),
            'prediction'          => $prediction,
            'prediction_seasonal' => $seasonal,
            'weather'             => $weather ? array_diff_key($weather, ['prediction' => 1]) : null,
            'anomaly'             => $anomaly,
        ];
    }

    $cur   = current_period();
    $spent = [];
    foreach (bills_query('AND b.period = :p', [':p' => $cur]) as $b) {
        $spent[$b['category']] = ($spent[$b['category']] ?? 0) + $b['amount'];
    }

    $categories = [];
    foreach (h_budgets() as $bud) {
        $cat = $bud['category'];
        $categories[] = $bud + [
            'spent_current'  => round($spent[$cat] ?? 0, 2),
            'predicted_next' => round($predictedByCat[$cat] ?? 0, 2),
        ];
    }

    return [
        'period_current'  => $cur,
        'period_next'     => month_add($cur, 1),
        'total_predicted' => round(array_sum($predictedByCat), 2),
        'total_budget'    => round(array_sum(array_column($categories, 'monthly_limit')), 2),
        'categories'      => $categories,
        'accounts'        => $accounts,
        'anomalies'       => $anomalies,
        'weather_next'    => $weatherNext, // vremea estimată luna viitoare (județul primului cont cu încălzire)
    ];
}

function h_budgets(): array
{
    $st = db()->prepare('SELECT category, monthly_limit FROM budgets WHERE user_id = ? ORDER BY category');
    $st->execute([USER_ID]);
    return array_map(fn($r) => ['category' => $r['category'], 'monthly_limit' => (float) $r['monthly_limit']], $st->fetchAll());
}

function h_update_budget(string $category): array
{
    $limit = body()['monthly_limit'] ?? null;
    if (!is_numeric($limit) || $limit < 0) throw new HttpError(422, 'monthly_limit trebuie să fie un număr pozitiv');

    db()->prepare(
        'INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)
         ON CONFLICT (user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit'
    )->execute([USER_ID, $category, (float) $limit]);
    return h_budgets();
}

// ---------------------------------------------------------------- dashboard

function h_dashboard(): array
{
    $pdo   = db();
    $bills = bills_query();
    $cur   = current_period();

    $unpaid = array_values(array_filter($bills, fn($b) => $b['status'] !== 'paid'));
    usort($unpaid, fn($a, $b) => strcmp($a['due_date'], $b['due_date']));
    $overdue   = array_filter($unpaid, fn($b) => $b['status'] === 'overdue');
    $thisMonth = array_filter($bills, fn($b) => $b['period'] === $cur);

    $monthly = [];
    for ($i = 11; $i >= 0; $i--) {
        $p = month_add($cur, -$i);
        $monthly[$p] = ['period' => $p, 'total' => 0.0];
    }
    foreach ($bills as $b) {
        if (!isset($monthly[$b['period']])) continue;
        $monthly[$b['period']][$b['category']] = round(($monthly[$b['period']][$b['category']] ?? 0) + $b['amount'], 2);
        $monthly[$b['period']]['total'] = round($monthly[$b['period']]['total'] + $b['amount'], 2);
    }

    $pred = h_predictions();
    $sum  = fn(iterable $xs) => round(array_sum(array_column(is_array($xs) ? $xs : iterator_to_array($xs), 'amount')), 2);

    $user = $pdo->query('SELECT id, name, email FROM users WHERE id = ' . USER_ID)->fetch();

    return [
        'user'    => $user,
        'today'   => today(),
        'summary' => [
            'to_pay'         => $sum($unpaid),
            'unpaid_count'   => count($unpaid),
            'overdue_count'  => count($overdue),
            'overdue_amount' => $sum($overdue),
            'month_total'    => $sum($thisMonth),
            'month_paid'     => $sum(array_filter($thisMonth, fn($b) => $b['status'] === 'paid')),
        ],
        'upcoming'   => array_slice($unpaid, 0, 6),
        'monthly'    => array_values($monthly),
        'prediction' => ['period' => $pred['period_next'], 'total' => $pred['total_predicted'], 'budget' => $pred['total_budget']],
        'anomalies'  => $pred['anomalies'],
    ];
}

// ---------------------------------------------------------------- split

function h_splits(): array
{
    $pdo = db();
    $st  = $pdo->prepare('SELECT id, name FROM split_groups WHERE owner_id = ? ORDER BY id');
    $st->execute([USER_ID]);

    $groups = [];
    foreach ($st->fetchAll() as $g) {
        $members = $pdo->prepare('SELECT id, name, is_owner FROM split_members WHERE group_id = ? ORDER BY is_owner DESC, id');
        $members->execute([$g['id']]);
        $members = array_map(fn($m) => ['id' => (int) $m['id'], 'name' => $m['name'], 'is_owner' => (bool) $m['is_owner'], 'owes' => 0.0], $members->fetchAll());
        $memberIdx = array_flip(array_column($members, 'id'));

        $shares = $pdo->prepare(
            'SELECT s.id, s.bill_id, s.member_id, s.amount, s.settled_at, m.name AS member
               FROM split_shares s JOIN split_members m ON m.id = s.member_id
              WHERE s.group_id = ? ORDER BY s.bill_id DESC, m.is_owner DESC, m.id'
        );
        $shares->execute([$g['id']]);

        $bills = [];
        foreach ($shares->fetchAll() as $s) {
            $s['amount'] = (float) $s['amount'];
            $bills[$s['bill_id']] ??= find_bill((int) $s['bill_id']) + ['shares' => []];
            $bills[$s['bill_id']]['shares'][] = $s;
            if (!$s['settled_at']) $members[$memberIdx[$s['member_id']]]['owes'] += $s['amount'];
        }
        foreach ($members as &$m) $m['owes'] = round($m['owes'], 2);
        unset($m);

        $groups[] = [
            'id'         => (int) $g['id'],
            'name'       => $g['name'],
            'members'    => $members,
            'owed_to_me' => round(array_sum(array_column($members, 'owes')), 2),
            'bills'      => array_values($bills),
        ];
    }

    $splittable = array_values(array_filter(
        bills_query('AND b.period >= :p', [':p' => month_add(current_period(), -1)]),
        fn($b) => !$b['is_split']
    ));

    return ['groups' => $groups, 'splittable_bills' => $splittable];
}

/** Body: { bill_id, member_ids: [..] } — împarte egal între membrii aleși (owner-ul e inclus mereu). */
function h_split_bill(string $groupId): array
{
    $pdo  = db();
    $data = body();
    $bill = find_bill((int) ($data['bill_id'] ?? 0));
    if ($bill['is_split']) throw new HttpError(409, 'Factura este deja împărțită');

    $st = $pdo->prepare('SELECT m.id, m.is_owner FROM split_members m JOIN split_groups g ON g.id = m.group_id WHERE g.id = ? AND g.owner_id = ?');
    $st->execute([(int) $groupId, USER_ID]);
    $groupMembers = $st->fetchAll();
    if (!$groupMembers) throw new HttpError(404, 'Grupul nu există');

    $wanted  = array_map('intval', $data['member_ids'] ?? []);
    $chosen  = array_values(array_filter($groupMembers, fn($m) => $m['is_owner'] || in_array((int) $m['id'], $wanted, true)));
    if (count($chosen) < 2) throw new HttpError(422, 'Alege cel puțin un membru cu care să împarți');

    // Împărțire egală în bani; restul de bani rămâne la owner (primul din listă).
    $cents = (int) round($bill['amount'] * 100);
    $each  = intdiv($cents, count($chosen));
    usort($chosen, fn($a, $b) => $b['is_owner'] <=> $a['is_owner']);

    $pdo->beginTransaction();
    $ins = $pdo->prepare('INSERT INTO split_shares (bill_id, group_id, member_id, amount, settled_at) VALUES (?, ?, ?, ?, ?)');
    foreach ($chosen as $i => $m) {
        $amount = $i === 0 ? $cents - $each * (count($chosen) - 1) : $each;
        $ins->execute([$bill['id'], (int) $groupId, $m['id'], $amount / 100, $m['is_owner'] ? today() : null]);
    }
    $pdo->commit();

    return h_splits();
}

function h_settle_share(string $shareId): array
{
    $st = db()->prepare(
        'UPDATE split_shares SET settled_at = ?
          WHERE id = ? AND settled_at IS NULL
            AND group_id IN (SELECT id FROM split_groups WHERE owner_id = ?)'
    );
    $st->execute([today(), (int) $shareId, USER_ID]);
    if (!$st->rowCount()) throw new HttpError(404, 'Partea nu există sau e deja decontată');
    return h_splits();
}

