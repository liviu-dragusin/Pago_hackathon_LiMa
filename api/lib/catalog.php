<?php
declare(strict_types=1);

/*
 * Modul "Harta furnizorilor": catalogul de furnizori Pago pe județe + adăugare cont / cerere de contract.
 * Datele statice sunt în api/data/catalog/*.json (generate/curate o dată, comise în repo).
 */

const POINTS_NEW_PROVIDER = 15;
const POINTS_CONTRACT     = 25;

const CATEGORY_COLORS = [
    'energie' => '#f59e0b', 'gaz' => '#ef4444', 'apa' => '#0ea5e9', 'comunicatii' => '#8b5cf6',
    'salubrizare' => '#84cc16', 'intretinere' => '#10b981', 'diverse' => '#64748b',
];

function catalog(): array
{
    static $c = null;
    if ($c) return $c;

    $dir = __DIR__ . '/../data/catalog';
    $raw = json_decode(file_get_contents("$dir/providers.json"), true);
    $c = [
        'categories' => array_column($raw['categories'], null, 'key'),
        'providers'  => array_column($raw['providers'], null, 'slug'),
        'counties'   => array_column(json_decode(file_get_contents("$dir/counties.json"), true), null, 'code'),
    ];
    return $c;
}

function catalog_provider(string $slug): array
{
    return catalog()['providers'][$slug] ?? throw new HttpError(404, "Furnizor necunoscut: $slug");
}

function covers(array $provider, string $county): bool
{
    return $provider['coverage'] === 'national' || in_array($county, $provider['coverage'], true);
}

/** Validează slug/categorie/județ comune pentru cont și contract. */
function validate_selection(array $data): array
{
    $provider = catalog_provider((string) ($data['slug'] ?? ''));
    $category = (string) ($data['category'] ?? $provider['categories'][0]);
    $county   = (string) ($data['county'] ?? '');

    if (!in_array($category, $provider['categories'], true)) throw new HttpError(422, "{$provider['name']} nu oferă categoria $category");
    if (!isset(catalog()['counties'][$county]))               throw new HttpError(422, 'Alege un județ valid');
    if (!covers($provider, $county))                          throw new HttpError(422, "{$provider['name']} nu activează în județul ales");

    return [$provider, $category, $county];
}

/** Conturile userului cu slug din catalog. */
function connected_accounts(): array
{
    $st = db()->prepare(
        'SELECT up.id, up.alias, up.client_code, up.county, up.created_at, p.slug, p.name, p.category
           FROM user_providers up JOIN providers p ON p.id = up.provider_id
          WHERE up.user_id = ? ORDER BY up.id DESC'
    );
    $st->execute([USER_ID]);
    return $st->fetchAll();
}

// ---------------------------------------------------------------- handlers

function h_catalog(): array
{
    $c = catalog();
    $user = db()->query('SELECT name, county FROM users WHERE id = ' . USER_ID)->fetch();

    $counties = [];
    foreach ($c['counties'] as $code => $county) {
        $local = array_filter($c['providers'], fn($p) => $p['coverage'] !== 'national' && in_array($code, $p['coverage'], true));
        $byCat = [];
        foreach ($local as $p) foreach ($p['categories'] as $cat) $byCat[$cat] = ($byCat[$cat] ?? 0) + 1;
        $counties[] = $county + ['local_providers' => count($local), 'local_by_category' => $byCat];
    }

    return [
        'user_name'   => $user['name'] ?? null,
        'home_county' => $user['county'] ?? null,
        'categories'  => array_values($c['categories']),
        'counties'    => $counties,
        'providers'   => array_values($c['providers']),
        'accounts'    => connected_accounts(),
        'contracts'   => h_contracts(),
    ];
}

function h_localities(string $county): array
{
    $all = json_decode(file_get_contents(__DIR__ . '/../data/catalog/localities.json'), true);
    return $all[$county] ?? throw new HttpError(404, 'Județ necunoscut');
}

/** Body: { slug, category, county, client_code, alias? } — conectează un cont existent ca să plătești facturile. */
function h_add_account(): array
{
    $data = body();
    [$provider, $category, $county] = validate_selection($data);

    $clientCode = trim((string) ($data['client_code'] ?? ''));
    if (strlen($clientCode) < 4) throw new HttpError(422, 'Codul de client trebuie să aibă cel puțin 4 caractere');

    $pdo = db();
    $dup = $pdo->prepare(
        'SELECT 1 FROM user_providers up JOIN providers p ON p.id = up.provider_id
          WHERE up.user_id = ? AND p.slug = ? AND p.category = ? AND up.client_code = ?'
    );
    $dup->execute([USER_ID, $provider['slug'], $category, $clientCode]);
    if ($dup->fetchColumn()) throw new HttpError(409, 'Ai adăugat deja acest cont');

    $pdo->beginTransaction();
    $find = $pdo->prepare('SELECT id FROM providers WHERE slug = ? AND category = ?');
    $find->execute([$provider['slug'], $category]);
    $providerId = $find->fetchColumn();
    if (!$providerId) {
        $pdo->prepare('INSERT INTO providers (slug, name, category, color) VALUES (?, ?, ?, ?)')
            ->execute([$provider['slug'], $provider['name'], $category, CATEGORY_COLORS[$category] ?? '#64748b']);
        $providerId = $pdo->lastInsertId();
    }

    $alias = trim((string) ($data['alias'] ?? '')) ?: catalog()['categories'][$category]['label'] . ' · ' . catalog()['counties'][$county]['name'];
    $pdo->prepare('INSERT INTO user_providers (user_id, provider_id, client_code, alias, county, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([USER_ID, $providerId, $clientCode, $alias, $county, today()]);
    $accountId = (int) $pdo->lastInsertId();

    add_points($pdo, USER_ID, POINTS_NEW_PROVIDER, "Furnizor nou adăugat · {$provider['name']}");
    $pdo->commit();

    return [
        'account'        => array_values(array_filter(connected_accounts(), fn($a) => (int) $a['id'] === $accountId))[0],
        'points_awarded' => POINTS_NEW_PROVIDER,
        'new_badges'     => check_badges($pdo, USER_ID),
        'rewards'        => rewards_summary($pdo, USER_ID),
    ];
}

function h_contracts(): array
{
    $st = db()->prepare('SELECT * FROM contract_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC');
    $st->execute([USER_ID]);
    return $st->fetchAll();
}

/** Body: { slug, category, county, locality, address, full_name, phone, notes? } — cerere de contract nou. */
function h_create_contract(): array
{
    $data = body();
    [$provider, $category, $county] = validate_selection($data);

    if (!(catalog()['categories'][$category]['contract'] ?? false)) {
        throw new HttpError(422, 'Pentru această categorie nu se pot încheia contracte din aplicație');
    }
    foreach (['locality' => 'Localitatea', 'address' => 'Adresa', 'full_name' => 'Numele', 'phone' => 'Telefonul'] as $field => $label) {
        if (trim((string) ($data[$field] ?? '')) === '') throw new HttpError(422, "$label este obligatoriu");
    }
    if (!in_array($data['locality'], h_localities($county), true)) throw new HttpError(422, 'Localitatea nu e în județul ales');
    if (!preg_match('/^(\+4)?0\d{9}$/', preg_replace('/\s+/', '', (string) $data['phone']))) throw new HttpError(422, 'Număr de telefon invalid');

    $pdo = db();
    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO contract_requests (user_id, provider_slug, provider_name, category, county, locality, address, full_name, phone, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        USER_ID, $provider['slug'], $provider['name'], $category, $county, $data['locality'],
        trim($data['address']), trim($data['full_name']), trim($data['phone']), trim((string) ($data['notes'] ?? '')) ?: null, today(),
    ]);
    $id = (int) $pdo->lastInsertId();
    add_points($pdo, USER_ID, POINTS_CONTRACT, "Cerere de contract · {$provider['name']}");
    $pdo->commit();

    return [
        'contract'       => array_values(array_filter(h_contracts(), fn($c) => (int) $c['id'] === $id))[0],
        'points_awarded' => POINTS_CONTRACT,
        'new_badges'     => check_badges($pdo, USER_ID),
    ];
}
