<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/google_oauth.php';
require __DIR__ . '/../src/routes/auth.php';
require __DIR__ . '/../src/routes/scan.php';
require __DIR__ . '/../src/routes/providers.php';

session_boot();

// Rutele sunt căutate după „/api/” din URL, deci funcționează și sub un alias Apache (ex: /pago/api/...).
$path = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pos = strpos($path, '/api/');
$route = $pos === false ? '' : substr($path, $pos + 4);
$key = $_SERVER['REQUEST_METHOD'] . ' ' . rtrim($route, '/');

$routes = [
    'GET /auth/google/start'     => 'auth_google_start',
    'GET /auth/google/callback'  => 'auth_google_callback',
    'POST /scan/start'           => 'scan_start',
    'GET /scan/status'           => 'scan_status',
    'GET /providers/discovered'  => 'providers_discovered',
    'POST /providers/confirm'    => 'providers_confirm',
];

if (!isset($routes[$key])) {
    json_out(['error' => 'Ruta nu există: ' . $key], 404);
}

db(); // asigură schema
$routes[$key]();
