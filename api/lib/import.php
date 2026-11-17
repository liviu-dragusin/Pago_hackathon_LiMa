<?php
declare(strict_types=1);

/*
 * Puntea dintre importul din Gmail (modules/gmail-import, baza data/app.sqlite) și aplicația (api/data/pago.sqlite).
 * După ce userul confirmă furnizorii propuși, facturile găsite în inbox devin conturi + facturi reale în aplicație:
 * de aici le citesc dashboard-ul, lista de facturi, bugetul și predicția.
 */

const GMAIL_DB_PATH = __DIR__ . '/../../modules/gmail-import/data/app.sqlite';

/** Categoriile modulului Gmail -> categoriile aplicației. */
const GMAIL_CATEGORY_MAP = [
    'energie' => 'energie', 'gaz' => 'gaz', 'apa' => 'apa', 'internet' => 'internet', 'telecom' => 'telefonie',
    'salubritate' => 'salubrizare', 'intretinere' => 'intretinere', 'asigurare' => 'diverse',
];

function gmail_db(): PDO
{
    if (!is_file(GMAIL_DB_PATH)) throw new HttpError(404, 'Nu există nicio scanare Gmail de importat');
    $pdo = new PDO('sqlite:' . GMAIL_DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA busy_timeout=5000');
    return $pdo;
}

function ascii_name(string $s): string
{
    $s = strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/** Slug-ul din catalogul Pago pentru un nume de furnizor găsit în email (null = în afara catalogului). */
function catalog_slug_for(string $name): ?string
{
    $n = ascii_name($name);
    if ($n === '') return null;
    foreach (catalog()['providers'] as $slug => $p) {
        $c = ascii_name($p['name']);
        if ($c === $n || (strlen($n) >= 4 && (str_starts_with($c, $n . ' ') || str_starts_with($n, $c . ' ')))) return $slug;
    }
    return null;
}

/** Perioada (YYYY-MM) unei facturi: luna emiterii (data emailului), altfel luna scadenței. */
function invoice_period(?string $issued, ?string $due): ?string
{
    foreach ([$issued, $due] as $d) {
        if ($d && preg_match('/^(\d{4}-\d{2})-\d{2}/', $d, $m)) return $m[1];
    }
    return null;
}

/** Body: { job_id } — importă în aplicație furnizorii confirmați (și ne-flagați) dintr-o scanare Gmail. Idempotent. */
function h_import_gmail(): array
{
    $jobId = (int) (body()['job_id'] ?? 0);
    $gmail = gmail_db();

    $job = $gmail->prepare('SELECT j.id, u.email FROM scan_jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ?');
    $job->execute([$jobId]);
    $job = $job->fetch() ?: throw new HttpError(404, 'Scanare inexistentă');

    $providers = $gmail->prepare(
        "SELECT * FROM discovered_providers WHERE job_id = ? AND status = 'confirmed' AND COALESCE(security_flag, 0) = 0"
    );
    $providers->execute([$jobId]);
    $invoicesOf = $gmail->prepare('SELECT * FROM discovered_invoices WHERE discovered_id = ? ORDER BY due_date');

    $pdo = db();
    $find     = $pdo->prepare('SELECT id FROM providers WHERE category = ? AND ((slug IS NOT NULL AND slug = ?) OR (slug IS NULL AND name = ?))');
    $insProv  = $pdo->prepare('INSERT INTO providers (slug, name, category, color) VALUES (?, ?, ?, ?)');
    $findAcc  = $pdo->prepare('SELECT id FROM user_providers WHERE user_id = ? AND provider_id = ? AND client_code = ?');
    $insAcc   = $pdo->prepare('INSERT INTO user_providers (user_id, provider_id, client_code, alias, county, created_at, source) VALUES (?, ?, ?, ?, NULL, ?, ?)');
    $upBill   = $pdo->prepare(
        'INSERT INTO bills (user_provider_id, period, amount, issued_at, due_date, paid_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_provider_id, period) DO UPDATE SET amount = excluded.amount, issued_at = excluded.issued_at, due_date = excluded.due_date'
    );
    $insBudget = $pdo->prepare('INSERT OR IGNORE INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)');

    $stats = ['providers' => 0, 'bills' => 0, 'skipped' => 0];
    $pdo->beginTransaction();

    // Contul aplicației devine contul Gmail conectat (un singur user în prototip).
    $name = ucwords(str_replace(['.', '_', '-'], ' ', explode('@', (string) $job['email'])[0]));
    $pdo->prepare('UPDATE users SET email = ?, name = ? WHERE id = ?')->execute([$job['email'], $name ?: 'Utilizator', USER_ID]);

    // Importul ÎNLOCUIEȘTE ce a venit anterior din Gmail (alt cont, altă scanare, mod demo), ca în aplicație
    // să rămână exact furnizorii și facturile scanării curente. Conturile adăugate manual nu se ating.
    $old = "SELECT id FROM user_providers WHERE user_id = " . USER_ID . " AND source = 'gmail'";
    $pdo->exec("DELETE FROM split_shares WHERE bill_id IN (SELECT id FROM bills WHERE user_provider_id IN ($old))");
    $pdo->exec("DELETE FROM bills WHERE user_provider_id IN ($old)");
    $pdo->exec("DELETE FROM user_providers WHERE user_id = " . USER_ID . " AND source = 'gmail'");
    $pdo->exec('DELETE FROM providers WHERE id NOT IN (SELECT provider_id FROM user_providers)');
    $pdo->exec('DELETE FROM budgets WHERE user_id = ' . USER_ID); // limitele implicite se regenerează mai jos

    foreach ($providers->fetchAll() as $d) {
        $category = GMAIL_CATEGORY_MAP[$d['category'] ?? ''] ?? 'diverse';
        $slug     = catalog_slug_for((string) $d['name']);
        $pname    = $slug ? catalog()['providers'][$slug]['name'] : (string) $d['name'];

        $find->execute([$category, $slug, $pname]);
        $providerId = $find->fetchColumn();
        if (!$providerId) {
            $insProv->execute([$slug, $pname, $category, CATEGORY_COLORS[$category] ?? '#64748b']);
            $providerId = $pdo->lastInsertId();
        }

        $code = (string) ($d['client_code'] ?? '');
        $findAcc->execute([USER_ID, $providerId, $code]);
        $accountId = $findAcc->fetchColumn();
        if (!$accountId) {
            $insAcc->execute([USER_ID, $providerId, $code, $pname, today(), 'gmail']);
            $accountId = $pdo->lastInsertId();
            $stats['providers']++;
        }

        $invoicesOf->execute([$d['id']]);
        $invoices = $invoicesOf->fetchAll();
        if (!$invoices && $d['last_amount'] !== null) { // scanări vechi, fără istoric: păstrăm măcar ultima factură
            $invoices = [['amount' => $d['last_amount'], 'issued_at' => null, 'due_date' => $d['last_due_date']]];
        }

        // Doar ultima factură a unui furnizor e de plată; cele anterioare, deja scadente, se consideră plătite
        // (altfel istoricul din inbox ar apărea ca restanțe). Plățile făcute ulterior în aplicație nu se suprascriu.
        $latestDue = max(array_column($invoices, 'due_date') ?: ['']);

        $max = 0.0;
        foreach ($invoices as $inv) {
            $period = invoice_period($inv['issued_at'], $inv['due_date']);
            if (!$period || !$inv['due_date']) { $stats['skipped']++; continue; }
            $paidAt = ($inv['due_date'] < $latestDue && $inv['due_date'] < today()) ? $inv['due_date'] : null;
            $upBill->execute([$accountId, $period, (float) $inv['amount'], $inv['issued_at'] ?: $inv['due_date'], $inv['due_date'], $paidAt]);
            $max = max($max, (float) $inv['amount']);
            $stats['bills']++;
        }

        // Categorie nouă = buget implicit ceva peste cea mai mare factură, ca să apară în estimări.
        if ($max > 0) $insBudget->execute([USER_ID, $category, ceil($max * 1.25 / 10) * 10]);
    }
    $pdo->commit();

    return $stats;
}
