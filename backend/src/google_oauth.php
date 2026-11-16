<?php
declare(strict_types=1);

/** POST application/x-www-form-urlencoded, returnează JSON decodat sau aruncă excepție. */
function http_post_form(string $url, array $fields): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $data = json_decode($body, true);
    if ($body === '' || $code >= 400 || !is_array($data)) {
        throw new RuntimeException('Google OAuth: ' . ($data['error_description'] ?? $error ?: "HTTP $code"));
    }
    return $data;
}

/** Schimbă codul de autorizare pe access_token + refresh_token. */
function google_exchange_code(array $google, string $code): array
{
    return http_post_form('https://oauth2.googleapis.com/token', [
        'code' => $code,
        'client_id' => $google['client_id'] ?? '',
        'client_secret' => $google['client_secret'] ?? '',
        'redirect_uri' => $google['redirect_uri'] ?? '',
        'grant_type' => 'authorization_code',
    ]);
}

/** Aduce adresa de email a utilizatorului (folosită doar pentru identificare). */
function google_userinfo(string $accessToken): array
{
    $ch = curl_init('https://openidconnect.googleapis.com/v1/userinfo');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
    ]);
    $data = json_decode((string) curl_exec($ch), true);
    curl_close($ch);
    if (!is_array($data) || empty($data['email'])) {
        throw new RuntimeException('Nu am putut citi emailul din contul Google.');
    }
    return $data;
}
