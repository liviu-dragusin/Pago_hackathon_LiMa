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

/** Categoriile la care factura depinde de frig (încălzire). */
const WEATHER_CATEGORIES = ['gaz', 'energie', 'intretinere'];

/** Regresie liniară (cele mai mici pătrate) pentru câteva variabile: rezolvă (XᵀX)β = Xᵀy prin eliminare Gauss. */
function ols(array $X, array $y): ?array
{
    $k = count($X[0]);
    $A = array_fill(0, $k, array_fill(0, $k + 1, 0.0));
    foreach ($X as $r => $row) {
        for ($i = 0; $i < $k; $i++) {
            for ($j = 0; $j < $k; $j++) $A[$i][$j] += $row[$i] * $row[$j];
            $A[$i][$k] += $row[$i] * $y[$r];
        }
    }
    for ($c = 0; $c < $k; $c++) {
        $pivot = $c;
        for ($r = $c + 1; $r < $k; $r++) if (abs($A[$r][$c]) > abs($A[$pivot][$c])) $pivot = $r;
        if (abs($A[$pivot][$c]) < 1e-9) return null;
        [$A[$c], $A[$pivot]] = [$A[$pivot], $A[$c]];
        for ($r = 0; $r < $k; $r++) {
            if ($r === $c) continue;
            $f = $A[$r][$c] / $A[$c][$c];
            for ($j = $c; $j <= $k; $j++) $A[$r][$j] -= $f * $A[$c][$j];
        }
    }
    return array_map(fn($i) => $A[$i][$k] / $A[$i][$i], range(0, $k - 1));
}

/**
 * Modelul meteo: factura = bază + cost_per_HDD × HDD + trend × luni.
 *   - bază: ce plătești oricum (apă caldă, gătit, abonament)
 *   - cost_per_HDD: cât adaugă fiecare grad-zi de frig (lei / grad-zi)
 *   - trend: scumpiri în timp (lei / lună)
 * Returnează null dacă nu sunt destule date sau dacă vremea nu explică factura (R² mic).
 *
 * @param array $history  [['period', 'amount'], ...] crescător
 * @param array $weather  [period => ['temp', 'hdd', 'days']] pentru lunile din istoric
 * @param array $next     vremea estimată pentru luna următoare (weather_next_month)
 * @param ?string $skip   o lună de exclus din antrenare (ex. anomalia detectată)
 */
function weather_model(array $history, array $weather, array $next, ?string $skip = null): ?array
{
    $rows = [];
    foreach ($history as $i => $h) {
        if ($h['period'] === $skip || !isset($weather[$h['period']])) continue;
        $rows[] = ['i' => $i, 'period' => $h['period'], 'amount' => $h['amount']] + $weather[$h['period']];
    }
    if (count($rows) < 8) return null;

    $X = array_map(fn($r) => [1.0, $r['hdd'], (float) $r['i']], $rows);
    $y = array_column($rows, 'amount');
    $beta = ols($X, $y);
    if (!$beta || $beta[1] <= 0) return null;
    [$a, $b, $c] = $beta;

    $mean = avg($y);
    $ssTot = array_sum(array_map(fn($v) => ($v - $mean) ** 2, $y));
    $residuals = array_map(fn($r, $v) => $v - ($a + $b * $r['hdd'] + $c * $r['i']), $rows, $y);
    $ssRes = array_sum(array_map(fn($e) => $e ** 2, $residuals));
    $r2 = $ssTot > 0 ? 1 - $ssRes / $ssTot : 0;
    if ($r2 < 0.6) return null;

    $tNext = count($history); // indexul lunii următoare
    $base = $a + $c * $tNext;
    $amount = $base + $b * $next['hdd'];
    $residStd = sqrt($ssRes / max(1, count($rows) - 3));
    $margin = max($amount * 0.08, 1.28 * $residStd); // ~80% din cazuri

    return [
        'prediction' => [
            'period' => $next['period'],
            'amount' => round($amount, 2),
            'low'    => round(max(0, $amount - $margin), 2),
            'high'   => round($amount + $margin, 2),
            'method' => 'meteo',
            'trend'  => 1.0,
        ],
        'model' => [
            'base'          => round($base, 2),          // lei/lună fără încălzire, la nivelul de preț actual
            'per_hdd'       => round($b, 4),             // lei pentru fiecare grad-zi sub 18 °C
            'trend_month'   => round($c, 2),             // lei/lună scumpire
            'r2'            => round($r2, 3),
            'base_temp'     => HDD_BASE_TEMP,
            'samples'       => count($rows),
        ],
        'next'   => $next,
        'points' => array_map(fn($r) => [
            'period' => $r['period'],
            'temp'   => $r['temp'],
            'hdd'    => $r['hdd'],
            'amount' => $r['amount'],
            // factura adusă la prețul de azi, ca punctele să fie comparabile pe grafic
            'amount_today' => round($r['amount'] + $c * ($tNext - $r['i']), 2),
        ], $rows),
    ];
}
