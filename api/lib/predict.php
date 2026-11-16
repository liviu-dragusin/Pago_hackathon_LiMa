<?php
declare(strict_types=1);

/**
 * Predicția facturii următoare dintr-un istoric [['period' => 'YYYY-MM', 'amount' => float], ...] sortat crescător.
 *
 * - Dacă avem aceeași lună de anul trecut: model sezonier = valoarea de anul trecut × trend
 *   (trend = media ultimelor 3 luni / media acelorași 3 luni de anul trecut, limitat la 0.8–1.3).
 * - Altfel: media ultimelor 3 luni.
 * Intervalul (low/high) vine din variația recentă, minim ±8%.
 */
function predict_next(array $history): ?array
{
    if (!$history) return null;

    $byPeriod = array_column($history, 'amount', 'period');
    $last     = end($history)['period'];
    $next     = month_add($last, 1);
    $recent   = array_slice($history, -3);
    $avgRecent = avg(array_column($recent, 'amount'));

    $lastYear = $byPeriod[month_add($next, -12)] ?? null;
    if ($lastYear !== null) {
        $prevYear = [];
        foreach ($recent as $h) {
            $v = $byPeriod[month_add($h['period'], -12)] ?? null;
            if ($v !== null) $prevYear[] = $v;
        }
        $trend  = count($prevYear) === count($recent) && avg($prevYear) > 0
            ? max(0.8, min(1.3, $avgRecent / avg($prevYear)))
            : 1.0;
        $amount = $lastYear * $trend;
        $method = 'sezonier';
    } else {
        $trend  = 1.0;
        $amount = $avgRecent;
        $method = 'medie 3 luni';
    }

    $margin = max($amount * 0.08, stddev(array_column(array_slice($history, -6), 'amount')) * 0.5);

    return [
        'period' => $next,
        'amount' => round($amount, 2),
        'low'    => round(max(0, $amount - $margin), 2),
        'high'   => round($amount + $margin, 2),
        'method' => $method,
        'trend'  => round($trend, 3),
    ];
}

/** Ultima factură e cu peste $threshold mai mare decât ce prezicea modelul fără ea? */
function detect_anomaly(array $history, float $threshold = 0.2): ?array
{
    if (count($history) < 4) return null;

    $last     = array_pop($history);
    $expected = predict_next($history);
    if (!$expected || $expected['period'] !== $last['period'] || $expected['amount'] <= 0) return null;

    $pct = $last['amount'] / $expected['amount'] - 1;
    if ($pct <= $threshold) return null;

    return [
        'period'   => $last['period'],
        'amount'   => $last['amount'],
        'expected' => $expected['amount'],
        'pct'      => round($pct * 100, 1),
    ];
}
