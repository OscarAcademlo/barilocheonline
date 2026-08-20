<?php
// backend/api/auth.php
require_once '../config/database.php';

header('Content-Type: application/json');

// Obtener la acción del payload si es JSON, o de $_POST
$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$action = $data['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        $email = $data['email'] ?? '';
        $password = $data['password'] ?? '';

        if (empty($email) || empty($password)) {
            echo json_encode(["status" => "error", "message" => "Faltan credenciales."]);
            exit;
        }

        $stmt = $pdo->prepare("SELECT id, name, role, password FROM users WHERE email = ? AND status = 'active'");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['role'] = $user['role'];
            $_SESSION['name'] = $user['name'];

            echo json_encode([
                "status" => "success", 
                "message" => "Bienvenido", 
                "user" => [
                    "id" => $user['id'],
                    "name" => $user['name'],
                    "role" => $user['role']
                ]
            ]);
        } else {
            echo json_encode(["status" => "error", "message" => "Credenciales incorrectas o usuario inactivo."]);
        }
        break;

    case 'logout':
        session_unset();
        session_destroy();
        echo json_encode(["status" => "success", "message" => "Sesión cerrada con éxito."]);
        break;

    case 'check': // Verificar sesión activa
        if (isset($_SESSION['user_id'])) {
            echo json_encode([
                "status" => "success", 
                "authenticated" => true,
                "user" => [
                    "id" => $_SESSION['user_id'],
                    "name" => $_SESSION['name'],
                    "role" => $_SESSION['role']
                ]
            ]);
        } else {
            echo json_encode(["status" => "success", "authenticated" => false]);
        }
        break;

    default:
        echo json_encode(["status" => "error", "message" => "Acción no válida."]);
        break;
}
?>
