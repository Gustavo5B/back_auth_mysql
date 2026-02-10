import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode } from "../services/emailService.js";

dotenv.config();

// =========================================================
// 🛡️ FUNCIONES DE SANITIZACIÓN
// =========================================================

// Sanitizar email
const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  return email
    .trim()
    .toLowerCase()
    .replace(/[<>\"'`\\]/g, '')
    .substring(0, 255);
};

// Validar formato de email
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 255;
};

// Sanitizar código (solo dígitos)
const sanitizeCode = (codigo) => {
  if (!codigo || typeof codigo !== 'string') return '';
  return codigo.trim().replace(/[^0-9]/g, '').substring(0, 6);
};

// Validar código de 6 dígitos
const isValidCode = (codigo) => {
  return /^\d{6}$/.test(codigo);
};

// Sanitizar contraseña (detectar patrones maliciosos)
const sanitizePassword = (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Contraseña requerida');
  }

  const maliciousPatterns = [
    /<script/i,
    /<\/script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i,
    /<iframe/i,
    /eval\(/i,
    /alert\(/i,
    /onload=/i,
    /<img/i,
    /on\w+\s*=/i,
    /data:/i,
    /vbscript:/i,
    /expression\(/i,
    /url\(/i
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(password)) {
      throw new Error('La contraseña contiene caracteres no permitidos');
    }
  }

  return password.trim();
};

// Validar fortaleza de contraseña
const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Debe tener al menos 8 caracteres');
  }

  if (password.length > 128) {
    errors.push('La contraseña es demasiado larga (máximo 128 caracteres)');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una mayúscula');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una minúscula');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número');
  }

  if (!/[@$!%*?&#._-]/.test(password)) {
    errors.push('Debe contener al menos un carácter especial (@$!%*?&#._-)');
  }

  // Lista de contraseñas comunes
  const commonPasswords = [
    '12345678', 'password', 'qwerty123', '123456789', 'abc12345',
    'password123', '11111111', 'qwertyuiop', 'admin123', 'letmein123',
    'welcome1', 'monkey123', 'dragon123', 'master123', 'login123',
    'princess1', 'sunshine1', 'football1', 'iloveyou1', 'trustno1',
    'password1', 'superman1', 'michael1', 'shadow123', 'charlie1'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Contraseña demasiado común. Elige una más segura');
  }

  // Detectar patrones repetitivos
  if (/(.)\1{3,}/.test(password)) {
    errors.push('La contraseña no puede tener más de 3 caracteres repetidos consecutivos');
  }

  // Detectar secuencias numéricas
  if (/(?:012|123|234|345|456|567|678|789|890){2,}/.test(password)) {
    errors.push('La contraseña no puede contener secuencias numéricas obvias');
  }

  return errors;
};

// =========================================================
// 🔒 LOGGER SEGURO
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.contrasena;
    delete sanitized.password;
    delete sanitized.nuevaContrasena;
    delete sanitized.codigo;
    delete sanitized.token;
    
    console.log(`ℹ️ ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  
  error: (message, error) => {
    console.error(`❌ ${message}`, {
      name: error.name,
      code: error.code
    });
  },
  
  security: (action, userId, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.codigo;
    delete sanitized.password;
    
    console.log(`🔐 SECURITY [${action}] User:${userId || 'unknown'}`, {
      timestamp: new Date().toISOString(),
      ...sanitized
    });
  }
};

// =========================================================
// 🔒 ENMASCARAR EMAIL (para logs)
// =========================================================
const maskEmail = (email) => {
  if (!email) return 'correo oculto';
  
  const [localPart, domain] = email.split('@');
  
  if (!domain) return '***@***';
  
  const maskedLocal = localPart.length > 4
    ? localPart.substring(0, 2) + '***' + localPart.substring(localPart.length - 2)
    : '***';
  
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length > 1
    ? domainParts[0].substring(0, 1) + '***.' + domainParts.slice(1).join('.')
    : '***';
  
  return `${maskedLocal}@${maskedDomain}`;
};

// =========================================================
// 🔒 HELPER: Calcular tiempo de bloqueo progresivo
// =========================================================
const calcularTiempoBloqueoRecuperacion = (bloqueosTotales) => {
  if (bloqueosTotales === 0) return 15;
  if (bloqueosTotales === 1) return 30;
  if (bloqueosTotales === 2) return 60;
  return 120; // 2 horas para bloqueos recurrentes
};

// =========================================================
// 📧 SOLICITAR CÓDIGO DE RECUPERACIÓN
// =========================================================
export const requestRecoveryCode = async (req, res) => {
  const client = await pool.connect();
  
  try {
    let { correo } = req.body;

    // ✅ VALIDAR CAMPO REQUERIDO
    if (!correo) {
      return res.status(400).json({ message: "El correo es obligatorio" });
    }

    // ✅ SANITIZAR CORREO
    correo = sanitizeEmail(correo);

    // ✅ VALIDAR FORMATO
    if (!isValidEmail(correo)) {
      return res.status(400).json({ message: "Formato de correo inválido" });
    }

    secureLog.info('Solicitud de recuperación', { email: maskEmail(correo) });

    // ============================================
    // 1️⃣ BUSCAR USUARIO - ✅ POSTGRESQL
    // ============================================
    const userResult = await client.query(
      'SELECT * FROM usuarios WHERE correo = $1',
      [correo]
    );

    if (userResult.rows.length === 0) {
      secureLog.security('RECUPERACION_CORREO_NO_ENCONTRADO', null, { email: maskEmail(correo) });
      // 🔒 SEGURIDAD: No revelar si el correo existe
      return res.json({ 
        message: "Si el correo existe, recibirás un código de recuperación",
        correo: maskEmail(correo)
      });
    }

    const user = userResult.rows[0];

    // ============================================
    // 2️⃣ VERIFICAR SI ESTÁ BLOQUEADO
    // ============================================
    if (user.bloqueado_recuperacion_hasta) {
      const ahora = new Date();
      const desbloqueo = new Date(user.bloqueado_recuperacion_hasta);

      if (ahora < desbloqueo) {
        const minutosRestantes = Math.ceil((desbloqueo - ahora) / 60000);
        const horaDesbloqueo = desbloqueo.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });

        secureLog.security('RECUPERACION_BLOQUEADA', user.id_usuario, { 
          minutosRestantes,
          email: maskEmail(correo)
        });

        return res.status(429).json({
          blocked: true,
          message: `🔒 Demasiados intentos de recuperación. Por favor espera ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''} antes de intentar de nuevo.`,
          minutesRemaining: minutosRestantes,
          unlockTime: horaDesbloqueo
        });
      } else {
        // ✅ DESBLOQUEO AUTOMÁTICO - ✅ POSTGRESQL
        secureLog.info('Desbloqueando recuperación automáticamente', { userId: user.id_usuario });
        await client.query(
          `UPDATE usuarios 
           SET bloqueado_recuperacion_hasta = NULL
           WHERE id_usuario = $1`,
          [user.id_usuario]
        );
        user.bloqueado_recuperacion_hasta = null;
      }
    }

    // ============================================
    // 3️⃣ GENERAR Y GUARDAR CÓDIGO
    // ============================================
    const codigo = generateCode();

    // ✅ POSTGRESQL: Usar INTERVAL
    await client.query(
      `INSERT INTO codigos_recuperacion (id_usuario, codigo, fecha_expiracion)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [user.id_usuario, codigo]
    );

    // ============================================
    // 4️⃣ ENVIAR EMAIL
    // ============================================
    try {
      await sendRecoveryCode(correo, codigo);
      secureLog.security('CODIGO_RECUPERACION_ENVIADO', user.id_usuario, { 
        email: maskEmail(correo) 
      });
    } catch (emailError) {
      secureLog.error('Error al enviar email de recuperación', emailError);
    }

    res.json({ 
      message: "Si el correo existe, recibirás un código de recuperación",
      correo: maskEmail(correo)
    });

  } catch (error) {
    secureLog.error('Error en requestRecoveryCode', error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// =========================================================
// ✅ VALIDAR CÓDIGO DE RECUPERACIÓN
// =========================================================
export const validateRecoveryCode = async (req, res) => {
  try {
    let { correo, codigo } = req.body;

    // ✅ VALIDAR CAMPOS REQUERIDOS
    if (!correo || !codigo) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    // ✅ SANITIZAR ENTRADAS
    correo = sanitizeEmail(correo);
    codigo = sanitizeCode(codigo);

    // ✅ VALIDAR FORMATOS
    if (!isValidEmail(correo)) {
      return res.status(400).json({ message: "Formato de correo inválido" });
    }

    if (!isValidCode(codigo)) {
      return res.status(400).json({ message: "El código debe ser de 6 dígitos" });
    }

    secureLog.info('Validando código de recuperación', { email: maskEmail(correo) });

    // ✅ POSTGRESQL
    const result = await pool.query(
      `SELECT cr.* FROM codigos_recuperacion cr
       INNER JOIN usuarios u ON cr.id_usuario = u.id_usuario
       WHERE u.correo = $1 AND cr.codigo = $2 AND cr.usado = FALSE AND cr.fecha_expiracion > NOW()
       ORDER BY cr.fecha_creacion DESC LIMIT 1`,
      [correo, codigo]
    );

    if (result.rows.length === 0) {
      secureLog.security('CODIGO_RECUPERACION_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ 
        valid: false, 
        message: "Código inválido o expirado" 
      });
    }

    secureLog.security('CODIGO_RECUPERACION_VALIDO', null, { email: maskEmail(correo) });

    res.json({ valid: true, message: "Código válido" });

  } catch (error) {
    secureLog.error('Error en validateRecoveryCode', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// =========================================================
// 🔑 RESTABLECER CONTRASEÑA
// =========================================================
export const resetPassword = async (req, res) => {
  const client = await pool.connect();
  
  try {
    let { correo, codigo, nuevaContrasena } = req.body;

    // ✅ VALIDAR CAMPOS REQUERIDOS
    if (!correo || !codigo || !nuevaContrasena) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    // ✅ SANITIZAR CORREO
    correo = sanitizeEmail(correo);
    if (!isValidEmail(correo)) {
      return res.status(400).json({ message: "Formato de correo inválido" });
    }

    // ✅ SANITIZAR CÓDIGO
    codigo = sanitizeCode(codigo);
    if (!isValidCode(codigo)) {
      return res.status(400).json({ message: "El código debe ser de 6 dígitos" });
    }

    // ✅ SANITIZAR CONTRASEÑA
    try {
      nuevaContrasena = sanitizePassword(nuevaContrasena);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    // ✅ VALIDAR FORTALEZA DE CONTRASEÑA
    const passwordErrors = validatePasswordStrength(nuevaContrasena);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: "Contraseña insegura",
        errors: passwordErrors
      });
    }

    secureLog.info('Restableciendo contraseña', { email: maskEmail(correo) });

    await client.query('BEGIN');

    // ============================================
    // 1️⃣ VERIFICAR CÓDIGO - ✅ POSTGRESQL
    // ============================================
    const codeResult = await client.query(
      `SELECT cr.*, u.id_usuario, u.contraseña_hash FROM codigos_recuperacion cr
       INNER JOIN usuarios u ON cr.id_usuario = u.id_usuario
       WHERE u.correo = $1 AND cr.codigo = $2 AND cr.usado = FALSE AND cr.fecha_expiracion > NOW()
       ORDER BY cr.fecha_creacion DESC LIMIT 1`,
      [correo, codigo]
    );

    if (codeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      secureLog.security('RESET_PASSWORD_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ message: "Código inválido o expirado" });
    }

    const user = codeResult.rows[0];

    // ============================================
    // 2️⃣ VERIFICAR QUE NO SEA LA MISMA CONTRASEÑA
    // ============================================
    const isSamePassword = await bcrypt.compare(nuevaContrasena, user.contraseña_hash);
    if (isSamePassword) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: "La nueva contraseña no puede ser igual a la anterior" 
      });
    }

    // ============================================
    // 3️⃣ ACTUALIZAR CONTRASEÑA
    // ============================================
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(nuevaContrasena, saltRounds);

    await client.query(
      'UPDATE usuarios SET contraseña_hash = $1 WHERE id_usuario = $2',
      [hashedPassword, user.id_usuario]
    );

    // ============================================
    // 4️⃣ MARCAR CÓDIGO COMO USADO
    // ============================================
    await client.query(
      'UPDATE codigos_recuperacion SET usado = TRUE WHERE id_usuario = $1',
      [user.id_usuario]
    );

    // ============================================
    // 5️⃣ RESETEAR CONTADORES
    // ============================================
    await client.query(
      `UPDATE usuarios 
       SET bloqueado_recuperacion_hasta = NULL,
           intentos_fallidos = 0,
           bloqueado_hasta = NULL
       WHERE id_usuario = $1`,
      [user.id_usuario]
    );

    await client.query('COMMIT');
    
    secureLog.security('PASSWORD_RESTABLECIDA', user.id_usuario, { email: maskEmail(correo) });
    
    res.json({ 
      message: "Contraseña actualizada exitosamente ✅",
      success: true
    });

  } catch (error) {
    await client.query('ROLLBACK');
    secureLog.error('Error en resetPassword', error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// =========================================================
// 🧹 LIMPIEZA PERIÓDICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = async () => {
  try {
    const result = await pool.query(
      'DELETE FROM codigos_recuperacion WHERE fecha_expiracion < NOW() OR usado = TRUE'
    );
    secureLog.info('Códigos expirados eliminados', { cantidad: result.rowCount });
  } catch (error) {
    secureLog.error('Error al limpiar códigos', error);
  }
};