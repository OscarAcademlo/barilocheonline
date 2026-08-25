<?php
// backend/config/database.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE, PUT");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Si es una petición OPTIONS, la respondemos enseguida (para CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../env_loader.php';

// Configuración de la Base de Datos desde Variables de Entorno con Fallback
$host = getEnvVar('DB_HOST', 'localhost');
$db   = getEnvVar('DB_NAME', 'u237313556_barionline');
$user = getEnvVar('DB_USER', 'u237313556_barionline');
$pass = getEnvVar('DB_PASS', 'TU_CONTRASENA_AQUI');
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
     http_response_code(500);
     echo json_encode(["status" => "error", "message" => "Error de conexión a la base de datos."]);
     exit;
}

// Iniciar sesión para mantener estado si es necesario
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
?>
