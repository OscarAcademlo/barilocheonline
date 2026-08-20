<?php
// backend/api/solicitud.php
require_once '../config/database.php';

header('Content-Type: application/json');

// Crear carpeta de uploads si no existe
$uploadDir = '../uploads/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Asegurarse que se acceda por POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $nombre_solicitante = htmlspecialchars(trim($_POST['nombre'] ?? ''));
    $email = htmlspecialchars(trim($_POST['email'] ?? ''));
    $telefono = htmlspecialchars(trim($_POST['telefono'] ?? ''));
    
    // Puntos de las Cards de Alojamiento
    $nombre_negocio = htmlspecialchars(trim($_POST['negocio'] ?? ''));
    $ubicacion = htmlspecialchars(trim($_POST['ubicacion'] ?? ''));
    $precio = htmlspecialchars(trim($_POST['precio'] ?? ''));
    $descripcion = htmlspecialchars(trim($_POST['descripcion'] ?? ''));
    $comodidades = isset($_POST['comodidades']) ? implode(", ", $_POST['comodidades']) : 'Ninguna seleccionada';

    if (empty($nombre_solicitante) || empty($email) || empty($nombre_negocio)) {
        echo json_encode(["status" => "error", "message" => "Nombre, email y negocio son campos obligatorios."]);
        exit;
    }

    // Procesar Fotos Subidas (Hasta 3)
    $fotos_urls = [];
    if (!empty($_FILES['fotos']['name'][0])) {
        $total_files = count($_FILES['fotos']['name']);
        // Limitar a 3 archivos por si acaso bypasseron el HTML
        $total_files = min($total_files, 3);
        
        for ($i = 0; $i < $total_files; $i++) {
            if ($_FILES['fotos']['error'][$i] === UPLOAD_ERR_OK) {
                $tmp_name = $_FILES['fotos']['tmp_name'][$i];
                $name = basename($_FILES['fotos']['name'][$i]);
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                
                // Validar que sea imagen
                $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
                if (in_array($ext, $allowed)) {
                    $newName = uniqid('foto_') . '.' . $ext;
                    $destination = $uploadDir . $newName;
                    if (move_uploaded_file($tmp_name, $destination)) {
                        // En Hostinger, deberías usar la ruta principal de tu dominio
                        // Aquí preparamos la ruta relativa o completa
                        $dominio = "https://" . $_SERVER['HTTP_HOST'] . "/backend/uploads/";
                        $fotos_urls[] = $dominio . $newName;
                    }
                }
            }
        }
    }

    $fotos_texto = empty($fotos_urls) ? "No se enviaron fotos." : implode("\n", $fotos_urls);

    $to = 'oscarns@gmail.com';
    $subject = 'Nueva Solicitud Completa de Alojamiento - Bariloche Online';
    $body = "Has recibido una nueva solicitud para publicar un alojamiento/negocio:\n\n" .
            "--- DATOS DEL CONTACTO ---\n" .
            "Nombre del titular: $nombre_solicitante\n" .
            "Email: $email\n" .
            "Teléfono/WhatsApp: $telefono\n\n" .
            "--- DATOS PARA LA CARD DE LA APP ---\n" .
            "Nombre del Alojamiento: $nombre_negocio\n" .
            "Ubicación / Barrio: $ubicacion\n" .
            "Precio Estimado: $\n$precio\n" .
            "Comodidades: $comodidades\n\n" .
            "Descripción:\n$descripcion\n\n" .
            "--- FOTOS ADJUNTAS (Links directos) ---\n" .
            $fotos_texto . "\n";

    $headers = "From: noreply@" . $_SERVER['SERVER_NAME'] . "\r\n";
    $headers .= "Reply-To: $email\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";

    if (mail($to, $subject, $body, $headers)) {
        echo json_encode(["status" => "success", "message" => "¡Tu solicitud completa fue enviada con éxito! Revisa tu email."]);
    } else {
        echo json_encode(["status" => "error", "message" => "Error al enviar el correo. Por favor, intenta de nuevo."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Método no permitido."]);
}
?>
