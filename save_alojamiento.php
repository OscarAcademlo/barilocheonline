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
        echo json_encode(['active' => true, 'is_admin' => true, 'expires_at' => '2099-12-31', 'plan' => 'admin', 'max_moviles' => 5]);
        exit;
    }

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    $now = time();

    // Determinar límite de móviles del prestador
    $maxMoviles = 1; // Por defecto para código gratuito / promo es 1 móvil
    if (is_array($providers)) {
        foreach ($providers as $p) {
            if (strtolower(trim($p['email'] ?? '')) === $email) {
                if (isset($p['cantidad_moviles']) && intval($p['cantidad_moviles']) > 0) {
                    $maxMoviles = min(5, max(1, intval($p['cantidad_moviles'])));
                } elseif (isset($p['max_moviles']) && intval($p['max_moviles']) > 0) {
                    $maxMoviles = min(5, max(1, intval($p['max_moviles'])));
                }
                break;
            }
        }
    }

    if (is_array($subs)) {
        foreach ($subs as $sub) {
            $subEmail = strtolower(trim($sub['email'] ?? ''));
            if ($subEmail === $email && !empty($sub['active'])) {
                $expStr = $sub['expires_at'] ?? '';
                $exp = strtotime($expStr);
                if ($exp >= $now) {
                    $plan = strtolower($sub['plan'] ?? '');
                    if (strpos($plan, '5_movil') !== false || strpos($plan, '120k') !== false) {
                        $maxMoviles = 5;
                    } elseif (strpos($plan, '3_movil') !== false || strpos($plan, '70k') !== false) {
                        $maxMoviles = 3;
                    }
                    echo json_encode([
                        'active' => true,
                        'is_admin' => false,
                        'expires_at' => $expStr,
                        'plan' => $sub['plan'] ?? 'standard',
                        'max_moviles' => $maxMoviles
                    ]);
                    exit;
                }
            }
        }
    }

    echo json_encode(['active' => false, 'is_admin' => false, 'max_moviles' => $maxMoviles]);
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
        'excursion-1v'   => intval($prices['excursiones_1v'] ?? 50000),
        'excursion-3v'   => intval($prices['excursiones_3v'] ?? 70000),
        'excursion-5v'   => intval($prices['excursiones_5v'] ?? 120000),
        'alojamiento'    => intval($prices['alojamiento'] ?? 10000),
        'gastronomia'    => intval($prices['gastronomia'] ?? 10000),
        'servicios_prof' => intval($prices['servicios_prof'] ?? 10000),
    ];
    $planPrice = $planPriceMap[$plan] ?? intval($prices['alojamiento'] ?? 10000);

    $planLabels = [
        'excursion-1v'   => 'Excursiones - 1 Vehículo GPS (1 mes)',
        'excursion-3v'   => 'Excursiones - Hasta 3 Vehículos GPS (1 mes)',
        'excursion-5v'   => 'Excursiones - Flota 5 Vehículos GPS (1 mes)',
        'alojamiento'    => 'Publicación Alojamiento (1 mes)',
        'gastronomia'    => 'Publicación Gastronomía (1 mes)',
        'servicios_prof' => 'Guías & Servicios Profesionales (1 mes)',
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
            'success' => "https://bariloche.online/perfil.html?payment=success&email=" . urlencode($email) . "&plan=" . urlencode($plan),
            'failure' => "https://bariloche.online/perfil.html?payment=failure",
            'pending' => "https://bariloche.online/perfil.html?payment=pending&email=" . urlencode($email) . "&plan=" . urlencode($plan)
        ],
        'notification_url' => "https://bariloche.online/save_alojamiento.php?action=webhook",
        'auto_return' => 'approved',
        'external_reference' => "sub_{$email}_" . str_replace('-', '_', $plan) . "_" . time()
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
    $plan = trim($_GET['plan'] ?? $_POST['plan'] ?? 'mercadopago_1m');
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
            $s['plan'] = $plan;
            $s['updated_at'] = date('c');
            $updated = true;
            break;
        }
    }

    if (!$updated) {
        $subs[] = [
            'email' => $email,
            'plan' => $plan,
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
                $planDetected = 'mercadopago_1m';

                if (preg_match('/sub_([^_]+)_([^_]+)_/', $extRef, $matches)) {
                    $payerEmail = strtolower(trim($matches[1]));
                    $planDetected = trim($matches[2]);
                } elseif (preg_match('/sub_([^_]+)_/', $extRef, $matches)) {
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
                            $s['plan'] = $planDetected;
                            $s['updated_at'] = date('c');
                            $s['payment_id'] = $paymentId;
                            $updated = true;
                            break;
                        }
                    }
                    if (!$updated) {
                        $subs[] = [
                            'email' => $payerEmail,
                            'plan' => $planDetected,
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
    $paymentMethods = json_decode($_POST['payment_methods'] ?? '{}', true) ?: [
        'cash' => isset($_POST['pay_cash']) ? (bool)$_POST['pay_cash'] : true,
        'transfer' => isset($_POST['pay_transfer']) ? (bool)$_POST['pay_transfer'] : true,
        'mercadopago' => isset($_POST['pay_mp']) ? (bool)$_POST['pay_mp'] : (!empty($_POST['mp_access_token']) || !empty($_POST['mp_link'])),
        'direct_contact' => true
    ];
    $transferDetails = trim($_POST['transfer_details'] ?? '');
    $mpAccessToken = trim($_POST['mp_access_token'] ?? '');
    $mpLink = trim($_POST['mp_link'] ?? '');

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
        'payment_methods' => $paymentMethods,
        'transfer_details' => $transferDetails,
        'mp_access_token' => $mpAccessToken,
        'mp_link' => $mpLink,
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

// 15b. OBTENER EMPRESAS DE EXCURSIONES HABILITADAS (para select del mapa y app Android)
if ($action === 'get_excursion_companies') {
    $file = __DIR__ . '/proveedores_servicios.json';
    if (!file_exists($file)) {
        echo json_encode([]);
        exit;
    }
    $providers = json_decode(file_get_contents($file), true) ?: [];
    $excursionCompanies = array_values(array_filter($providers, function($p) {
        if (!($p['is_active'] ?? false)) return false;
        $services = $p['services'] ?? [];
        return in_array('excursiones', $services);
    }));
    // Exponemos nombre, teléfono y lista de móviles/choferes públicos (sin passwords)
    $result = array_map(function($p) {
        $cleanList = [];
        foreach ($p['moviles'] ?? [] as $m) {
            if (($m['is_active'] ?? true) !== false) {
                $cleanList[] = [
                    'id' => $m['id'] ?? '',
                    'codigo' => $m['codigo'] ?? '',
                    'marca' => $m['marca'] ?? '',
                    'patente_ultimos3' => $m['patente_ultimos3'] ?? '',
                    'chofer_nombre' => $m['chofer_nombre'] ?? '',
                    'usuario' => $m['usuario'] ?? ''
                ];
            }
        }
        return [
            'name'  => $p['business_name'] ?? '',
            'phone' => $p['phone'] ?? '',
            'moviles' => $cleanList
        ];
    }, $excursionCompanies);
    echo json_encode(array_values($result));
    exit;
}

// 15c. LOGIN DE CHOFER DESDE LA APP ANDROID
if ($action === 'driver_login') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST ?: $_GET;
    $username = strtolower(trim((string)($data['usuario'] ?? $data['username'] ?? $data['user'] ?? '')));
    $password = trim((string)($data['password'] ?? $data['clave'] ?? $data['pass'] ?? ''));

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Ingresá tu usuario y contraseña asignados por la empresa.']);
        exit;
    }

    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    if (!is_array($providers)) $providers = [];

    $subsFile = __DIR__ . '/suscripciones.json';
    $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
    if (!is_array($subs)) $subs = [];

    $matchedMobile = null;
    $matchedCompany = null;

    foreach ($providers as $p) {
        if (($p['is_active'] ?? true) === false) continue;
        $services = $p['services'] ?? [];
        if (!in_array('excursiones', $services)) continue;

        // Validar si la empresa está al día
        $email = strtolower(trim($p['email'] ?? ''));
        $isSubActive = ($email === ADMIN_EMAIL || ($p['is_active'] ?? true) === true);
        if (!$isSubActive) {
            foreach ($subs as $s) {
                if (strtolower(trim($s['email'] ?? '')) === $email && !empty($s['active'])) {
                    if (empty($s['expires_at']) || strtotime($s['expires_at']) >= strtotime('today')) {
                        $isSubActive = true;
                        break;
                    }
                }
            }
        }
        if (!$isSubActive) continue;

        $moviles = $p['moviles'] ?? [];
        foreach ($moviles as $m) {
            if (($m['is_active'] ?? true) === false) continue;
            $mUser = strtolower(trim((string)($m['usuario'] ?? $m['username'] ?? '')));
            $mPass = trim((string)($m['password'] ?? $m['clave'] ?? ''));

            if (!empty($mUser) && $mUser === $username && $mPass === $password) {
                $matchedMobile = $m;
                $matchedCompany = $p;
                break 2;
            }
        }
    }

    if ($matchedMobile && $matchedCompany) {
        $cName = $matchedCompany['business_name'] ?: 'Empresa Excursión';
        $vBrand = $matchedMobile['marca'] ?: 'Combi';
        $vPlate = $matchedMobile['patente_ultimos3'] ?: '';
        $dName = $matchedMobile['chofer_nombre'] ?: 'Chofer';
        $vCode = trim($matchedMobile['codigo'] ?? '') ?: ($vBrand . ($vPlate ? " - $vPlate" : ""));

        echo json_encode([
            'status' => 'success',
            'message' => '¡Bienvenido ' . $dName . '!',
            'company_name' => $cName,
            'driver_name' => $dName,
            'vehicle_brand' => $vBrand,
            'vehicle_plate' => $vPlate,
            'vehicle_code' => $vCode,
            'color' => $matchedMobile['color'] ?? 'Blanco',
            'mobile_id' => $matchedMobile['id'] ?? ''
        ]);
        exit;
    }

    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Usuario o contraseña incorrectos, o la empresa no tiene la suscripción activa.'
    ]);
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
    $mpAccessToken = trim($data['mp_access_token'] ?? '');
    $mpPublicKey = trim($data['mp_public_key'] ?? '');
    $mpLink = trim($data['mp_link'] ?? '');

    // Calcular cupo máximo estricto según suscripción contratada o código promo
    $isAdmin = ($email === ADMIN_EMAIL);
    $maxAllowedMoviles = 1;
    if ($isAdmin) {
        $maxAllowedMoviles = 5;
    } else {
        $subsFile = __DIR__ . '/suscripciones.json';
        $subs = file_exists($subsFile) ? json_decode(file_get_contents($subsFile), true) : [];
        $hasActiveSub = false;
        $now = time();
        if (is_array($subs)) {
            foreach ($subs as $s) {
                if (strtolower(trim($s['email'] ?? '')) === $email && !empty($s['active'])) {
                    $exp = strtotime($s['expires_at'] ?? '');
                    if ($exp >= $now) {
                        $hasActiveSub = true;
                        $plan = strtolower(trim($s['plan'] ?? ''));
                        if (strpos($plan, '5v') !== false || strpos($plan, 'flota') !== false) {
                            $maxAllowedMoviles = 5;
                        } elseif (strpos($plan, '3v') !== false) {
                            $maxAllowedMoviles = 3;
                        } else {
                            $maxAllowedMoviles = 1;
                        }
                        break;
                    }
                }
            }
        }
    }

    // Limpiar y formatear móviles respetando el cupo contratado
    $cleanMoviles = [];
    foreach ($moviles as $m) {
        if (count($cleanMoviles) >= $maxAllowedMoviles) break; // Límite estricto según plan (1, 3 o 5)
        $cleanMoviles[] = [
            'id' => $m['id'] ?? ('movil_' . uniqid()),
            'codigo' => trim($m['codigo'] ?? 'Combi'),
            'marca' => trim($m['marca'] ?? ''),
            'color' => trim($m['color'] ?? 'Blanco'),
            'patente_ultimos3' => strtoupper(trim(substr($m['patente_ultimos3'] ?? '', -3))),
            'chofer_nombre' => trim($m['chofer_nombre'] ?? $m['driver_name'] ?? ''),
            'chofer_telefono' => trim($m['chofer_telefono'] ?? $m['phone'] ?? ''),
            'usuario' => strtolower(trim($m['usuario'] ?? $m['username'] ?? '')),
            'password' => trim($m['password'] ?? ''),
            'is_active' => isset($m['is_active']) ? (bool)$m['is_active'] : true
        ];
    }

    $paymentMethods = is_array($data['payment_methods'] ?? null) ? $data['payment_methods'] : [
        'cash' => isset($data['pay_cash']) ? (bool)$data['pay_cash'] : true,
        'transfer' => isset($data['pay_transfer']) ? (bool)$data['pay_transfer'] : true,
        'mercadopago' => isset($data['pay_mp']) ? (bool)$data['pay_mp'] : (!empty($mpAccessToken) || !empty($mpLink)),
        'direct_contact' => true
    ];
    $transferDetails = trim($data['transfer_details'] ?? '');

    $updated = false;
    foreach ($providers as &$p) {
        if (strtolower(trim($p['email'] ?? '')) === $email) {
            $p['business_name'] = $businessName ?: ($p['business_name'] ?? '');
            $p['phone'] = $phone ?: ($p['phone'] ?? '');
            $p['services'] = $selectedServices;
            $p['moviles'] = $cleanMoviles;
            $p['cantidad_moviles'] = count($cleanMoviles);
            if (!empty($mpAccessToken)) $p['mp_access_token'] = $mpAccessToken;
            if (!empty($mpPublicKey)) $p['mp_public_key'] = $mpPublicKey;
            if (!empty($mpLink)) $p['mp_link'] = $mpLink;
            $p['payment_methods'] = $paymentMethods;
            $p['transfer_details'] = $transferDetails;
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
            'mp_access_token' => $mpAccessToken,
            'mp_public_key' => $mpPublicKey,
            'mp_link' => $mpLink,
            'payment_methods' => $paymentMethods,
            'transfer_details' => $transferDetails,
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

    $moviles = is_array($data['moviles'] ?? null) ? $data['moviles'] : null;
    $cleanMoviles = null;
    if ($moviles !== null) {
        $cleanMoviles = [];
        foreach ($moviles as $m) {
            $cleanMoviles[] = [
                'id' => $m['id'] ?? ('movil_' . uniqid()),
                'codigo' => trim($m['codigo'] ?? 'Combi'),
                'marca' => trim($m['marca'] ?? ''),
                'color' => trim($m['color'] ?? 'Blanco'),
                'patente_ultimos3' => strtoupper(trim(substr($m['patente_ultimos3'] ?? '', -3))),
                'chofer_nombre' => trim($m['chofer_nombre'] ?? $m['driver_name'] ?? ''),
                'chofer_telefono' => trim($m['chofer_telefono'] ?? $m['phone'] ?? ''),
                'usuario' => strtolower(trim($m['usuario'] ?? $m['username'] ?? '')),
                'password' => trim($m['password'] ?? ''),
                'is_active' => isset($m['is_active']) ? (bool)$m['is_active'] : true
            ];
        }
    }

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
            if ($cleanMoviles !== null) {
                $p['moviles'] = $cleanMoviles;
                $p['cantidad_moviles'] = count($cleanMoviles);
            }
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
            'moviles' => $cleanMoviles ?: [],
            'cantidad_moviles' => count($cleanMoviles ?: []),
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

// 19b. PANEL ADMIN: ELIMINAR MÓVIL ESPECÍFICO DE UN PROVEEDOR
if ($action === 'admin_delete_movil') {
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

    $provFile = __DIR__ . '/proveedores_servicios.json';
    $providers = file_exists($provFile) ? json_decode(file_get_contents($provFile), true) : [];
    if (!is_array($providers)) $providers = [];

    $deleted = false;
    foreach ($providers as &$p) {
        if (strtolower(trim($p['email'] ?? '')) === $targetEmail) {
            $moviles = $p['moviles'] ?? [];
            $newMoviles = [];
            foreach ($moviles as $m) {
                if (($m['id'] ?? '') !== $movilId) {
                    $newMoviles[] = $m;
                } else {
                    $deleted = true;
                }
            }
            $p['moviles'] = $newMoviles;
            $p['cantidad_moviles'] = count($newMoviles);
            break;
        }
    }
    unset($p);

    if ($deleted) {
        file_put_contents($provFile, json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'success', 'message' => 'Móvil eliminado correctamente']);
        exit;
    }

    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Móvil no encontrado']);
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
        'location' => trim($_POST['location'] ?? 'Ubicación GPS Automática'),
        'rating' => floatval($_POST['rating'] ?? 4.8),
        'lat' => floatval($_POST['lat'] ?? -41.1335),
        'lng' => floatval($_POST['lng'] ?? -71.3103),
        'images' => $allImages,
        'description' => trim($_POST['description'] ?? ''),
        'specialty' => trim($_POST['specialty'] ?? ''),
        'promo' => trim($_POST['promo'] ?? ''),
        'open_days' => trim($_POST['open_days'] ?? 'Lunes a Domingos'),
        'open_hours' => trim($_POST['open_hours'] ?? '12:00 a 00:00 hs'),
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
        exit;
    }

    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Local no encontrado']);
    exit;
}

// 25. OBTENER CATEGORÍAS DE SERVICIOS DINÁMICAS
if ($action === 'get_service_categories') {
    $file = __DIR__ . '/categorias_servicios.json';
    if (!file_exists($file)) {
        file_put_contents($file, '[]');
    }
    echo file_get_contents($file);
    exit;
}

// 26. GUARDAR / EDITAR CATEGORÍA DE SERVICIOS (SOLO ADMIN)
if ($action === 'admin_save_category') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Acceso denegado: solo el administrador puede gestionar categorías']);
        exit;
    }

    $file = __DIR__ . '/categorias_servicios.json';
    $cats = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    if (!is_array($cats)) $cats = [];

    $catId = trim($data['id'] ?? '');
    $catName = trim($data['name'] ?? '');
    $catIcon = trim($data['icon'] ?? 'fa-briefcase');
    $catDesc = trim($data['description'] ?? '');

    if (empty($catName)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'El nombre de la categoría es obligatorio']);
        exit;
    }

    if (empty($catId)) {
        $catId = strtolower(preg_replace('/[^a-zA-Z0-9_]/', '', str_replace(' ', '_', $catName))) . '_' . uniqid();
    }

    $item = [
        'id' => $catId,
        'name' => $catName,
        'icon' => $catIcon,
        'description' => $catDesc,
        'is_active' => isset($data['is_active']) ? (bool)$data['is_active'] : true
    ];

    $found = false;
    foreach ($cats as &$c) {
        if ($c['id'] === $catId) {
            $c = array_merge($c, $item);
            $found = true;
            break;
        }
    }
    unset($c);

    if (!$found) {
        $cats[] = $item;
    }

    file_put_contents($file, json_encode($cats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    @chmod($file, 0666);

    echo json_encode(['status' => 'success', 'message' => 'Categoría guardada con éxito', 'data' => $item]);
    exit;
}

// 27. ELIMINAR CATEGORÍA DE SERVICIOS (SOLO ADMIN)
if ($action === 'admin_delete_category') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));
    $catId = trim($data['id'] ?? '');

    if ($adminEmail !== ADMIN_EMAIL) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
        exit;
    }

    $file = __DIR__ . '/categorias_servicios.json';
    $cats = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    $newList = array_values(array_filter($cats, function($c) use ($catId) {
        return ($c['id'] ?? '') !== $catId;
    }));

    file_put_contents($file, json_encode($newList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => 'Categoría eliminada']);
    exit;
}

// 28. OBTENER SERVICIOS PROFESIONALES (Guías, Mascotas, etc.)
if ($action === 'get_servicios') {
    $file = __DIR__ . '/servicios_profesionales.json';
    if (!file_exists($file)) {
        file_put_contents($file, '[]');
    }
    $list = json_decode(file_get_contents($file), true);
    if (!is_array($list)) $list = [];

    $category = trim($_GET['category'] ?? '');
    $email = strtolower(trim($_GET['email'] ?? ''));

    if (!empty($category)) {
        $list = array_values(array_filter($list, function($s) use ($category) {
            return ($s['category_id'] ?? '') === $category;
        }));
    }
    if (!empty($email)) {
        $list = array_values(array_filter($list, function($s) use ($email) {
            return strtolower(trim($s['email'] ?? '')) === $email;
        }));
    }

    echo json_encode($list);
    exit;
}

// 29. GUARDAR / EDITAR SERVICIO PROFESIONAL
if ($action === 'save_servicio') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Email requerido']);
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
                if (strtolower(trim($sub['email'] ?? '')) === $email && !empty($sub['active'])) {
                    $exp = strtotime($sub['expires_at'] ?? '');
                    if ($exp >= $now) {
                        $hasActiveSub = true;
                        break;
                    }
                }
            }
        }
        if (!$hasActiveSub) {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'SUBSCRIPTION_REQUIRED',
                'message' => '⛔ No tienes una suscripción activa ni código de gratuidad válido. Por favor abona tu suscripción o canjea tu código en Mi Panel antes de publicar.'
            ]);
            exit;
        }
    }

    $srvId = trim($data['id'] ?? '') ?: ('srv_' . uniqid());
    $name = trim($data['name'] ?? '');
    $categoryId = trim($data['category_id'] ?? '');
    $specialty = trim($data['specialty'] ?? '');
    $description = trim($data['description'] ?? '');
    $phone = trim($data['phone'] ?? '');
    $location = trim($data['location'] ?? 'Bariloche');
    $price = trim($data['price'] ?? '');
    $images = is_array($data['images'] ?? null) ? $data['images'] : [];

    if (empty($name) || empty($categoryId)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'El nombre y la categoría son obligatorios']);
        exit;
    }

    if (empty($images)) {
        $images = ['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800'];
    }

    $newItem = [
        'id' => $srvId,
        'email' => $email,
        'name' => $name,
        'category_id' => $categoryId,
        'specialty' => $specialty,
        'description' => $description,
        'phone' => $phone,
        'location' => $location,
        'price' => $price,
        'images' => $images,
        'is_active' => isset($data['is_active']) ? (bool)$data['is_active'] : true,
        'updated_at' => date('c')
    ];

    $file = __DIR__ . '/servicios_profesionales.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    if (!is_array($list)) $list = [];

    $isAdmin = ($email === ADMIN_EMAIL);
    $foundIndex = -1;
    foreach ($list as $idx => $item) {
        if ($item['id'] === $srvId) {
            if ($item['email'] !== $email && !$isAdmin) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'No tienes permiso para editar este servicio']);
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

    echo json_encode(['status' => 'success', 'message' => 'Servicio guardado con éxito', 'data' => $newItem]);
    exit;
}

// 30. ELIMINAR SERVICIO PROFESIONAL
if ($action === 'delete_servicio') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $id = trim($data['id'] ?? '');
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($id) || empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'ID y email requeridos']);
        exit;
    }

    $isAdmin = ($email === ADMIN_EMAIL);
    $file = __DIR__ . '/servicios_profesionales.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];

    $newList = [];
    $deleted = false;
    foreach ($list as $item) {
        if ($item['id'] === $id) {
            if ($item['email'] === $email || $isAdmin) {
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
        echo json_encode(['status' => 'success', 'message' => 'Servicio eliminado']);
        exit;
    }

    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Servicio no encontrado']);
    exit;
}

// 31. PROBAR TOKEN DE MERCADO PAGO DE UNA EMPRESA
if ($action === 'test_mp_token') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $token = trim($data['token'] ?? '');

    if (empty($token)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Token requerido']);
        exit;
    }

    $ch = curl_init('https://api.mercadopago.com/users/me');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $token
    ]);
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $info = json_decode($res, true);
        echo json_encode([
            'status' => 'success',
            'message' => 'Credencial válida',
            'user' => [
                'nickname' => $info['nickname'] ?? 'Empresa MP',
                'email' => $info['email'] ?? '',
                'site_id' => $info['site_id'] ?? 'MLA'
            ]
        ]);
    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Token de Mercado Pago inválido o expirado. Verificá tu Access Token de Producción.']);
    }
    exit;
}

// 32. CREAR PREFERENCIA DE PAGO DE TICKET DE EXCURSIÓN (Cobro Directo a la Empresa o Plataforma)
if ($action === 'create_ticket_preference') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $companyName = trim($data['empresa'] ?? '');
    $excursionName = trim($data['excursion'] ?? 'Excursión Bariloche');
    $combi = trim($data['combi'] ?? '');
    $driver = trim($data['chofer'] ?? '');
    $touristName = trim($data['tourist_name'] ?? '');
    $touristPhone = trim($data['tourist_phone'] ?? '');
    $pickupAddress = trim($data['pickup_address'] ?? 'Ubicación GPS Automática');
    $pickupLat = isset($data['pickup_lat']) && is_numeric($data['pickup_lat']) ? floatval($data['pickup_lat']) : -41.1335;
    $pickupLng = isset($data['pickup_lng']) && is_numeric($data['pickup_lng']) ? floatval($data['pickup_lng']) : -71.3103;
    $passengers = max(1, intval($data['passengers'] ?? 1));
    $totalAmount = max(100, intval($data['total_amount'] ?? (25000 * $passengers)));

    // Buscar si la empresa tiene su propio MP_ACCESS_TOKEN (NUNCA usar la cuenta de la plataforma como fallback)
    $tokenToUse = '';
    $provFile = __DIR__ . '/proveedores_servicios.json';
    if (file_exists($provFile)) {
        $providers = json_decode(file_get_contents($provFile), true) ?: [];
        foreach ($providers as $p) {
            $matchName = !empty($companyName) && strtolower(trim($p['business_name'] ?? '')) === strtolower(trim($companyName));
            $matchEmail = !empty($companyName) && strtolower(trim($p['email'] ?? '')) === strtolower(trim($companyName));
            if ($matchName || $matchEmail) {
                if (!empty($p['mp_access_token'])) {
                    $tokenToUse = trim($p['mp_access_token']);
                    break;
                }
            }
        }
    }

    if (empty($tokenToUse)) {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'La empresa ' . htmlspecialchars($companyName) . ' aún no ha ingresado sus credenciales de Mercado Pago para cobros directos. Podés reservar coordinando por WhatsApp, Efectivo o Transferencia.'
        ]);
        exit;
    }

    $ticketId = 'tkt_' . uniqid();
    $preferenceData = [
        'items' => [
            [
                'title'       => "{$passengers}x Ticket: {$excursionName} ({$companyName} - {$combi})",
                'description' => "Recogida en: {$pickupAddress} - Pasajero: {$touristName}",
                'quantity'    => 1,
                'currency_id' => 'ARS',
                'unit_price'  => $totalAmount
            ]
        ],
        'payer' => [
            'name'  => $touristName,
            'phone' => ['number' => $touristPhone]
        ],
        'back_urls' => [
            'success' => "https://bariloche.online/ticket.html?payment=success&ticket_id={$ticketId}&tourist_name=" . urlencode($touristName) . "&excursion=" . urlencode($excursionName) . "&combi=" . urlencode($combi) . "&chofer=" . urlencode($driver) . "&passengers={$passengers}",
            'failure' => "https://bariloche.online/ticket.html?payment=failure",
            'pending' => "https://bariloche.online/ticket.html?payment=pending&ticket_id={$ticketId}"
        ],
        'notification_url' => "https://bariloche.online/save_alojamiento.php?action=webhook_ticket",
        'auto_return' => 'approved',
        'external_reference' => "ticket_{$ticketId}"
    ];

    $ch = curl_init('https://api.mercadopago.com/checkout/preferences');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($preferenceData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $tokenToUse,
        'Content-Type: application/json'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $resData = json_decode($response, true);

        // Guardar ticket borrador
        $ticketDraft = [
            'ticket_id' => $ticketId,
            'company_name' => $companyName,
            'combi' => $combi,
            'driver' => $driver,
            'excursion_name' => $excursionName,
            'tourist_name' => $touristName,
            'tourist_phone' => $touristPhone,
            'pickup_address' => $pickupAddress,
            'pickup_lat' => $pickupLat,
            'pickup_lng' => $pickupLng,
            'passengers' => $passengers,
            'total_amount' => $totalAmount,
            'status' => 'pendiente',
            'created_at' => date('c')
        ];

        $tktFile = __DIR__ . '/tickets_excursiones.json';
        $tickets = file_exists($tktFile) ? json_decode(file_get_contents($tktFile), true) : [];
        if (!is_array($tickets)) $tickets = [];
        $tickets[] = $ticketDraft;
        file_put_contents($tktFile, json_encode($tickets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        echo json_encode([
            'status' => 'success',
            'init_point' => $resData['init_point'] ?? '',
            'preference_id' => $resData['id'] ?? '',
            'ticket_id' => $ticketId
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'No se pudo conectar con Mercado Pago para generar el ticket.',
            'details' => $response
        ]);
    }
    exit;
}

// 33. CONFIRMAR PAGO DE TICKET Y NOTIFICAR AL CHOFER EN TIEMPO REAL
if ($action === 'confirm_ticket_payment' || $action === 'webhook_ticket') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $ticketId = trim($_GET['ticket_id'] ?? $data['ticket_id'] ?? '');

    $tktFile = __DIR__ . '/tickets_excursiones.json';
    $tickets = file_exists($tktFile) ? json_decode(file_get_contents($tktFile), true) : [];
    if (!is_array($tickets)) $tickets = [];

    $confirmedTicket = null;
    foreach ($tickets as &$t) {
        if ($t['ticket_id'] === $ticketId || (!empty($ticketId) && strpos($ticketId, $t['ticket_id']) !== false)) {
            $t['status'] = 'pagado';
            $t['paid_at'] = date('c');
            $confirmedTicket = $t;
            break;
        }
    }
    unset($t);

    if ($confirmedTicket) {
        file_put_contents($tktFile, json_encode($tickets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Enviar a Supabase tourist_locations para alerta inmediata en la App del Chofer
        $supaPayload = [
            'company_name' => $confirmedTicket['company_name'],
            'vehicle_code' => $confirmedTicket['combi'],
            'tourist_name' => $confirmedTicket['tourist_name'],
            'tourist_phone' => $confirmedTicket['tourist_phone'],
            'address'      => $confirmedTicket['pickup_address'],
            'lat'          => $confirmedTicket['pickup_lat'] ?? -41.1335,
            'lng'          => $confirmedTicket['pickup_lng'] ?? -71.3103,
            'passengers'   => $confirmedTicket['passengers'],
            'status'       => 'pagado',
            'created_at'   => date('c'),
            'updated_at'   => date('c')
        ];

        // Insertar en Supabase REST
        try {
            $supaUrl = 'https://pwrlbwplpgzirlcrwepi.supabase.co/rest/v1/tourist_locations';
            $supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU';
            $sc = curl_init($supaUrl);
            curl_setopt($sc, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($sc, CURLOPT_POST, true);
            curl_setopt($sc, CURLOPT_POSTFIELDS, json_encode($supaPayload));
            curl_setopt($sc, CURLOPT_HTTPHEADER, [
                'apikey: ' . $supaKey,
                'Authorization: Bearer ' . $supaKey,
                'Content-Type: application/json',
                'Prefer: return=minimal'
            ]);
            curl_exec($sc);
            curl_close($sc);
        } catch (Exception $e) {}

        echo json_encode(['status' => 'success', 'message' => 'Ticket confirmado y chofer notificado en tiempo real', 'ticket' => $confirmedTicket]);
    } else {
        echo json_encode(['status' => 'success', 'message' => 'Webhook recibido']);
    }
    exit;
}

// 34. OBTENER TICKETS / PICKUPS DEL CHOFER
if ($action === 'get_driver_pickups') {
    $company = trim($_GET['company'] ?? '');
    $combi = trim($_GET['combi'] ?? '');

    $tktFile = __DIR__ . '/tickets_excursiones.json';
    $tickets = file_exists($tktFile) ? json_decode(file_get_contents($tktFile), true) : [];
    if (!is_array($tickets)) $tickets = [];

    $cleanTarget = strtolower(preg_replace('/[^a-z0-9]/', '', $company));

    $list = array_values(array_filter($tickets, function($t) use ($cleanTarget, $company) {
        if (($t['status'] ?? '') !== 'pagado') return false;
        if (empty($company)) return true;

        $tComp = strtolower(preg_replace('/[^a-z0-9]/', '', $t['company_name'] ?? ''));
        return empty($tComp) || empty($cleanTarget) || $tComp === $cleanTarget || strpos($tComp, $cleanTarget) !== false || strpos($cleanTarget, $tComp) !== false;
    }));

    echo json_encode(['status' => 'success', 'pickups' => $list]);
    exit;
}

// 34b. MARCAR PASAJERO COMO ABORDADO
if ($action === 'complete_ticket_pickup') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $ticketId = trim($data['ticket_id'] ?? '');

    $tktFile = __DIR__ . '/tickets_excursiones.json';
    $tickets = file_exists($tktFile) ? json_decode(file_get_contents($tktFile), true) : [];
    if (is_array($tickets)) {
        foreach ($tickets as &$t) {
            if (($t['ticket_id'] ?? '') === $ticketId) {
                $t['status'] = 'a_bordo';
                $t['completed_at'] = date('c');
                break;
            }
        }
        file_put_contents($tktFile, json_encode($tickets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    echo json_encode(['status' => 'success', 'message' => 'Pasajero marcado a bordo.']);
    exit;
}

// 35. COMPRA DE TICKET DE PRUEBA PARA ADMINISTRADOR (ADMIN BYPASS / $0)
if ($action === 'admin_test_ticket') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $adminEmail = strtolower(trim($data['admin_email'] ?? ''));

    if (!empty($adminEmail) && $adminEmail !== ADMIN_EMAIL && $adminEmail !== 'oscarns@gmail.com') {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Acceso denegado. Solo el administrador general puede emitir tickets de prueba gratuitos.']);
        exit;
    }

    $companyName = trim($data['empresa'] ?? '');
    $excursionName = trim($data['excursion'] ?? 'Excursión Bariloche');
    $combi = trim($data['combi'] ?? '');
    $driver = trim($data['chofer'] ?? '');
    $touristName = trim($data['tourist_name'] ?? 'Oscar Stella (Admin)');
    $touristPhone = trim($data['tourist_phone'] ?? '5492944674774');
    $pickupAddress = trim($data['pickup_address'] ?? 'Ubicación GPS Automática');
    $pickupLat = isset($data['pickup_lat']) && is_numeric($data['pickup_lat']) ? floatval($data['pickup_lat']) : -41.1335;
    $pickupLng = isset($data['pickup_lng']) && is_numeric($data['pickup_lng']) ? floatval($data['pickup_lng']) : -71.3103;
    $passengers = max(1, intval($data['passengers'] ?? 1));

    $ticketId = 'tkt_admin_' . uniqid();
    $testTicket = [
        'id' => $ticketId,
        'ticket_id' => $ticketId,
        'company_name' => $companyName,
        'combi' => $combi,
        'driver' => $driver,
        'excursion_name' => $excursionName,
        'tourist_name' => $touristName,
        'tourist_phone' => $touristPhone,
        'address' => $pickupAddress,
        'pickup_address' => $pickupAddress,
        'lat' => $pickupLat,
        'lng' => $pickupLng,
        'pickup_lat' => $pickupLat,
        'pickup_lng' => $pickupLng,
        'passengers' => $passengers,
        'total_amount' => 0,
        'status' => 'pagado',
        'is_admin_test' => true,
        'paid_at' => date('c'),
        'created_at' => date('c')
    ];

    $tktFile = __DIR__ . '/tickets_excursiones.json';
    $tickets = file_exists($tktFile) ? json_decode(file_get_contents($tktFile), true) : [];
    if (!is_array($tickets)) $tickets = [];
    $tickets[] = $testTicket;
    file_put_contents($tktFile, json_encode($tickets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    echo json_encode([
        'status' => 'success',
        'message' => 'Ticket de prueba emitido con éxito y chofer notificado en tiempo real.',
        'ticket' => $testTicket
    ]);
    exit;
}

// 36. OBTENER CONFIGURACIÓN DE MEDIOS DE PAGO DE UN PRESTADOR O ALOJAMIENTO
if ($action === 'get_payment_config') {
    $empresa = trim($_GET['empresa'] ?? '');
    $accId = trim($_GET['acc_id'] ?? '');

    $result = [
        'accepts_mp' => false,
        'accepts_transfer' => true,
        'accepts_cash' => true,
        'accepts_direct' => true,
        'transfer_details' => '',
        'mp_link' => '',
        'business_name' => $empresa
    ];

    if (!empty($empresa)) {
        $provFile = __DIR__ . '/proveedores_servicios.json';
        if (file_exists($provFile)) {
            $providers = json_decode(file_get_contents($provFile), true) ?: [];
            foreach ($providers as $p) {
                if (strtolower(trim($p['business_name'] ?? '')) === strtolower(trim($empresa)) || strtolower(trim($p['email'] ?? '')) === strtolower(trim($empresa))) {
                    $pm = $p['payment_methods'] ?? [];
                    $hasMp = !empty($p['mp_access_token']) || !empty($p['mp_link']);
                    $result['accepts_mp'] = isset($pm['mercadopago']) ? (bool)$pm['mercadopago'] : $hasMp;
                    $result['accepts_transfer'] = isset($pm['transfer']) ? (bool)$pm['transfer'] : !empty($p['transfer_details']);
                    $result['accepts_cash'] = isset($pm['cash']) ? (bool)$pm['cash'] : true;
                    $result['accepts_direct'] = isset($pm['direct_contact']) ? (bool)$pm['direct_contact'] : true;
                    $result['transfer_details'] = $p['transfer_details'] ?? ($pm['transfer_details'] ?? '');
                    $result['mp_link'] = $p['mp_link'] ?? '';
                    $result['phone'] = $p['phone'] ?? '';
                    break;
                }
            }
        }
    }

    if (!empty($accId)) {
        $accFile = __DIR__ . '/alojamientos.json';
        if (file_exists($accFile)) {
            $accs = json_decode(file_get_contents($accFile), true) ?: [];
            foreach ($accs as $a) {
                if ($a['id'] === $accId) {
                    $pm = $a['payment_methods'] ?? [];
                    $hasMp = !empty($a['mp_access_token']) || !empty($a['mp_link']);
                    $result['accepts_mp'] = isset($pm['mercadopago']) ? (bool)$pm['mercadopago'] : $hasMp;
                    $result['accepts_transfer'] = isset($pm['transfer']) ? (bool)$pm['transfer'] : !empty($a['transfer_details']);
                    $result['accepts_cash'] = isset($pm['cash']) ? (bool)$pm['cash'] : true;
                    $result['accepts_direct'] = isset($pm['direct_contact']) ? (bool)$pm['direct_contact'] : true;
                    $result['transfer_details'] = $a['transfer_details'] ?? ($pm['transfer_details'] ?? '');
                    $result['mp_link'] = $a['mp_link'] ?? '';
                    $result['phone'] = $a['phone'] ?? '';
                    break;
                }
            }
        }
    }

    echo json_encode(['status' => 'success', 'config' => $result]);
    exit;
}

http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Acción no reconocida']);
?>
