import { pool } from "../config/db.js";
import { generateCode, sendGmail2FACode } from "../services/emailService.js";

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

// =========================================================
// 🔒 ENMASCARAR EMAIL (para logs seguros)
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
// 🔒 LOGGER SEGURO
// =========================================================
const secureLog = {
  info: (action, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.codigo;
    delete sanitized.code;
    delete sanitized.token;
    
    console.log(`ℹ️ ${action}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  
  error: (action, error) => {
    console.error(`❌ ${action}`, {
      name: error.name,
      code: error.code || 'NONE'
    });
  },
  
  security: (action, userId, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.codigo;
    delete sanitized.code;
    
    console.log(`🔐 SECURITY [${action}] User ID: ${userId || 'unknown'}`, {
      timestamp: new Date().toISOString(),
      ...sanitized
    });
  }
};

// =========================================================
// 1️⃣ CONFIGURAR GMAIL-2FA (primera vez)
// =========================================================
export const configurarGmail2FA = async (req, res) => {
  try {
    let { correo } = req.body;
    
    // ✅ VALIDAR CAMPO REQUERIDO
    if (!correo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo requerido" 
      });
    }

    // ✅ SANITIZAR CORREO
    correo = sanitizeEmail(correo);

    // ✅ VALIDAR FORMATO
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    secureLog.info('Configurando Gmail-2FA', { email: maskEmail(correo) });

    // 1️⃣ Generar código
    const code = generateCode();
    
    // 2️⃣ Guardar en BD
    try {
      const [result] = await pool.query(
        `UPDATE Usuarios
         SET ultimo_codigo_gmail = ?, expiracion_codigo_gmail = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
         WHERE correo = ?`,
        [code, correo]
      );
      
      if (result.affectedRows === 0) {
        secureLog.security('GMAIL_2FA_USUARIO_NO_ENCONTRADO', null, { email: maskEmail(correo) });
        return res.status(404).json({ 
          success: false, 
          message: "Usuario no encontrado" 
        });
      }
    } catch (dbError) {
      secureLog.error('Error al guardar código en BD', dbError);
      return res.status(500).json({ 
        success: false, 
        message: "Error al procesar la solicitud" 
      });
    }

    // 3️⃣ Enviar email
    try {
      await sendGmail2FACode(correo, code);
      secureLog.info('Email 2FA enviado', { email: maskEmail(correo) });
    } catch (emailError) {
      secureLog.error('Error al enviar email', emailError);
      
      // Limpiar código si falla el envío
      await pool.query(
        `UPDATE Usuarios
         SET ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
         WHERE correo = ?`,
        [correo]
      );
      
      return res.status(500).json({ 
        success: false, 
        message: "No se pudo enviar el email. Verifica tu correo e intenta de nuevo."
      });
    }
    
    secureLog.security('GMAIL_2FA_CODIGO_ENVIADO', null, { email: maskEmail(correo) });
    
    res.json({ 
      success: true, 
      message: "Código de verificación enviado a tu correo.",
      email: maskEmail(correo)
    });
    
  } catch (error) {
    secureLog.error('Error general en configurarGmail2FA', error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor."
    });
  }
};

// =========================================================
// 2️⃣ VERIFICAR CÓDIGO Y ACTIVAR GMAIL-2FA
// =========================================================
export const verificarGmail2FA = async (req, res) => {
  try {
    let { correo, codigo } = req.body;
    
    // ✅ VALIDAR CAMPOS REQUERIDOS
    if (!correo || !codigo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo y código son requeridos" 
      });
    }

    // ✅ SANITIZAR ENTRADAS
    correo = sanitizeEmail(correo);
    codigo = sanitizeCode(codigo);

    // ✅ VALIDAR FORMATOS
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    if (!isValidCode(codigo)) {
      return res.status(400).json({ 
        success: false,
        message: "El código debe ser de 6 dígitos" 
      });
    }

    secureLog.info('Verificando código Gmail-2FA', { email: maskEmail(correo) });

    const [rows] = await pool.query(
      `SELECT id_usuario FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length) {
      secureLog.security('GMAIL_2FA_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ 
        success: false,
        message: "Código inválido o expirado" 
      });
    }

    const userId = rows[0].id_usuario;

    await pool.query(
      `UPDATE Usuarios
       SET metodo_gmail_2fa = 1, ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
       WHERE correo = ?`,
      [correo]
    );

    secureLog.security('GMAIL_2FA_ACTIVADO', userId, { email: maskEmail(correo) });

    res.json({ 
      success: true, 
      message: "Gmail-2FA activado correctamente ✅" 
    });

  } catch (error) {
    secureLog.error('Error en verificarGmail2FA', error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor."
    });
  }
};

// =========================================================
// 3️⃣ ENVIAR CÓDIGO AL INICIAR SESIÓN
// =========================================================
export const enviarCodigoLoginGmail = async (req, res) => {
  try {
    let { correo } = req.body;

    // ✅ VALIDAR CAMPO REQUERIDO
    if (!correo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo requerido" 
      });
    }

    // ✅ SANITIZAR CORREO
    correo = sanitizeEmail(correo);

    // ✅ VALIDAR FORMATO
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    secureLog.info('Enviando código de login Gmail-2FA', { email: maskEmail(correo) });

    // Verificar que el usuario existe y tiene Gmail-2FA activo
    const [userCheck] = await pool.query(
      `SELECT id_usuario FROM Usuarios WHERE correo = ? AND metodo_gmail_2fa = 1`,
      [correo]
    );

    if (!userCheck.length) {
      secureLog.security('GMAIL_2FA_LOGIN_USUARIO_NO_ENCONTRADO', null, { email: maskEmail(correo) });
      return res.status(404).json({ 
        success: false,
        message: "Usuario no encontrado o Gmail-2FA no está activo" 
      });
    }

    const code = generateCode();
    
    await pool.query(
      `UPDATE Usuarios
       SET ultimo_codigo_gmail = ?, expiracion_codigo_gmail = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE correo = ?`,
      [code, correo]
    );

    try {
      await sendGmail2FACode(correo, code);
    } catch (emailError) {
      secureLog.error('Error al enviar email de login', emailError);
      
      // Limpiar código si falla
      await pool.query(
        `UPDATE Usuarios
         SET ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
         WHERE correo = ?`,
        [correo]
      );
      
      return res.status(500).json({ 
        success: false, 
        message: "No se pudo enviar el código. Intenta de nuevo." 
      });
    }
    
    secureLog.security('GMAIL_2FA_LOGIN_CODIGO_ENVIADO', userCheck[0].id_usuario, { email: maskEmail(correo) });
    
    res.json({ 
      success: true, 
      message: "Código de acceso enviado a tu correo.",
      email: maskEmail(correo)
    });

  } catch (error) {
    secureLog.error('Error en enviarCodigoLoginGmail', error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor." 
    });
  }
};

// =========================================================
// 4️⃣ VERIFICAR CÓDIGO DURANTE LOGIN
// =========================================================
export const verificarCodigoLoginGmail = async (req, res) => {
  try {
    let { correo, codigo } = req.body;

    // ✅ VALIDAR CAMPOS REQUERIDOS
    if (!correo || !codigo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo y código son requeridos" 
      });
    }

    // ✅ SANITIZAR ENTRADAS
    correo = sanitizeEmail(correo);
    codigo = sanitizeCode(codigo);

    // ✅ VALIDAR FORMATOS
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    if (!isValidCode(codigo)) {
      return res.status(400).json({ 
        success: false,
        message: "El código debe ser de 6 dígitos" 
      });
    }

    secureLog.info('Verificando código de login Gmail-2FA', { email: maskEmail(correo) });
    
    const [rows] = await pool.query(
      `SELECT id_usuario, nombre, correo, estado FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length) {
      secureLog.security('GMAIL_2FA_LOGIN_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ 
        success: false,
        message: "Código inválido o expirado" 
      });
    }

    const user = rows[0];

    // ✅ Verificar estado de la cuenta
    if (user.estado !== 'Activo') {
      secureLog.security('GMAIL_2FA_LOGIN_CUENTA_INACTIVA', user.id_usuario, { estado: user.estado });
      return res.status(403).json({ 
        success: false,
        message: "La cuenta no está activa" 
      });
    }

    // ✅ Limpiar código usado
    await pool.query(
      `UPDATE Usuarios
       SET ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
       WHERE id_usuario = ?`,
      [user.id_usuario]
    );

    // ✅ Generar token JWT
    const jwt = (await import("jsonwebtoken")).default;
    const crypto = (await import("crypto")).default;
    
    const token = jwt.sign(
      { 
        sub: user.id_usuario.toString(),
        jti: crypto.randomUUID()
      },
      process.env.JWT_SECRET,
      { 
        algorithm: 'HS256',
        expiresIn: "24h",
        issuer: 'nub-studio',
        audience: 'nub-users'
      }
    );

    // ✅ Guardar sesión activa
    try {
      const { saveActiveSession } = await import('../services/sessionService.js');
      await saveActiveSession(user.id_usuario, token, req);
    } catch (sessionError) {
      secureLog.error('Error al guardar sesión', sessionError);
      // No fallar el login por esto
    }

    secureLog.security('GMAIL_2FA_LOGIN_EXITOSO', user.id_usuario, { email: maskEmail(correo) });

    res.json({
      success: true,
      message: "Inicio de sesión exitoso ✅",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo
      }
    });

  } catch (error) {
    secureLog.error('Error en verificarCodigoLoginGmail', error);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor." 
    });
  }
};

// =========================================================
// 5️⃣ DESACTIVAR GMAIL-2FA
// =========================================================
export const desactivarGmail2FA = async (req, res) => {
  try {
    const userId = req.user?.id_usuario;

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "No autorizado" 
      });
    }

    secureLog.info('Desactivando Gmail-2FA', { userId });

    const [result] = await pool.query(
      `UPDATE Usuarios
       SET metodo_gmail_2fa = 0, ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
       WHERE id_usuario = ?`,
      [userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Usuario no encontrado" 
      });
    }

    secureLog.security('GMAIL_2FA_DESACTIVADO', userId);

    res.json({ 
      success: true, 
      message: "Gmail-2FA desactivado correctamente" 
    });

  } catch (error) {
    secureLog.error('Error en desactivarGmail2FA', error);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor." 
    });
  }
};

// =========================================================
// 6️⃣ VERIFICAR ESTADO DE GMAIL-2FA
// =========================================================
export const estadoGmail2FA = async (req, res) => {
  try {
    const userId = req.user?.id_usuario;

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "No autorizado" 
      });
    }

    const [rows] = await pool.query(
      `SELECT metodo_gmail_2fa FROM Usuarios WHERE id_usuario = ?`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: "Usuario no encontrado" 
      });
    }

    res.json({ 
      success: true,
      gmail2faActivo: rows[0].metodo_gmail_2fa === 1
    });

  } catch (error) {
    secureLog.error('Error en estadoGmail2FA', error);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor." 
    });
  }
};