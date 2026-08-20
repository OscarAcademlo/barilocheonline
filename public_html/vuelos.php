<?php
error_reporting(0);
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

date_default_timezone_set('America/Argentina/Buenos_Aires');
$type = isset($_GET['type']) ? $_GET['type'] : 'A';
$date = date('d-m-Y');
$airport = 'BRC';

// Aumentamos el contador a 100 para tener todo el día y poder filtrar por horario
$url = "https://webaa-api-h4d5amdfcze7hthn.a02.azurefd.net/web-prod/v1/api-aa/all-flights?c=100&idarpt=$airport&movtp=$type&f=$date";

function get_flights($url)
{
    if (!function_exists('curl_init'))
        return ['code' => 500, 'body' => 'cURL no disponible'];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $headers = [
        "key: HieGcY2nFreIsNLuo5EbXCwE7g0aRzTN",
        "Accept: application/json, text/plain, */*",
        "Origin: https://www.aeropuertosargentina.com",
        "Referer: https://www.aeropuertosargentina.com/es/BRC",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ];

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    // En PHP 8.5+, curl_close es opcional pero lo dejamos para compatibilidad
    @curl_close($ch);

    return ['code' => $httpCode, 'body' => $response];
}

$result = get_flights($url);

if ($result['code'] === 200) {
    echo $result['body'];
} else {
    http_response_code($result['code'] ?: 500);
    echo json_encode([
        'error' => 'API Error',
        'code' => $result['code'],
        'message' => 'No se pudo obtener información de vuelos'
    ]);
}
?>