<?php
// backend/api/users.php
require_once '../config/database.php';

header('Content-Type: application/json');

// Obtener payload parseado
$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$method = $_SERVER['REQUEST_METHOD'];

// Verificar que esté autenticado
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "No estás autorizado."]);
    exit;
}

$role = $_SESSION['role'];

if ($method === 'GET') {
    // Listar todos los usuarios anunciantes (Sólo ADMIN)
    if ($role !== 'admin') {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Acceso denegado. Solo administradores pueden ver los usuarios."]);
        exit;
    }

    $stmt = $pdo->query("SELECT id, name, email, role, category, status, created_at FROM users WHERE role = 'advertiser' ORDER BY id DESC");
    $users = $stmt->fetchAll();
    echo json_encode(["status" => "success", "data" => $users]);
    exit;
}

if ($method === 'POST') {
    $action = $data['action'] ?? '';

    // Agregar nuevo anunciante (Sólo ADMIN)
    if ($action === 'create' && $role === 'admin') {
        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $category = trim($data['category'] ?? '');

        if (empty($name) || empty($email) || empty($password) || empty($category)) {
            echo json_encode(["status" => "error", "message" => "Faltan campos requeridos."]);
            exit;
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password, role, category, status) VALUES (?, ?, ?, 'advertiser', ?, 'active')");
            $stmt->execute([$name, $email, $hash, $category]);
            echo json_encode(["status" => "success", "message" => "Usuario creado exitosamente."]);
            exit;
        } catch (\PDOException $e) {
            echo json_encode(["status" => "error", "message" => "Error al agregar usuario o el email ya existe."]);
            exit;
        }
    }

    // Cambiar mi contraseña (Cualquier usuario logueado, principalmente ANUNCIANTE)
    if ($action === 'change_password') {
        $new_password = $data['new_password'] ?? '';

        // El chequeo de confirmación se asume hecho en el front-end o lo validamos aquí
        if (strlen($new_password) < 6) {
            echo json_encode(["status" => "error", "message" => "La contraseña debe tener al menos 6 caracteres."]);
            exit;
        }

        $hash = password_hash($new_password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        
        if ($stmt->execute([$hash, $_SESSION['user_id']])) {
            echo json_encode(["status" => "success", "message" => "Contraseña actualizada exitosamente."]);
        } else {
            echo json_encode(["status" => "error", "message" => "Error al actualizar la contraseña."]);
        }
        exit;
    }
}

// Eliminar un anunciante (Sólo ADMIN)
if ($method === 'DELETE') {
    if ($role !== 'admin') {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Acceso denegado."]);
        exit;
    }

    // Payload de un DELETE puede venir en json raw
    $dataDelete = json_decode(file_get_contents('php://input'), true);
    $user_id = $dataDelete['id'] ?? $_GET['id'] ?? null;

    if (!$user_id) {
        echo json_encode(["status" => "error", "message" => "Falta el ID del usuario a eliminar."]);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role != 'admin'");
    if ($stmt->execute([$user_id])) {
        echo json_encode(["status" => "success", "message" => "Usuario eliminado."]);
    } else {
        echo json_encode(["status" => "error", "message" => "Error al eliminar usuario."]);
    }
    exit;
}

echo json_encode(["status" => "error", "message" => "Método o acción no válida."]);
?>
