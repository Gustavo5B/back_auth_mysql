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

// ✅ SANITIZAR CÓDIGO - ACEPTA LETRAS, NÚMEROS Y GUIÓN
const sanitizeCode = (codigo) => {
  if (!codigo || typeof codigo !== 'string') return '';
  return codigo.trim().toUpperCase().substring(0, 9);
};

// ✅ VALIDAR CÓDIGO - FORMATO XXXX-XXXX (alfanumérico con guión)
const isValidCode = (codigo) => {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo);
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
    
    if (!correo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo requerido" 
      });
    }

    correo = sanitizeEmail(correo);

    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    secureLog.info('Configurando Gmail-2FA', { email: maskEmail(correo) });

    const code = generateCode();
    
    try {
      const result = await pool.query(
        `UPDATE usuarios
         SET secret_2fa = $1
         WHERE correo = $2`,
        [code, correo]
      );
      
      if (result.rowCount === 0) {
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

    try {
      await sendGmail2FACode(correo, code);
      secureLog.info('Email 2FA enviado', { email: maskEmail(correo) });
    } catch (emailError) {
      secureLog.error('Error al enviar email', emailError);
      
      await pool.query(
        `UPDATE usuarios
         SET secret_2fa = NULL
         WHERE correo = $1`,
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
    
    if (!correo || !codigo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo y código son requeridos" 
      });
    }

    correo = sanitizeEmail(correo);
    codigo = sanitizeCode(codigo);

    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    if (!isValidCode(codigo)) {
      return res.status(400).json({ 
        success: false,
        message: "El código debe tener formato XXXX-XXXX" 
      });
    }

    secureLog.info('Verificando código Gmail-2FA', { email: maskEmail(correo) });

    const result = await pool.query(
      `SELECT id_usuario FROM usuarios
       WHERE correo = $1 AND secret_2fa = $2`,
      [correo, codigo]
    );

    if (result.rows.length === 0) {
      secureLog.security('GMAIL_2FA_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ 
        success: false,
        message: "Código inválido o expirado" 
      });
    }

    const userId = result.rows[0].id_usuario;

    await pool.query(
      `UPDATE usuarios
       SET requiere_2fa = TRUE, secret_2fa = NULL
       WHERE correo = $1`,
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

    if (!correo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo requerido" 
      });
    }

    correo = sanitizeEmail(correo);

    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    secureLog.info('Enviando código de login Gmail-2FA', { email: maskEmail(correo) });

    const userCheck = await pool.query(
      `SELECT id_usuario FROM usuarios WHERE correo = $1 AND requiere_2fa = TRUE`,
      [correo]
    );

    if (userCheck.rows.length === 0) {
      secureLog.security('GMAIL_2FA_LOGIN_USUARIO_NO_ENCONTRADO', null, { email: maskEmail(correo) });
      return res.status(404).json({ 
        success: false,
        message: "Usuario no encontrado o Gmail-2FA no está activo" 
      });
    }

    const code = generateCode();
    
    await pool.query(
      `UPDATE usuarios
       SET secret_2fa = $1
       WHERE correo = $2`,
      [code, correo]
    );

    try {
      await sendGmail2FACode(correo, code);
    } catch (emailError) {
      secureLog.error('Error al enviar email de login', emailError);
      
      await pool.query(
        `UPDATE usuarios
         SET secret_2fa = NULL
         WHERE correo = $1`,
        [correo]
      );
      
      return res.status(500).json({ 
        success: false, 
        message: "No se pudo enviar el código. Intenta de nuevo." 
      });
    }
    
    secureLog.security('GMAIL_2FA_LOGIN_CODIGO_ENVIADO', userCheck.rows[0].id_usuario, { email: maskEmail(correo) });
    
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

    if (!correo || !codigo) {
      return res.status(400).json({ 
        success: false,
        message: "Correo y código son requeridos" 
      });
    }

    correo = sanitizeEmail(correo);
    codigo = sanitizeCode(codigo);

    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        success: false,
        message: "Formato de correo inválido" 
      });
    }

    if (!isValidCode(codigo)) {
      return res.status(400).json({ 
        success: false,
        message: "El código debe tener formato XXXX-XXXX" 
      });
    }

    secureLog.info('Verificando código de login Gmail-2FA', { email: maskEmail(correo) });
    
    const result = await pool.query(
      `SELECT id_usuario, nombre_completo, correo, estado FROM usuarios
       WHERE correo = $1 AND secret_2fa = $2`,
      [correo, codigo]
    );

    if (result.rows.length === 0) {
      secureLog.security('GMAIL_2FA_LOGIN_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ 
        success: false,
        message: "Código inválido o expirado" 
      });
    }

    const user = result.rows[0];

    if (user.estado !== 'activo') {
      secureLog.security('GMAIL_2FA_LOGIN_CUENTA_INACTIVA', user.id_usuario, { estado: user.estado });
      return res.status(403).json({ 
        success: false,
        message: "La cuenta no está activa" 
      });
    }

    await pool.query(
      `UPDATE usuarios
       SET secret_2fa = NULL
       WHERE id_usuario = $1`,
      [user.id_usuario]
    );

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

    try {
      const { saveActiveSession } = await import('../services/sessionService.js');
      await saveActiveSession(user.id_usuario, token, req);
    } catch (sessionError) {
      secureLog.error('Error al guardar sesión', sessionError);
    }

    secureLog.security('GMAIL_2FA_LOGIN_EXITOSO', user.id_usuario, { email: maskEmail(correo) });

    res.json({
      success: true,
      message: "Inicio de sesión exitoso ✅",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre_completo,
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

    const result = await pool.query(
      `UPDATE usuarios
       SET requiere_2fa = FALSE, secret_2fa = NULL
       WHERE id_usuario = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
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

    const result = await pool.query(
      `SELECT requiere_2fa FROM usuarios WHERE id_usuario = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Usuario no encontrado" 
      });
    }

    res.json({ 
      success: true,
      gmail2faActivo: result.rows[0].requiere_2fa === true
    });

  } catch (error) {
    secureLog.error('Error en estadoGmail2FA', error);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor." 
    });
  }
};