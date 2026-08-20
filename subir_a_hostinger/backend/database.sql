CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'advertiser') DEFAULT 'advertiser',
    category ENUM('gastronomia', 'excursiones', 'alojamiento', 'otro') NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- El usuario admin por defecto con contraseña "admin123"
INSERT INTO users (name, email, password, role, status)
VALUES ('Administrador', 'oscarns@gmail.com', '$2y$10$tZ2E1kZ8J/I0qN.2/S91B.463oZ9.H9k9u7uR3Wb7y2J22eI.i9J6', 'admin', 'active');
