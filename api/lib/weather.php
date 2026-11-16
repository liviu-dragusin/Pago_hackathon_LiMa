<?php
declare(strict_types=1);

/**
 * Date meteo pentru predicția facturilor, de la Open-Meteo (gratuit, fără cheie).
 *
 * Folosim „grade-zile de încălzire” (HDD): pentru fiecare zi, cu cât e temperatura medie sub 18 °C.
 *   HDD(lună) = Σ max(0, 18 − T_zi)
 * O lună cu 10 °C în medie are ~30 × 8 = 240 HDD, una cu 0 °C are ~30 × 18 = 540 HDD.
 * Consumul de încălzire e aproape proporțional cu HDD, deci factura ≈ bază + cost_per_HDD × HDD.
 *
 * Trimitem către Open-Meteo doar coordonatele centrului județului.
 * Rezultatele se păstrează în api/data/weather/ (cache), iar fără internet folosim normalele climatice.
 */

const HDD_BASE_TEMP = 18.0;
const WEATHER_CACHE_DIR = __DIR__ . '/../data/weather';
const WEATHER_CLIMATE_YEARS = 5;

/** Normale climatice lunare (°C), aproximativ media României 1991–2020. Folosite doar fără internet. */
const CLIMATE_NORMALS = [1 => -1.5, 2 => 0.5, 3 => 5.0, 4 => 10.8, 5 => 16.0, 6 => 20.0, 7 => 22.0, 8 => 21.5, 9 => 16.5, 10 => 10.8, 11 => 5.0, 12 => 0.2];

function days_in_period(string $period): int
{
    return (int) (new DateTimeImmutable($period . '-01'))->format('t');
}

/** Centrul aproximativ al județului (media vârfurilor poligonului din judete.geojson), cu cache. */
function county_coords(string $code): array
{
    static $coords = null;
    $cacheFile = WEATHER_CACHE_DIR . '/coords.json';
    if ($coords === null && is_file($cacheFile)) $coords = json_decode((string) file_get_contents($cacheFile), true);

    if (!isset($coords[$code])) {
        $geo = json_decode((string) file_get_contents(__DIR__ . '/../../web/public/geo/judete.geojson'), true);
        $coords = [];
        foreach ($geo['features'] ?? [] as $f) {
            $rings = $f['geometry']['type'] === 'Polygon' ? $f['geometry']['coordinates'] : array_merge(...$f['geometry']['coordinates']);
            $pts = array_merge(...$rings);
            $coords[$f['properties']['code']] = [
                'lat' => round(avg(array_column($pts, 1)), 3),
                'lon' => round(avg(array_column($pts, 0)), 3),
            ];
        }
        weather_write_cache('coords.json', $coords);
    }
    return $coords[$code] ?? ['lat' => 44.43, 'lon' => 26.10]; // București
}

function weather_write_cache(string $file, array $data): void
{
    if (!is_dir(WEATHER_CACHE_DIR)) @mkdir(WEATHER_CACHE_DIR, 0777, true);
    @file_put_contents(WEATHER_CACHE_DIR . '/' . $file, json_encode($data));
}

function weather_http_get(string $url): ?array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 5]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code !== 200) return null;
    $data = json_decode((string) $body, true);
    return is_array($data) ? $data : null;
}

/** [YYYY-MM-DD => T medie] pentru ultimii ani (istoric Open-Meteo). Cache reîmprospătat zilnic. */
function weather_history(string $county): array
{
    $file = "history-$county.json";
    $path = WEATHER_CACHE_DIR . '/' . $file;
    $cached = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
    if ($cached && ($cached['fetched'] ?? '') === today()) return $cached['days'];

    $c = county_coords($county);
    $end = add_days(today(), -2); // arhiva are o întârziere de 1–2 zile
    $start = (new DateTimeImmutable(today()))->modify('-' . (WEATHER_CLIMATE_YEARS + 1) . ' years')->format('Y-m-01');
    $data = weather_http_get('https://archive-api.open-meteo.com/v1/archive?' . http_build_query([
        'latitude' => $c['lat'], 'longitude' => $c['lon'],
        'start_date' => $start, 'end_date' => $end,
        'daily' => 'temperature_2m_mean', 'timezone' => 'Europe/Bucharest',
    ]));

    if (!$data) return $cached['days'] ?? []; // fără internet: ultimul cache, dacă există

    $days = [];
    foreach ($data['daily']['time'] ?? [] as $i => $date) {
        $t = $data['daily']['temperature_2m_mean'][$i] ?? null;
        if ($t !== null) $days[$date] = (float) $t;
    }
    weather_write_cache($file, ['fetched' => today(), 'days' => $days]);
    return $days;
}

/** Prognoza pe următoarele 16 zile: [YYYY-MM-DD => T medie]. */
function weather_forecast(string $county): array
{
    $file = "forecast-$county.json";
    $path = WEATHER_CACHE_DIR . '/' . $file;
    $cached = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
    if ($cached && ($cached['fetched'] ?? '') === today()) return $cached['days'];

    $c = county_coords($county);
    $data = weather_http_get('https://api.open-meteo.com/v1/forecast?' . http_build_query([
        'latitude' => $c['lat'], 'longitude' => $c['lon'],
        'daily' => 'temperature_2m_mean', 'forecast_days' => 16, 'timezone' => 'Europe/Bucharest',
    ]));
    if (!$data) return $cached['days'] ?? [];

    $days = [];
    foreach ($data['daily']['time'] ?? [] as $i => $date) {
        $t = $data['daily']['temperature_2m_mean'][$i] ?? null;
        if ($t !== null) $days[$date] = (float) $t;
    }
    weather_write_cache($file, ['fetched' => today(), 'days' => $days]);
    return $days;
}

/** Temperatura medie și HDD pentru o lună, din zilele disponibile (completate cu normala, dacă lipsesc). */
function month_weather_from_days(string $period, array $days, string $source): array
{
    $total = days_in_period($period);
    $temps = [];
    foreach ($days as $date => $t) {
        if (str_starts_with($date, $period)) $temps[] = $t;
    }
    $normal = CLIMATE_NORMALS[(int) substr($period, 5, 2)];
    $missing = $total - count($temps);
    $hdd = array_sum(array_map(fn($t) => max(0, HDD_BASE_TEMP - $t), $temps)) + $missing * max(0, HDD_BASE_TEMP - $normal);
    $temp = (array_sum($temps) + $missing * $normal) / $total;

    return [
        'period' => $period,
        'temp'   => round($temp, 1),
        'hdd'    => round($hdd, 1),
        'days'   => $total,
        'source' => count($temps) === 0 ? 'normală climatică' : ($missing > 2 ? "$source + normală" : $source),
    ];
}

/** Vremea pentru lunile din istoric: [period => [temp, hdd, ...]]. */
function weather_for_periods(string $county, array $periods): array
{
    $days = weather_history($county);
    $out = [];
    foreach ($periods as $p) $out[$p] = month_weather_from_days($p, $days, 'Open-Meteo');
    return $out;
}

/**
 * Vremea estimată pentru o lună viitoare:
 * prognoza Open-Meteo pentru zilele pe care le acoperă + media acelorași zile din ultimii ani pentru rest.
 */
function weather_next_month(string $county, string $period): array
{
    $history = weather_history($county);
    $forecast = weather_forecast($county);
    $total = days_in_period($period);
    $month = substr($period, 5, 2);
    $year = (int) substr($period, 0, 4);

    $temps = [];
    $hdd = 0.0;
    $forecastDays = 0;
    $climateYears = [];
    for ($d = 1; $d <= $total; $d++) {
        $date = sprintf('%s-%02d', $period, $d);
        if (isset($forecast[$date])) {
            $t = $forecast[$date];
            $forecastDays++;
        } else {
            // media aceleiași zile din ultimii ani; fără date, normala lunii
            $past = [];
            for ($y = $year - WEATHER_CLIMATE_YEARS; $y < $year; $y++) {
                $key = sprintf('%d-%s-%02d', $y, $month, $d);
                if (isset($history[$key])) {
                    $past[] = $history[$key];
                    $climateYears[$y] = true;
                }
            }
            $t = $past ? avg($past) : CLIMATE_NORMALS[(int) $month];
        }
        $temps[] = $t;
        $hdd += max(0, HDD_BASE_TEMP - $t);
    }

    $fc = $forecastDays === 1 ? 'prognoză 1 zi' : "prognoză $forecastDays zile";
    $source = $climateYears
        ? 'media ultimilor ' . count($climateYears) . ' ani' . ($forecastDays ? " + $fc" : '')
        : ($forecastDays ? "normală climatică + $fc" : 'normală climatică');

    return [
        'period'        => $period,
        'temp'          => round(avg($temps), 1),
        'hdd'           => round($hdd, 1),
        'days'          => $total,
        'forecast_days' => $forecastDays,
        'source'        => $source,
    ];
}
