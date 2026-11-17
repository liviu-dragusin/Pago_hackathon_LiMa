<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/predict.php';
require_once __DIR__ . '/lib/weather.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/handlers.php';
require_once __DIR__ . '/lib/catalog.php';
require_once __DIR__ . '/lib/import.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') exit;

/** Hackathon: un singur user logat. */
const USER_ID = 1;

$routes = [
    ['GET',  '#^/$#',                         fn() => ['name' => 'Pago LiMa API', 'today' => today()]],
    ['GET',  '#^/dashboard$#',                'h_dashboard'],
    ['GET',  '#^/bills$#',                    'h_bills'],
    ['POST', '#^/bills/(\d+)/pay$#',          'h_pay_bill'],
    ['GET',  '#^/predictions$#',              'h_predictions'],
    ['GET',  '#^/budgets$#',                  'h_budgets'],
    ['PUT',  '#^/budgets/([a-z]+)$#',         'h_update_budget'],
    ['GET',  '#^/splits$#',                   'h_splits'],
    ['POST', '#^/splits/(\d+)/bills$#',       'h_split_bill'],
    ['POST', '#^/splits/shares/(\d+)/settle$#', 'h_settle_share'],
    // Modul harta furnizorilor
    ['GET',  '#^/catalog$#',                  'h_catalog'],
    ['GET',  '#^/catalog/localities/([A-Z]{1,2})$#', 'h_localities'],
    ['POST', '#^/accounts$#',                 'h_add_account'],
    ['GET',  '#^/contracts$#',                'h_contracts'],
    ['POST', '#^/contracts$#',                'h_create_contract'],
    // Puntea cu modulul Gmail: furnizorii și facturile confirmate devin date reale în aplicație
    ['POST', '#^/import/gmail$#',             'h_import_gmail'],
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path   = route_path();

try {
    foreach ($routes as [$m, $pattern, $handler]) {
        if ($m === $method && preg_match($pattern, $path, $params)) {
            json_out($handler(...array_slice($params, 1)));
        }
    }
    json_out(['error' => "Ruta nu există: $method $path"], 404);
} catch (HttpError $e) {
    json_out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage(), 'where' => basename($e->getFile()) . ':' . $e->getLine()], 500);
}
