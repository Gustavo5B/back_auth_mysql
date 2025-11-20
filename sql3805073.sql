-- ========================================
-- 🔒 AGREGAR COLUMNAS DE BLOQUEO
-- ========================================
ALTER TABLE Usuarios
ADD COLUMN intentos_login_fallidos INT DEFAULT 0,
ADD COLUMN ultimo_intento_fallido DATETIME NULL,
ADD COLUMN bloqueado_hasta DATETIME NULL,
ADD COLUMN bloqueos_totales INT DEFAULT 0;

-- ========================================
-- 📊 TABLA DE AUDITORÍA (OPCIONAL PERO RECOMENDADA)
-- ========================================
CREATE TABLE IF NOT EXISTS Historial_Login (
  id_historial INT PRIMARY KEY AUTO_INCREMENT,
  id_usuario INT NULL,
  correo VARCHAR(255) NOT NULL,
  tipo ENUM('exitoso', 'fallido', 'bloqueado') NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  razon_fallo VARCHAR(255) NULL,
  FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE SET NULL,
  INDEX idx_correo_fecha (correo, fecha_hora),
  INDEX idx_tipo (tipo)
);