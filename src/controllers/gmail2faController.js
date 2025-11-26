import { pool } from "../config/db.js";
import { generateCode, sendGmail2FACode } from "../services/emailService.js";

// =========================================================
// 🔒 ENMASCARAR EMAIL (para logs seguros)
// =========================================================
const maskEmail = (email) => {
  if (!email) return 'correo oculto';
  
  const [localPart, domain] = email.split('@');
  
  if (!domain) return '***@***';
  
  const maskedLocal = localPart.length > 4
    ? localPart.substring(0, 2) + '***' + localPart.substring(localPart.length - 3)
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
    console.log(`ℹ️ ${action}`, Object.keys(metadata).length > 0 ? metadata : '');
  },
  
  error: (action, error) => {
    console.error(`❌ ${action}`);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code || 'NONE');
  },
  
  security: (action, userId, metadata = {}) => {
    console.log(`🔐 SECURITY [${action}] User ID: ${userId || 'unknown'}`, 
                Object.keys(metadata).length > 0 ? metadata : '');
  }
};

/**
 * 1️⃣ Configura Gmail-2FA (solo se usa una vez)
 */
export const configurarGmail2FA = async (req, res) => {
  try {
    const { correo } = req.body;
    
    console.log('📥 Request recibido en /gmail-2fa/configurar');
    console.log('Correo:', maskEmail(correo));
    
    if (!correo) {
      console.log('❌ Error: Correo no proporcionado');
      return res.status(400).json({ message: "Correo requerido" });
    }

    secureLog.info('Configurando Gmail-2FA', { email: maskEmail(correo) });

    // 1️⃣ Generar código
    const code = generateCode();
    console.log('🔢 Código generado (longitud:', code.length, ')');
    
    // 2️⃣ Guardar en BD
    console.log('💾 Guardando código en base de datos...');
    try {
      const [result] = await pool.query(
        `UPDATE Usuarios
         SET ultimo_codigo_gmail = ?, expiracion_codigo_gmail = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
         WHERE correo = ?`,
        [code, correo]
      );
      
      console.log('✅ Código guardado. Filas afectadas:', result.affectedRows);
      
      if (result.affectedRows === 0) {
        console.log('⚠️ Advertencia: No se encontró el usuario en BD');
        return res.status(404).json({ 
          success: false, 
          message: "Usuario no encontrado" 
        });
      }
    } catch (dbError) {
      secureLog.error('Error al guardar código en BD', dbError);
      return res.status(500).json({ 
        success: false, 
        message: "Error al guardar el código" 
      });
    }

    // 3️⃣ Enviar email
    console.log('📧 Intentando enviar email...');
    try {
      await sendGmail2FACode(correo, code);
      console.log('✅ Email enviado exitosamente');
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
        message: "No se pudo enviar el email. Verifica tu correo e intenta de nuevo.",
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
    
    secureLog.security('GMAIL_2FA_CODIGO_ENVIADO', null, { email: maskEmail(correo) });
    
    console.log('✅ Proceso completado exitosamente');
    res.json({ 
      success: true, 
      message: "Código de verificación enviado a tu correo.",
      email: maskEmail(correo)
    });
    
  } catch (error) {
    secureLog.error('Error general en configurarGmail2FA', error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 2️⃣ Verifica el código recibido y activa Gmail-2FA
 */
export const verificarGmail2FA = async (req, res) => {
  try {
    const { correo, codigo } = req.body;
    
    console.log('📥 Request recibido en /gmail-2fa/verificar');
    console.log('Correo:', maskEmail(correo));
    
    if (!correo || !codigo) {
      return res.status(400).json({ message: "Correo y código requeridos" });
    }

    secureLog.info('Verificando código Gmail-2FA', { email: maskEmail(correo) });

    const [rows] = await pool.query(
      `SELECT id_usuario FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length) {
      console.log('❌ Código inválido o expirado');
      secureLog.security('GMAIL_2FA_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ message: "Código inválido o expirado" });
    }

    const userId = rows[0].id_usuario;
    console.log('✅ Código válido para usuario ID:', userId);

    await pool.query(
      `UPDATE Usuarios
       SET metodo_gmail_2fa = 1, ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
       WHERE correo = ?`,
      [correo]
    );

    secureLog.security('GMAIL_2FA_ACTIVADO', userId, { email: maskEmail(correo) });

    res.json({ success: true, message: "Gmail-2FA activado correctamente ✅" });
  } catch (error) {
    secureLog.error('Error en verificarGmail2FA', error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 3️⃣ Enviar código al iniciar sesión
 */
export const enviarCodigoLoginGmail = async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ message: "Correo requerido" });

    secureLog.info('Enviando código de login Gmail-2FA', { email: maskEmail(correo) });

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
      return res.status(500).json({ 
        success: false, 
        message: "No se pudo enviar el código" 
      });
    }
    
    secureLog.security('GMAIL_2FA_LOGIN_CODIGO_ENVIADO', null, { email: maskEmail(correo) });
    
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

/**
 * 4️⃣ Verificar código durante login
 */
export const verificarCodigoLoginGmail = async (req, res) => {
  try {
    const { correo, codigo } = req.body;
    
    secureLog.info('Verificando código de login Gmail-2FA', { email: maskEmail(correo) });
    
    const [rows] = await pool.query(
      `SELECT id_usuario, nombre, correo FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length) {
      secureLog.security('GMAIL_2FA_LOGIN_CODIGO_INVALIDO', null, { email: maskEmail(correo) });
      return res.status(401).json({ message: "Código inválido o expirado" });
    }

    const user = rows[0];

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

    secureLog.security('GMAIL_2FA_LOGIN_EXITOSO', user.id_usuario, { email: maskEmail(correo) });

    res.json({
      message: "Inicio de sesión exitoso ✅",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
      },
    });
  } catch (error) {
    secureLog.error('Error en verificarCodigoLoginGmail', error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};