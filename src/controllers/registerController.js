import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { sendVerificationEmail } from "../services/emailService.js";

dotenv.config();

// =========================================================
// 🔒 LOGGER SEGURO
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.contrasena;
    delete sanitized.password;
    delete sanitized.codigo;
    delete sanitized.codigoVerificacion;
    delete sanitized.ip; // ✅ NO loggear IPs completas
    
    console.log(`ℹ️ ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  
  error: (message, error) => {
    console.error(`❌ ${message}`, {
      name: error.name,
      code: error.code
    });
  },
  
  security: (action, userId, metadata = {}) => {
    console.log(`🔐 SECURITY [${action}] User:${userId || 'unknown'}`, {
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }
};

// =========================================================
// 📍 OBTENER IP REAL DEL USUARIO
// =========================================================
const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  return req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         req.ip ||
         'IP no disponible';
};

// =========================================================
// 🕐 OBTENER FECHA/HORA EN ZONA HORARIA DE MÉXICO
// =========================================================
const getMexicoDateTime = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts();

  let year = parts.find(p => p.type === 'year').value;
  let month = parts.find(p => p.type === 'month').value;
  let day = parts.find(p => p.type === 'day').value;
  let hour = parts.find(p => p.type === 'hour').value;
  let minute = parts.find(p => p.type === 'minute').value;
  let second = parts.find(p => p.type === 'second').value;

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

// =========================================================
// 🔢 GENERAR CÓDIGO DE VERIFICACIÓN DE 6 DÍGITOS
// =========================================================
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// =========================================================
// 🛡️ SANITIZAR NOMBRE
// =========================================================
const sanitizeName = (nombre) => {
  return nombre
    .trim()
    .replace(/[<>\"'`]/g, '')
    .substring(0, 100);
};

// =========================================================
// 🛡️ SANITIZAR EMAIL
// =========================================================
const sanitizeEmail = (email) => {
  return email
    .trim()
    .toLowerCase()
    .replace(/[<>\"'`]/g, '')
    .substring(0, 255);
};

// =========================================================
// 🛡️ SANITIZAR CONTRASEÑA
// =========================================================
const sanitizePassword = (password) => {
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
    /src=/i
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(password)) {
      throw new Error('Contraseña contiene caracteres no permitidos');
    }
  }

  return password.trim();
};

// =========================================================
// 🔐 VALIDAR FORMATO DE NOMBRE
// =========================================================
const isValidName = (nombre) => {
  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  return nameRegex.test(nombre) && nombre.length >= 2 && nombre.length <= 100;
};

// =========================================================
// 🔐 VALIDAR COMPLEJIDAD DE CONTRASEÑA
// =========================================================
const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Debe tener al menos 8 caracteres');
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

  if (!/[@$!%*?&#]/.test(password)) {
    errors.push('Debe contener al menos un carácter especial (@$!%*?&#)');
  }

  const commonPasswords = [
    '12345678', 'password', 'qwerty123', '123456789', 'abc123',
    'password123', '11111111', 'qwertyuiop', 'password1', 'admin123',
    'letmein', 'welcome123', 'monkey123', 'dragon123', 'master123',
    'sunshine', 'princess', 'football', 'iloveyou', 'trustno1'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Contraseña demasiado común. Elige una más segura');
  }

  return errors;
};

// =========================================================
// 🔐 VALIDAR FORMATO DE EMAIL
// =========================================================
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 255;
};

// =========================================================
// 📝 REGISTRO DE USUARIO CON VERIFICACIÓN
// =========================================================
export const register = async (req, res) => {
  let { nombre, correo, contrasena, aceptoTerminos } = req.body;

  try {
    secureLog.info('Iniciando proceso de registro', { correo });

    // 1️⃣ VALIDACIONES BÁSICAS
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ 
        message: "Todos los campos son obligatorios" 
      });
    }

    // ✅ VALIDAR ACEPTACIÓN DE TÉRMINOS
    if (!aceptoTerminos || aceptoTerminos !== true) {
      return res.status(400).json({ 
        message: "Debes aceptar los Términos y Condiciones para continuar" 
      });
    }

    // 2️⃣ SANITIZAR Y VALIDAR NOMBRE
    nombre = sanitizeName(nombre);
    
    if (!isValidName(nombre)) {
      return res.status(400).json({ 
        message: "El nombre solo puede contener letras y espacios (2-100 caracteres)" 
      });
    }

    // 3️⃣ SANITIZAR Y VALIDAR EMAIL
    correo = sanitizeEmail(correo);
    
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        message: "El formato del correo no es válido" 
      });
    }

    // 4️⃣ SANITIZAR Y VALIDAR CONTRASEÑA
    try {
      contrasena = sanitizePassword(contrasena);
    } catch (error) {
      return res.status(400).json({ 
        message: error.message 
      });
    }

    const passwordErrors = validatePasswordStrength(contrasena);
    
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: "Contraseña insegura",
        errors: passwordErrors
      });
    }

    // 5️⃣ VERIFICAR SI EL CORREO YA EXISTE
    const [existingUser] = await pool.query(
      "SELECT id_usuario FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (existingUser.length > 0) {
      secureLog.security('REGISTRO_DUPLICADO', null, { correo });
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    // 6️⃣ ENCRIPTAR CONTRASEÑA
    const saltRounds = 12;
    const hash = await bcrypt.hash(contrasena, saltRounds);

    // 7️⃣ GENERAR CÓDIGO DE VERIFICACIÓN
    const codigoVerificacion = generateVerificationCode();
    const expiracion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 📍 OBTENER IP Y FECHA/HORA
    const ipUsuario = getClientIP(req);
    const fechaAceptacion = getMexicoDateTime();

    // 8️⃣ INSERTAR USUARIO
    const insertQuery = `
      INSERT INTO Usuarios 
      (nombre, correo, contrasena, estado, codigo_verificacion, expiracion_codigo_verificacion,
       acepto_terminos, fecha_aceptacion_terminos, version_terminos_aceptada, ip_aceptacion) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.query(insertQuery, [
      nombre,
      correo,
      hash,
      "Pendiente",
      codigoVerificacion,
      expiracion,
      true,
      fechaAceptacion,
      '1.0',
      ipUsuario
    ]);

    secureLog.security('REGISTRO_EXITOSO', result.insertId, { 
      correo,
      terminosAceptados: true 
    });

    // 9️⃣ ENVIAR EMAIL DE VERIFICACIÓN
    try {
      await sendVerificationEmail(correo, nombre, codigoVerificacion);
      secureLog.info('Código de verificación enviado', { 
        userId: result.insertId 
      });
    } catch (emailError) {
      secureLog.error('Error al enviar email de verificación', emailError);
      
      // Si falla el email, eliminar el usuario creado
      await pool.query(
        "DELETE FROM Usuarios WHERE id_usuario = ?",
        [result.insertId]
      );
      
      return res.status(500).json({ 
        message: "No se pudo enviar el correo de verificación. Intenta nuevamente."
      });
    }

    // 🎉 RESPONDER AL CLIENTE
    res.status(201).json({ 
      message: "Registro exitoso. Revisa tu correo para verificar tu cuenta 📧",
      requiresVerification: true,
      user: {
        id: result.insertId,
        nombre,
        correo,
        terminos_aceptados: true,
        version_terminos: '1.0'
        // ❌ NO enviar IP ni fecha al cliente
      }
    });

  } catch (error) {
    secureLog.error('Error en registro', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    res.status(500).json({ 
      message: "Error al registrar usuario."
    });
  }
};

// =========================================================
// ✅ VERIFICAR CÓDIGO DE EMAIL
// =========================================================
export const verifyEmail = async (req, res) => {
  try {
    let { correo, codigo } = req.body;

    secureLog.info('Verificando código', { correo });

    if (!correo || !codigo) {
      return res.status(400).json({ 
        message: "Correo y código son obligatorios" 
      });
    }

    // ✅ SANITIZAR ENTRADAS
    correo = sanitizeEmail(correo);
    codigo = codigo.trim();

    if (!/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ 
        message: "Código inválido. Debe ser de 6 dígitos" 
      });
    }

    const selectQuery = `
      SELECT id_usuario, nombre, codigo_verificacion, expiracion_codigo_verificacion 
      FROM Usuarios 
      WHERE correo = ? AND estado = ? 
      LIMIT 1
    `;
    
    const [rows] = await pool.query(selectQuery, [correo, 'Pendiente']);

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: "Usuario no encontrado o ya verificado" 
      });
    }

    const user = rows[0];

    if (user.codigo_verificacion !== codigo) {
      secureLog.security('CODIGO_VERIFICACION_INCORRECTO', user.id_usuario);
      return res.status(401).json({ 
        message: "Código de verificación incorrecto" 
      });
    }

    const now = new Date();
    const expiracion = new Date(user.expiracion_codigo_verificacion);
    
    if (now > expiracion) {
      secureLog.security('CODIGO_VERIFICACION_EXPIRADO', user.id_usuario);
      return res.status(401).json({ 
        message: "El código ha expirado. Solicita uno nuevo." 
      });
    }

    const updateQuery = `
      UPDATE Usuarios 
      SET estado = ?, 
          codigo_verificacion = NULL, 
          expiracion_codigo_verificacion = NULL 
      WHERE id_usuario = ?
    `;
    
    await pool.query(updateQuery, ['Activo', user.id_usuario]);

    secureLog.security('CUENTA_VERIFICADA', user.id_usuario);

    const { sendWelcomeEmail } = await import('../services/emailService.js');
    sendWelcomeEmail(correo, user.nombre)
      .then(() => secureLog.info('Email de bienvenida enviado', { userId: user.id_usuario }))
      .catch((err) => secureLog.error('Error enviando email de bienvenida', err));

    res.json({ 
      message: "✅ Cuenta verificada exitosamente. Ya puedes iniciar sesión.",
      verified: true
    });

  } catch (error) {
    secureLog.error('Error en verificación', error);
    res.status(500).json({ 
      message: "Error al verificar cuenta" 
    });
  }
};

// =========================================================
// 🔄 REENVIAR CÓDIGO DE VERIFICACIÓN
// =========================================================
export const resendVerificationCode = async (req, res) => {
  try {
    let { correo } = req.body;

    secureLog.info('Reenviando código', { correo });

    if (!correo) {
      return res.status(400).json({ 
        message: "El correo es obligatorio" 
      });
    }

    correo = sanitizeEmail(correo);

    const selectQuery = `
      SELECT id_usuario, nombre 
      FROM Usuarios 
      WHERE correo = ? AND estado = ? 
      LIMIT 1
    `;
    
    const [rows] = await pool.query(selectQuery, [correo, 'Pendiente']);

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: "Usuario no encontrado o ya verificado" 
      });
    }

    const user = rows[0];

    const nuevoCodigoVerificacion = generateVerificationCode();
    const nuevaExpiracion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const updateQuery = `
      UPDATE Usuarios 
      SET codigo_verificacion = ?, 
          expiracion_codigo_verificacion = ? 
      WHERE id_usuario = ?
    `;
    
    await pool.query(updateQuery, [
      nuevoCodigoVerificacion,
      nuevaExpiracion,
      user.id_usuario
    ]);

    const { sendVerificationEmail } = await import('../services/emailService.js');
    await sendVerificationEmail(correo, user.nombre, nuevoCodigoVerificacion);

    secureLog.security('CODIGO_REENVIADO', user.id_usuario);

    res.json({ 
      message: "Código reenviado exitosamente 📧" 
    });

  } catch (error) {
    secureLog.error('Error reenviando código', error);
    res.status(500).json({ 
      message: "Error al reenviar código" 
    });
  }
};