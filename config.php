<?php
// config.php - Generador de Configuración de Entorno JS para Bariloche.Online
header('Content-Type: application/javascript; charset=UTF-8');
header('Cache-Control: public, max-age=3600');

require_once __DIR__ . '/env_loader.php';

$supabaseUrl = getEnvVar('SUPABASE_URL', 'https://pwrlbwplpgzirlcrwepi.supabase.co');
$supabaseKey = getEnvVar('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cmxid3BscGd6aXJsY3J3ZXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc0NzAsImV4cCI6MjA4NjkxMzQ3MH0.HxEfbABTObu4khKxVhtBaBuCt2RDBm34urnSEJCfJUU');
$adminEmail  = getEnvVar('ADMIN_EMAIL', 'oscarns@gmail.com');

$config = [
    'SUPABASE_URL' => $supabaseUrl,
    'SUPABASE_ANON_KEY' => $supabaseKey,
    'ADMIN_EMAIL' => $adminEmail
];

echo "window.APP_CONFIG = " . json_encode($config, JSON_UNESCAPED_SLASHES) . ";\n";
?>
