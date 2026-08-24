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

    if (is_array($subs)) {
        foreach ($subs as $sub) {
            $subEmail = strtolower(trim($sub['email'] ?? ''));
            if ($subEmail === $email && !empty($sub['active'])) {
                $expStr = $sub['expires_at'] ?? '';
                $exp = strtotime($expStr);
                if ($exp >= $now) {
                    echo json_encode([
                        'active' => true,
                        'is_admin' => false,
                        'expires_at' => $expStr,
                        'plan' => $sub['plan'] ?? 'standard'
                    ]);
                    exit;
                }
            }
        }
    }

    echo json_encode(['active' => false, 'is_admin' => false]);
    exit;
}

// 3. CANJEAR CÓDIGO PROMOCIONAL (1, 2, 3, 6, 12 MESES)
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
    $months = 1;
    if (is_array($codes)) {
        foreach ($codes as &$c) {
            if (strtoupper(trim($c['code'] ?? '')) === $code && !empty($c['active'])) {
                if (isset($c['max_uses']) && ($c['used_count'] ?? 0) >= $c['max_uses']) {
                    continue;
                }
                $found = true;
                $months = max(1, intval($c['months'] ?? 1));
                $promoService = trim($c['service'] ?? 'all');
                $c['used_count'] = ($c['used_count'] ?? 0) + 1;
                break;
            }
        }
        unset($c);
    }

    if (!$found) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Código promocional inválido o agotado']);
        exit;
    }

    @file_put_contents($codesFile, json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($codesFile, 0666);

    // Guardar suscripción (30 días por mes de gratuidad)
    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    if (!is_array($subs)) $subs = [];

    $expiresAt = date('Y-m-d\TH:i:s\Z', strtotime("+$months months"));

    // Actualizar o insertar
    $updated = false;
    foreach ($subs as &$s) {
        if (strtolower(trim($s['email'] ?? '')) === $email) {
            $s['active'] = true;
            $s['expires_at'] = $expiresAt;
            $s['plan'] = "promo_{$months}m";
            $s['months'] = $months;
            $s['service'] = $promoService;
            $s['code_used'] = $code;
            $s['updated_at'] = date('c');
            $updated = true;
            break;
        }
    }
    unset($s);

    if (!$updated) {
        $subs[] = [
            'email' => $email,
            'plan' => "promo_{$months}m",
            'months' => $months,
            'service' => $promoService,
            'active' => true,
            'code_used' => $code,
            'created_at' => date('c'),
            'expires_at' => $expiresAt,
            'method' => 'promo_code'
        ];
    }

    @file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($subsFile, 0666);

    echo json_encode([
        'status' => 'success',
        'message' => "¡Código activado con éxito! Tienes $months mes" . ($months > 1 ? 'es' : '') . " de publicación gratuita.",
        'expires_at' => $expiresAt
    ]);
    exit;
}

// 4. CREAR PREFERENCIA MERCADO PAGO
if ($action === 'create_mp_preference') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $email = strtolower(trim($data['email'] ?? ''));
    $plan  = strtolower(trim($data['plan'] ?? 'alojamiento')); // excursion-1v, excursion-3v, excursion-5v, alojamiento, gastronomia

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email requerido para procesar el pago']);
        exit;
    }

    // Leer precio desde precios_servicios.json (dinámico)
    $pricesFile = __DIR__ . '/precios_servicios.json';
    $prices = file_exists($pricesFile) ? json_decode(file_get_contents($pricesFile), true) : [];

    $planPriceMap = [
        'excursion-1v'  => intval($prices['excursiones_1v'] ?? 50000),
        'excursion-3v'  => intval($prices['excursiones_3v'] ?? 70000),
        'excursion-5v'  => intval($prices['excursiones_5v'] ?? 120000),
        'alojamiento'   => intval($prices['alojamiento'] ?? 10000),
        'gastronomia'   => intval($prices['gastronomia'] ?? 10000),
    ];
    $planPrice = $planPriceMap[$plan] ?? intval($prices['alojamiento'] ?? 10000);

    $planLabels = [
        'excursion-1v'  => 'Excursiones - 1 Vehículo GPS (1 mes)',
        'excursion-3v'  => 'Excursiones - Hasta 3 Vehículos GPS (1 mes)',
        'excursion-5v'  => 'Excursiones - Flota 5 Vehículos GPS (1 mes)',
        'alojamiento'   => 'Publicación Alojamiento (1 mes)',
        'gastronomia'   => 'Publicación Gastronomía (1 mes)',
    ];
    $planLabel = $planLabels[$plan] ?? 'Suscripción Bariloche.Online (1 mes)';

    $preferenceData = [
        'items' => [
            [
                'title'       => $planLabel . ' - Bariloche.Online',
                'description' => 'Aparición destacada en Bariloche.Online',
                'quantity'    => 1,
                'currency_id' => 'ARS',
                'unit_price'  => $planPrice
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
        'notification_url' => "https://bariloche.online/save_alojamiento.php?action=webhook",
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
        if (strtolower($s['email'] ?? '') === $email) {
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

// 5.1 WEBHOOK / IPN MERCADO PAGO (PROCESAMIENTO AUTOMÁTICO)
if ($action === 'webhook' || $action === 'mp_webhook' || isset($_GET['data_id']) || (isset($_GET['topic']) && $_GET['topic'] === 'payment')) {
    $paymentId = $_GET['data_id'] ?? $_GET['id'] ?? null;
    if (!$paymentId) {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true);
        $paymentId = $body['data']['id'] ?? $body['id'] ?? null;
    }

    if ($paymentId) {
        $ch = curl_init("https://api.mercadopago.com/v1/payments/" . $paymentId);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . MP_ACCESS_TOKEN
        ]);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            $paymentInfo = json_decode($res, true);
            if (($paymentInfo['status'] ?? '') === 'approved') {
                $payerEmail = strtolower(trim($paymentInfo['payer']['email'] ?? ''));
                $extRef = $paymentInfo['external_reference'] ?? '';
                if (preg_match('/sub_([^_]+)_/', $extRef, $matches)) {
                    $payerEmail = strtolower(trim($matches[1]));
                }

                if (!empty($payerEmail)) {
                    $subsFile = __DIR__ . '/suscripciones.json';
                    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
                    if (!is_array($subs)) $subs = [];
                    $expiresAt = date('Y-m-d\TH:i:s\Z', strtotime("+1 month"));
                    $updated = false;
                    foreach ($subs as &$s) {
                        if (strtolower($s['email'] ?? '') === $payerEmail) {
                            $s['active'] = true;
                            $s['expires_at'] = $expiresAt;
                            $s['plan'] = 'mercadopago_1m';
                            $s['updated_at'] = date('c');
                            $s['payment_id'] = $paymentId;
                            $updated = true;
                            break;
                        }
                    }
                    if (!$updated) {
                        $subs[] = [
                            'email' => $payerEmail,
                            'plan' => 'mercadopago_1m',
                            'months' => 1,
                            'active' => true,
                            'created_at' => date('c'),
                            'expires_at' => $expiresAt,
                            'method' => 'mercadopago_webhook',
                            'payment_id' => $paymentId
                        ];
                    }
                    file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                }
            }
        }
    }
    http_response_code(200);
    echo json_encode(['status' => 'success', 'message' => 'Webhook procesado con éxito']);
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
    $service = trim($data['service'] ?? 'all');

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
        'service' => $service,
        'created_by' => $adminEmail,
        'max_uses' => $maxUses,
        'used_count' => 0,
        'active' => true,
        'created_at' => date('c')
    ];

    file_put_contents($codesFile, json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => "Código $code creado para $months meses ($service)", 'data' => $codes]);
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

// 11. PANEL ADMIN: ASIGNAR MESES GRATIS DIRECTAMENTE A UN EMAIL
if ($action === 'admin_grant_subscription') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $targetEmail = strtolower(trim($data['target_email'] ?? ''));
    $months = max(1, intval($data['months'] ?? 1));

    if (empty($targetEmail)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email de usuario requerido']);
        exit;
    }

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    if (!is_array($subs)) $subs = [];

    $expiresAt = date('Y-m-d\TH:i:s\Z', strtotime("+$months months"));

    $updated = false;
    foreach ($subs as &$s) {
        if (strtolower(trim($s['email'] ?? '')) === $targetEmail) {
            $s['active'] = true;
            $s['expires_at'] = $expiresAt;
            $s['plan'] = "admin_grant_{$months}m";
            $s['months'] = $months;
            $s['updated_at'] = date('c');
            $updated = true;
            break;
        }
    }
    unset($s);

    if (!$updated) {
        $subs[] = [
            'email' => $targetEmail,
            'plan' => "admin_grant_{$months}m",
            'months' => $months,
            'active' => true,
            'created_at' => date('c'),
            'expires_at' => $expiresAt,
            'method' => 'admin_direct'
        ];
    }

    @file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($subsFile, 0666);

    echo json_encode(['status' => 'success', 'message' => "Se otorgaron $months meses gratis a $targetEmail hasta $expiresAt"]);
    exit;
}

// 13. OBTENER TARIFAS Y PRECIOS DE SUSCRIPCIÓN
if ($action === 'get_service_prices') {
    $pricesFile = __DIR__ . '/precios_servicios.json';
    if (!file_exists($pricesFile)) {
        $defaultPrices = [
            'excursiones_1v'    => 50000,
            'excursiones_3v'    => 70000,
            'excursiones_5v'    => 120000,
            'alojamiento'       => 10000,
            'gastronomia'       => 10000,
            'combo_2_descuento' => 10,
            'combo_3_descuento' => 20,
            'updated_at'        => date('c')
        ];
        file_put_contents($pricesFile, json_encode($defaultPrices, JSON_PRETTY_PRINT));
    }
    echo file_get_contents($pricesFile);
    exit;
}

// 14. PANEL ADMIN: GUARDAR TARIFAS Y PRECIOS
if ($action === 'save_service_prices') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $pricesFile = __DIR__ . '/precios_servicios.json';
    $prices = [
        'excursiones_1v'    => max(0, intval($data['excursiones_1v']    ?? 50000)),
        'excursiones_3v'    => max(0, intval($data['excursiones_3v']    ?? 70000)),
        'excursiones_5v'    => max(0, intval($data['excursiones_5v']    ?? 120000)),
        'alojamiento'       => max(0, intval($data['alojamiento']       ?? 10000)),
        'gastronomia'       => max(0, intval($data['gastronomia']       ?? 10000)),
        'combo_2_descuento' => max(0, min(100, intval($data['combo_2_descuento'] ?? 10))),
        'combo_3_descuento' => max(0, min(100, intval($data['combo_3_descuento'] ?? 20))),
        'updated_at'        => date('c'),
        'updated_by'        => $adminEmail
    ];

    file_put_contents($pricesFile, json_encode($prices, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($pricesFile, 0666);
    echo json_encode(['status' => 'success', 'message' => 'Tarifas actualizadas con éxito', 'data' => $prices]);
    exit;
}

// 15. OBTENER GASTRONOMÍA DINÁMICA
if ($action === 'get_gastronomia') {
    $file = __DIR__ . '/gastronomia.json';
    if (!file_exists($file)) {
        file_put_contents($file, '[]');
    }
    echo file_get_contents($file);
    exit;
}

// 16. GUARDAR / EDITAR PROVEEDOR MULTISERVICIO Y FLOTA DE COMBO/MÓVILES
if ($action === 'save_multiservice_provider') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email requerido']);
        exit;
    }

    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    if (!is_array($providers)) $providers = [];

    $businessName = trim($data['business_name'] ?? '');
    $phone = trim($data['phone'] ?? '');
    $selectedServices = is_array($data['services'] ?? null) ? $data['services'] : [];
    $moviles = is_array($data['moviles'] ?? null) ? $data['moviles'] : [];

    // Limpiar y formatear móviles (Marca, Color, 3 últimos dígitos de patente)
    $cleanMoviles = [];
    foreach ($moviles as $m) {
        $cleanMoviles[] = [
            'id' => $m['id'] ?? ('movil_' . uniqid()),
            'codigo' => trim($m['codigo'] ?? 'Combi'),
            'marca' => trim($m['marca'] ?? ''),
            'color' => trim($m['color'] ?? 'Blanco'),
            'patente_ultimos3' => strtoupper(trim(substr($m['patente_ultimos3'] ?? '', -3))),
            'is_active' => isset($m['is_active']) ? (bool)$m['is_active'] : true
        ];
    }

    $updated = false;
    foreach ($providers as &$p) {
        if (strtolower(trim($p['email'] ?? '')) === $email) {
            $p['business_name'] = $businessName ?: ($p['business_name'] ?? '');
            $p['phone'] = $phone ?: ($p['phone'] ?? '');
            $p['services'] = $selectedServices;
            $p['moviles'] = $cleanMoviles;
            $p['cantidad_moviles'] = count($cleanMoviles);
            $p['updated_at'] = date('c');
            $updated = true;
            break;
        }
    }
    unset($p);

    if (!$updated) {
        $providers[] = [
            'id' => 'prov_' . uniqid(),
            'email' => $email,
            'business_name' => $businessName,
            'phone' => $phone,
            'services' => $selectedServices,
            'moviles' => $cleanMoviles,
            'cantidad_moviles' => count($cleanMoviles),
            'is_active' => true,
            'created_at' => date('c'),
            'updated_at' => date('c')
        ];
    }

    file_put_contents($provFile, json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($provFile, 0666);

    echo json_encode(['status' => 'success', 'message' => 'Perfil de servicios y flota guardados con éxito', 'data' => $data]);
    exit;
}

// 17. OBTENER PERFIL DE PROVEEDOR DEL USUARIO
if ($action === 'get_my_provider_profile') {
    $email = strtolower(trim($_GET['email'] ?? $_POST['email'] ?? ''));
    if (empty($email)) {
        echo json_encode(['status' => 'error', 'message' => 'Email requerido']);
        exit;
    }

    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    
    $myProfile = null;
    if (is_array($providers)) {
        foreach ($providers as $p) {
            if (strtolower(trim($p['email'] ?? '')) === $email) {
                $myProfile = $p;
                break;
            }
        }
    }

    $isAdmin = ($email === ADMIN_EMAIL);

    // Alojamientos del usuario (o TODOS si es Admin)
    $accFile = __DIR__ . '/alojamientos.json';
    $accs = file_exists($accFile) ? json_decode(file_get_contents($accFile), true) : [];
    if (!is_array($accs)) $accs = [];
    $myAccs = $isAdmin ? $accs : array_values(array_filter($accs, fn($a) => strtolower(trim($a['owner_email'] ?? '')) === $email));

    // Gastronomía del usuario (o TODA si es Admin)
    $gastoFile = __DIR__ . '/gastronomia.json';
    $gastos = file_exists($gastoFile) ? json_decode(file_get_contents($gastoFile), true) : [];
    if (!is_array($gastos)) $gastos = [];
    $myGastos = $isAdmin ? $gastos : array_values(array_filter($gastos, fn($g) => strtolower(trim($g['owner_email'] ?? '')) === $email));

    echo json_encode([
        'status' => 'success',
        'is_admin' => $isAdmin,
        'provider' => $myProfile,
        'accommodations' => $myAccs,
        'gastronomy' => $myGastos
    ]);
    exit;
}

// 18. PANEL ADMIN: OBTENER TODOS LOS PROVEEDORES, SERVICIOS Y FLOTA
if ($action === 'admin_get_all_providers') {
    $adminEmail = strtolower(trim($_GET['admin_email'] ?? ''));
    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];

    $accFile = __DIR__ . '/alojamientos.json';
    $accs = file_exists($accFile) ? json_decode(file_get_contents($accFile), true) : [];

    $gastoFile = __DIR__ . '/gastronomia.json';
    $gastos = file_exists($gastoFile) ? json_decode(file_get_contents($gastoFile), true) : [];

    echo json_encode([
        'status' => 'success',
        'providers' => is_array($providers) ? $providers : [],
        'subscriptions' => is_array($subs) ? $subs : [],
        'accommodations' => is_array($accs) ? $accs : [],
        'gastronomy' => is_array($gastos) ? $gastos : []
    ]);
    exit;
}

// 19. PANEL ADMIN: PAUSAR / ACTIVAR PROVEEDOR O MÓVIL
if ($action === 'admin_toggle_pause') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $targetEmail = strtolower(trim($data['target_email'] ?? ''));
    $movilId = trim($data['movil_id'] ?? '');
    $type = trim($data['type'] ?? 'provider'); // provider, movil, accommodation, gastronomy

    if ($type === 'movil' && $targetEmail && $movilId) {
        $provFile = __DIR__ . '/proveedores_servicios.json';
        $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
        foreach ($providers as &$p) {
            if (strtolower(trim($p['email'] ?? '')) === $targetEmail && !empty($p['moviles'])) {
                foreach ($p['moviles'] as &$m) {
                    if (($m['id'] ?? '') === $movilId) {
                        $m['is_active'] = !($m['is_active'] ?? true);
                        break;
                    }
                }
            }
        }
        file_put_contents($provFile, json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'success', 'message' => 'Estado del móvil actualizado']);
        exit;
    }

    if ($type === 'provider' && $targetEmail) {
        $provFile = __DIR__ . '/proveedores_servicios.json';
        $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
        foreach ($providers as &$p) {
            if (strtolower(trim($p['email'] ?? '')) === $targetEmail) {
                $p['is_active'] = !($p['is_active'] ?? true);
                break;
            }
        }
        file_put_contents($provFile, json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'success', 'message' => 'Estado de la empresa actualizado']);
        exit;
    }

    if ($type === 'accommodation') {
        $itemId = trim($data['id'] ?? $movilId);
        $accFile = __DIR__ . '/alojamientos.json';
        $accs = file_exists($accFile) ? json_decode(file_get_contents($accFile), true) : [];
        if (is_array($accs)) {
            foreach ($accs as &$item) {
                if (($item['id'] ?? '') === $itemId) {
                    $item['is_active'] = isset($item['is_active']) ? !($item['is_active']) : false;
                    break;
                }
            }
            file_put_contents($accFile, json_encode($accs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            echo json_encode(['status' => 'success', 'message' => 'Estado del alojamiento actualizado']);
            exit;
        }
    }

    if ($type === 'gastronomy') {
        $itemId = trim($data['id'] ?? $movilId);
        $gastoFile = __DIR__ . '/gastronomia.json';
        $gastos = file_exists($gastoFile) ? json_decode(file_get_contents($gastoFile), true) : [];
        if (is_array($gastos)) {
            foreach ($gastos as &$item) {
                if (($item['id'] ?? '') === $itemId) {
                    $item['is_active'] = isset($item['is_active']) ? !($item['is_active']) : false;
                    break;
                }
            }
            file_put_contents($gastoFile, json_encode($gastos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            echo json_encode(['status' => 'success', 'message' => 'Estado del local gastronómico actualizado']);
            exit;
        }
    }

    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Parámetros inválidos']);
    exit;
}

// 19.1 PANEL ADMIN: EDITAR CLIENTE / SUSCRIPCIÓN
if ($action === 'admin_update_provider') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $targetEmail = strtolower(trim($data['target_email'] ?? ''));
    if (empty($targetEmail)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email de cliente requerido']);
        exit;
    }

    $businessName = trim($data['business_name'] ?? '');
    $phone = trim($data['phone'] ?? '');
    $services = is_array($data['services'] ?? null) ? $data['services'] : ['excursiones'];
    $expiresAt = trim($data['expires_at'] ?? '');
    $isActive = isset($data['is_active']) ? (bool)$data['is_active'] : true;

    // Actualizar en proveedores_servicios.json
    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    if (!is_array($providers)) $providers = [];
    
    $found = false;
    foreach ($providers as &$p) {
        if (strtolower(trim($p['email'] ?? '')) === $targetEmail) {
            if (!empty($businessName)) $p['business_name'] = $businessName;
            $p['phone'] = $phone;
            $p['services'] = $services;
            $p['is_active'] = $isActive;
            $p['updated_at'] = date('c');
            $found = true;
            break;
        }
    }
    if (!$found) {
        $providers[] = [
            'email' => $targetEmail,
            'business_name' => $businessName ?: 'Cliente ' . $targetEmail,
            'phone' => $phone,
            'services' => $services,
            'is_active' => $isActive,
            'created_at' => date('c')
        ];
    }
    file_put_contents($provFile, json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // Actualizar suscripción si se especificó fecha
    if (!empty($expiresAt)) {
        $subsFile = __DIR__ . '/suscripciones.json';
        $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
        if (!is_array($subs)) $subs = [];
        
        $subFound = false;
        foreach ($subs as &$s) {
            if (strtolower(trim($s['email'] ?? '')) === $targetEmail) {
                $s['active'] = true;
                $s['expires_at'] = $expiresAt;
                $s['updated_at'] = date('c');
                $subFound = true;
                break;
            }
        }
        if (!$subFound) {
            $subs[] = [
                'email' => $targetEmail,
                'active' => true,
                'expires_at' => $expiresAt,
                'plan' => 'admin_custom',
                'created_at' => date('c')
            ];
        }
        file_put_contents($subsFile, json_encode($subs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    echo json_encode(['status' => 'success', 'message' => 'Cliente actualizado correctamente']);
    exit;
}

// 19.2 PANEL ADMIN: ELIMINAR CLIENTE / ANUNCIANTE
if ($action === 'admin_delete_provider') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $targetEmail = strtolower(trim($data['target_email'] ?? ''));
    if (empty($targetEmail)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email requerido']);
        exit;
    }

    // Borrar de proveedores_servicios.json
    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    $newProviders = [];
    if (is_array($providers)) {
        foreach ($providers as $p) {
            if (strtolower(trim($p['email'] ?? '')) !== $targetEmail) {
                $newProviders[] = $p;
            }
        }
        file_put_contents($provFile, json_encode($newProviders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    // Borrar de suscripciones.json
    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    $newSubs = [];
    if (is_array($subs)) {
        foreach ($subs as $s) {
            if (strtolower(trim($s['email'] ?? '')) !== $targetEmail) {
                $newSubs[] = $s;
            }
        }
        file_put_contents($subsFile, json_encode($newSubs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    echo json_encode(['status' => 'success', 'message' => 'Cliente eliminado con éxito']);
    exit;
}

// 20. PANEL ADMIN: ENVIAR MENSAJE A USUARIO
if ($action === 'admin_send_user_message') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $targetEmail = strtolower(trim($data['target_email'] ?? ''));
    $title = trim($data['title'] ?? 'Aviso del Administrador');
    $message = trim($data['message'] ?? '');
    $msgType = trim($data['type'] ?? 'info'); // info, warning, success, alert

    if (empty($targetEmail) || empty($message)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email y mensaje son obligatorios']);
        exit;
    }

    $msgFile = __DIR__ . '/mensajes_admin.json';
    $messages = file_exists($msgFile) ? json_decode(file_get_contents($msgFile), true) : [];
    if (!is_array($messages)) $messages = [];

    $newMsg = [
        'id' => 'msg_' . uniqid(),
        'target_email' => $targetEmail,
        'title' => $title,
        'message' => $message,
        'type' => $msgType,
        'created_at' => date('c'),
        'read' => false
    ];

    $messages[] = $newMsg;
    file_put_contents($msgFile, json_encode($messages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($msgFile, 0666);

    echo json_encode(['status' => 'success', 'message' => 'Mensaje enviado al usuario con éxito', 'data' => $newMsg]);
    exit;
}

// 21. OBTENER MENSAJES DEL USUARIO
if ($action === 'get_user_messages') {
    $email = strtolower(trim($_GET['email'] ?? $_POST['email'] ?? ''));
    if (empty($email)) {
        echo json_encode([]);
        exit;
    }

    $msgFile = __DIR__ . '/mensajes_admin.json';
    $messages = file_exists($msgFile) ? json_decode(file_get_contents($msgFile), true) : [];
    if (!is_array($messages)) $messages = [];

    $userMsgs = array_values(array_filter($messages, function($m) use ($email) {
        $target = strtolower(trim($m['target_email'] ?? ''));
        return $target === $email || $target === 'all';
    }));

    echo json_encode($userMsgs);
    exit;
}

// 22. ELIMINAR / MARCAR MENSAJE COMO LEÍDO
if ($action === 'delete_user_message') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $msgId = trim($data['id'] ?? '');

    if (empty($msgId)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'ID de mensaje requerido']);
        exit;
    }

    $msgFile = __DIR__ . '/mensajes_admin.json';
    $messages = file_exists($msgFile) ? json_decode(file_get_contents($msgFile), true) : [];
    if (!is_array($messages)) $messages = [];

    $newMsgs = array_values(array_filter($messages, fn($m) => ($m['id'] ?? '') !== $msgId));
    file_put_contents($msgFile, json_encode($newMsgs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    echo json_encode(['status' => 'success', 'message' => 'Mensaje descartado']);
    exit;
}

// 23. GUARDAR / EDITAR LOCAL GASTRONÓMICO
if ($action === 'save_gastronomia') {
    $email = strtolower(trim($_POST['owner_email'] ?? ''));
    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email de propietario requerido']);
        exit;
    }

    // 1. VALIDACIÓN ESTRICTA DE SUSCRIPCIÓN ACTIVA O ADMIN
    $isAdmin = ($email === ADMIN_EMAIL);
    if (!$isAdmin) {
        $subsFile = __DIR__ . '/suscripciones.json';
        $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
        $hasActiveSub = false;
        $now = time();
        if (is_array($subs)) {
            foreach ($subs as $sub) {
                if (strtolower(trim($sub['email'] ?? '')) === $email && !empty($sub['active']) && strtotime($sub['expires_at'] ?? '') > $now) {
                    $hasActiveSub = true;
                    break;
                }
            }
        }
        if (!$hasActiveSub) {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'SUBSCRIPTION_REQUIRED',
                'message' => '⛔ No tienes una suscripción activa ni código de gratuidad válido. Por favor abona tu suscripción ($10.000) o canjea tu código en Mi Panel antes de publicar.'
            ]);
            exit;
        }
    }

    $uploadDir = __DIR__ . '/img/gastronomia/';
    if (!file_exists($uploadDir)) {
        @mkdir($uploadDir, 0777, true);
    }
    @chmod($uploadDir, 0777);

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
                    $newFilename = 'gasto_' . uniqid() . '_' . time() . '.' . $ext;
                    $targetPath = $uploadDir . $newFilename;
                    if (move_uploaded_file($tmpName, $targetPath)) {
                        @chmod($targetPath, 0666);
                        $uploadedImages[] = 'img/gastronomia/' . $newFilename;
                    }
                }
            }
        }
    }

    $existingImages = json_decode($_POST['existing_images'] ?? '[]', true) ?: [];
    $allImages = array_merge($existingImages, $uploadedImages);
    if (empty($allImages)) {
        $allImages = ['img/gastronomia/patagonia.jpg'];
    }

    $gastoId = $_POST['id'] ?? ('gasto_' . time());
    $features = json_decode($_POST['features'] ?? '[]', true) ?: ['Excelente atención', 'Opciones ricas'];

    $newItem = [
        'id' => $gastoId,
        'owner_email' => $email,
        'name' => trim($_POST['name'] ?? 'Mi Local'),
        'type' => trim($_POST['type'] ?? 'Restaurante'),
        'location' => trim($_POST['location'] ?? 'Centro'),
        'rating' => floatval($_POST['rating'] ?? 4.8),
        'lat' => floatval($_POST['lat'] ?? -41.1335),
        'lng' => floatval($_POST['lng'] ?? -71.3103),
        'images' => $allImages,
        'description' => trim($_POST['description'] ?? ''),
        'specialty' => trim($_POST['specialty'] ?? ''),
        'promo' => trim($_POST['promo'] ?? ''),
        'features' => $features,
        'phone' => preg_replace('/[^\d]/', '', $_POST['phone'] ?? '5492944123456'),
        'is_active' => true,
        'updated_at' => date('c')
    ];

    $file = __DIR__ . '/gastronomia.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    if (!is_array($list)) $list = [];

    $isAdmin = ($email === ADMIN_EMAIL);
    $foundIndex = -1;
    foreach ($list as $idx => $item) {
        if ($item['id'] === $gastoId) {
            if ($item['owner_email'] !== $email && !$isAdmin) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'No tienes permiso para editar este local']);
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
    @chmod($file, 0666);

    echo json_encode(['status' => 'success', 'message' => 'Local gastronómico guardado con éxito', 'data' => $newItem]);
    exit;
}

// 24. ELIMINAR LOCAL GASTRONÓMICO
if ($action === 'delete_gastronomia') {
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
    $file = __DIR__ . '/gastronomia.json';
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
        echo json_encode(['status' => 'success', 'message' => 'Local gastronómico eliminado']);
    } else {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Local no encontrado']);
    }
    exit;
}

http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Acción no reconocida']);
?>
