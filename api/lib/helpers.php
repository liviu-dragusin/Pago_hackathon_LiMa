<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Bucharest');

class HttpError extends Exception
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

/** Data "de azi". Poate fi forțată pentru demo cu variabila de mediu APP_TODAY=2026-11-16. */
function today(): string
{
    return getenv('APP_TODAY') ?: date('Y-m-d');
}

function current_period(): string
{
    return substr(today(), 0, 7);
}

function month_add(string $period, int $n): string
{
    return (new DateTimeImmutable($period . '-01'))->modify(sprintf('%+d month', $n))->format('Y-m');
}

function add_days(string $date, int $n): string
{
    return (new DateTimeImmutable($date))->modify(sprintf('%+d day', $n))->format('Y-m-d');
}

/** Zile de la $from la $to (negativ dacă $to e în trecut). */
function days_between(string $from, string $to): int
{
    return (int) (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->format('%r%a');
}

function avg(array $xs): float
{
    return $xs ? array_sum($xs) / count($xs) : 0.0;
}

function stddev(array $xs): float
{
    if (count($xs) < 2) return 0.0;
    $m = avg($xs);
    return sqrt(array_sum(array_map(fn($x) => ($x - $m) ** 2, $xs)) / (count($xs) - 1));
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function body(): array
{
    return json_decode(file_get_contents('php://input') ?: '[]', true) ?? [];
}

/** Calea cerută relativ la folderul api/ (merge și cu Apache la /pago/api, și cu php -S). */
function route_path(): string
{
    $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($base !== '' && str_starts_with($uri, $base)) $uri = substr($uri, strlen($base));
    if (str_starts_with($uri, '/index.php')) $uri = substr($uri, strlen('/index.php'));
    return '/' . trim($uri, '/');
}
