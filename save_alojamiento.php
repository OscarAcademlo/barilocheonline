<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

const MP_ACCESS_TOKEN = 'APP_USR-1090772527948503-082014-ed13352ca2c8535653f673fbdc13a986-741894322';
const ADMIN_EMAIL = 'oscarns@gmail.com';
const PRICE_ARS = 10000;

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// 1. OBTENER ALOJAMIENTOS ACTIVOS
if ($action === 'get_alojamientos' || ($_SERVER['REQUEST_METHOD'] === 'GET' && empty($action))) {
    $file = __DIR__ . '/alojamientos.json';
    if (!file_exists($file)) {
        file_put_contents($file, '[]');
    }
    echo file_get_contents($file);
    exit;
}

// 2. VERIFICAR ESTADO DE SUSCRIPCIÓN
if ($action === 'check_subscription') {
    $email = strtolower(trim($_GET['email'] ?? $_POST['email'] ?? ''));
    if (empty($email)) {
        echo json_encode(['active' => false, 'message' => 'Email requerido']);
        exit;
    }

    if ($email === ADMIN_EMAIL) {
        echo json_encode(['active' => true, 'is_admin' => true, 'expires_at' => '2099-12-31', 'plan' => 'admin']);
        exit;
    }

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    $now = time();

    foreach ($subs as $sub) {
        if (strtolower($sub['email']) === $email && !empty($sub['active'])) {
            $exp = strtotime($sub['expires_at']);
            if ($exp > $now) {
                echo json_encode([
                    'active' => true,
                    'is_admin' => false,
                    'expires_at' => $sub['expires_at'],
                    'plan' => $sub['plan'] ?? 'standard'
                ]);
                exit;
            }
        }
    }

    echo json_encode(['active' => false, 'is_admin' => false]);
    exit;
}

// 3. CANJEAR CÓDIGO PROMOCIONAL (3, 6, 12 MESES)
if ($action === 'redeem_code') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $email = strtolower(trim($data['email'] ?? ''));
    $code = strtoupper(trim($data['code'] ?? ''));

    if (empty($email) || empty($code)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email y código son obligatorios']);
        exit;
    }

    $codesFile = __DIR__ . '/codigos_promo.json';
    $codes = file_exists($codesFile) ? json_decode(file_get_contents($codesFile), true) : [];
    
    $found = false;
    $months = 3;
    foreach ($codes as &$c) {
        if (strtoupper($c['code']) === $code && $c['active']) {
            if (isset($c['max_uses']) && $c['used_count'] >= $c['max_uses']) {
                continue;
            }
            $found = true;
            $months = intval($c['months'] ?? 3);
            $c['used_count'] = ($c['used_count'] ?? 0) + 1;
            break;
        }
    }

    if (!$found) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Código promocional inválido o agotado']);
        exit;
    }

    file_put_contents($codesFile, json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // Guardar suscripción
    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];

    $expiresAt = date('Y-m-d\TH:i:s\Z', strtotime("+$months months"));

    // Actualizar o insertar
    $updated = false;
    foreach ($subs as &$s) {
        if (strtolower($s['email']) === $email) {
            $s['active'] = true;
            $s['expires_at'] = $expiresAt;
            $s['plan'] = "promo_{$months}m";
            $s['code_used'] = $code;
            $updated = true;
            break;
        }
    }

    if (!$updated) {
        $subs[] = [
            'email' => $email,
            'plan' => "promo_{$months}m",
            'months' => $months,
            'active' => true,
            'created_at' => date('c'),
            'expires_at' => $expiresAt,
            'method' => 'promo_code',
            'code_used' => $code
        ];
    }

    file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    echo json_encode([
        'status' => 'success',
        'message' => "¡Código activado con éxito! Tienes $months meses de publicación gratuita.",
        'expires_at' => $expiresAt
    ]);
    exit;
}

// 4. CREAR PREFERENCIA MERCADO PAGO
if ($action === 'create_mp_preference') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email requerido para procesar el pago']);
        exit;
    }

    $preferenceData = [
        'items' => [
            [
                'title' => 'Suscripción Publicación Alojamiento (1 Mes) - Bariloche.Online',
                'description' => 'Aparición destacada con mapa y WhatsApp en Bariloche.Online',
                'quantity' => 1,
                'currency_id' => 'ARS',
                'unit_price' => PRICE_ARS
            ]
        ],
        'payer' => [
            'email' => $email
        ],
        'back_urls' => [
            'success' => "https://bariloche.online/alojamiento.html?payment=success&email=" . urlencode($email),
            'failure' => "https://bariloche.online/alojamiento.html?payment=failure",
            'pending' => "https://bariloche.online/alojamiento.html?payment=pending&email=" . urlencode($email)
        ],
        'auto_return' => 'approved',
        'external_reference' => "sub_{$email}_" . time()
    ];

    $ch = curl_init('https://api.mercadopago.com/checkout/preferences');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($preferenceData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . MP_ACCESS_TOKEN,
        'Content-Type: application/json'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $resData = json_decode($response, true);
        echo json_encode([
            'status' => 'success',
            'init_point' => $resData['init_point'] ?? '',
            'preference_id' => $resData['id'] ?? ''
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'Error al conectar con Mercado Pago',
            'details' => $response
        ]);
    }
    exit;
}

// 5. CONFIRMAR PAGO EXITOSO
if ($action === 'confirm_payment') {
    $email = strtolower(trim($_GET['email'] ?? $_POST['email'] ?? ''));
    if (empty($email)) {
        echo json_encode(['status' => 'error', 'message' => 'Email requerido']);
        exit;
    }

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    $expiresAt = date('Y-m-d\TH:i:s\Z', strtotime("+1 month"));

    $updated = false;
    foreach ($subs as &$s) {
        if (strtolower($s['email']) === $email) {
            $s['active'] = true;
            $s['expires_at'] = $expiresAt;
            $s['plan'] = 'mercadopago_1m';
            $s['updated_at'] = date('c');
            $updated = true;
            break;
        }
    }

    if (!$updated) {
        $subs[] = [
            'email' => $email,
            'plan' => 'mercadopago_1m',
            'months' => 1,
            'active' => true,
            'created_at' => date('c'),
            'expires_at' => $expiresAt,
            'method' => 'mercadopago'
        ];
    }

    file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => 'Suscripción activada', 'expires_at' => $expiresAt]);
    exit;
}

// 6. GUARDAR / EDITAR ALOJAMIENTO (CON SUBIDA DE FOTOS A img/alojamientos/)
if ($action === 'save_alojamiento') {
    $email = strtolower(trim($_POST['owner_email'] ?? ''));
    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email de propietario requerido']);
        exit;
    }

    // Verificar suscripción o admin
    $isAdmin = ($email === ADMIN_EMAIL);
    if (!$isAdmin) {
        $subsFile = __DIR__ . '/suscripciones.json';
        $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
        $hasActiveSub = false;
        $now = time();
        foreach ($subs as $sub) {
            if (strtolower($sub['email']) === $email && $sub['active'] && strtotime($sub['expires_at']) > $now) {
                $hasActiveSub = true;
                break;
            }
        }
        if (!$hasActiveSub) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Se requiere suscripción activa para publicar']);
            exit;
        }
    }

    // Directorio de imágenes
    $uploadDir = __DIR__ . '/img/alojamientos/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $uploadedImages = [];
    if (!empty($_FILES['images'])) {
        $files = $_FILES['images'];
        $count = is_array($files['name']) ? count($files['name']) : 1;

        for ($i = 0; $i < $count; $i++) {
            $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
            $tmpName = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
            $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];

            if ($error === UPLOAD_ERR_OK && !empty($tmpName)) {
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                    $newFilename = 'aloj_' . uniqid() . '_' . time() . '.' . $ext;
                    if (move_uploaded_file($tmpName, $uploadDir . $newFilename)) {
                        $uploadedImages[] = 'img/alojamientos/' . $newFilename;
                    }
                }
            }
        }
    }

    // Si ya tenía imágenes previas y no subió nuevas
    $existingImages = json_decode($_POST['existing_images'] ?? '[]', true) ?: [];
    $allImages = array_merge($existingImages, $uploadedImages);
    if (empty($allImages)) {
        $allImages = ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800'];
    }

    $accId = $_POST['id'] ?? ('acc_' . time());
    $amenities = json_decode($_POST['amenities'] ?? '[]', true) ?: ['Wi-Fi', 'Calefacción'];

    $newItem = [
        'id' => $accId,
        'owner_email' => $email,
        'name' => trim($_POST['name'] ?? 'Mi Alojamiento'),
        'type' => trim($_POST['type'] ?? 'Cabaña'),
        'location' => trim($_POST['location'] ?? 'Bariloche'),
        'price' => intval($_POST['price'] ?? 100000),
        'rating' => floatval($_POST['rating'] ?? 4.9),
        'lat' => floatval($_POST['lat'] ?? -41.1335),
        'lng' => floatval($_POST['lng'] ?? -71.3103),
        'images' => $allImages,
        'description' => trim($_POST['description'] ?? ''),
        'amenities' => $amenities,
        'phone' => preg_replace('/[^\d]/', '', $_POST['phone'] ?? '5492944123456'),
        'updated_at' => date('c')
    ];

    $file = __DIR__ . '/alojamientos.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];

    $foundIndex = -1;
    foreach ($list as $idx => $item) {
        if ($item['id'] === $accId) {
            // Solo dueño o admin puede editar
            if ($item['owner_email'] !== $email && !$isAdmin) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'No tienes permiso para editar este alojamiento']);
                exit;
            }
            $foundIndex = $idx;
            break;
        }
    }

    if ($foundIndex >= 0) {
        $list[$foundIndex] = array_merge($list[$foundIndex], $newItem);
    } else {
        $newItem['created_at'] = date('c');
        array_unshift($list, $newItem);
    }

    file_put_contents($file, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => 'Alojamiento guardado con éxito', 'data' => $newItem]);
    exit;
}

// 7. ELIMINAR ALOJAMIENTO
if ($action === 'delete_alojamiento') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $id = $data['id'] ?? '';
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($id) || empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'ID y email requeridos']);
        exit;
    }

    $isAdmin = ($email === ADMIN_EMAIL);
    $file = __DIR__ . '/alojamientos.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];

    $newList = [];
    $deleted = false;
    foreach ($list as $item) {
        if ($item['id'] === $id) {
            if ($item['owner_email'] === $email || $isAdmin) {
                $deleted = true;
                continue;
            } else {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
                exit;
            }
        }
        $newList[] = $item;
    }

    if ($deleted) {
        file_put_contents($file, json_encode($newList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'success', 'message' => 'Alojamiento eliminado']);
    } else {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'No encontrado']);
    }
    exit;
}

// 8. PANEL ADMIN: CREAR CÓDIGOS PROMO
if ($action === 'create_promo_code') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Solo oscarns@gmail.com puede crear códigos']);
        exit;
    }

    $code = strtoupper(trim($data['code'] ?? ''));
    $months = intval($data['months'] ?? 3);
    $maxUses = intval($data['max_uses'] ?? 50);

    if (empty($code)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'El código no puede estar vacío']);
        exit;
    }

    $codesFile = __DIR__ . '/codigos_promo.json';
    $codes = file_exists($codesFile) ? json_decode(file_get_contents($codesFile), true) : [];

    $codes[] = [
        'code' => $code,
        'months' => $months,
        'created_by' => $adminEmail,
        'max_uses' => $maxUses,
        'used_count' => 0,
        'active' => true,
        'created_at' => date('c')
    ];

    file_put_contents($codesFile, json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => "Código $code creado para $months meses", 'data' => $codes]);
    exit;
}

// 9. PANEL ADMIN: LISTAR CÓDIGOS
if ($action === 'get_promo_codes') {
    $adminEmail = strtolower(trim($_GET['admin_email'] ?? ''));
    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }
    $codesFile = __DIR__ . '/codigos_promo.json';
    echo file_exists($codesFile) ? file_get_contents($codesFile) : '[]';
    exit;
}

// 10. PANEL ADMIN: ELIMINAR CÓDIGO PROMO
if ($action === 'delete_promo_code') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));
    $code = strtoupper(trim($data['code'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $codesFile = __DIR__ . '/codigos_promo.json';
    $codes = file_exists($codesFile) ? json_decode(file_get_contents($codesFile), true) : [];

    $newCodes = array_values(array_filter($codes, function($c) use ($code) {
        return strtoupper($c['code']) !== $code;
    }));

    file_put_contents($codesFile, json_encode($newCodes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => 'Código eliminado con éxito', 'data' => $newCodes]);
    exit;
}

http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Acción no reconocida']);
?>
