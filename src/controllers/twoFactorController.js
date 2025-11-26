import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { pool } from "../config/db.js";

// =========================================================
// 🔒 LOGGER SEGURO
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.codigo;
    
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

// ===============================
// 🔹 Generar secreto y QR para TOTP
// ===============================
export const setupTOTP = async (req, res) => {
  try {
    const { correo } = req.body;

    secureLog.info('Configurando TOTP', { correo });

    if (!correo) {
      return res.status(400).json({ message: "Correo requerido" });
    }

    // Generar secreto TOTP
    const secret = speakeasy.generateSecret({
      name: `NU-B Studio (${correo})`,
      length: 32,
    });

    // Generar QR Code (imagen base64)
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Guardar el secreto temporalmente en BD
    await pool.query(
      `UPDATE Usuarios 
       SET secreto_2fa = ?, metodo_2fa = 'TOTP', esta_2fa_habilitado = 0 
       WHERE correo = ? 
       LIMIT 1`,
      [secret.base32, correo]
    );

    secureLog.security('TOTP_GENERADO', null, { correo });

    res.json({
      message: "TOTP generado correctamente ✅",
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    secureLog.error('Error en setupTOTP', error);
    res.status(500).json({ message: "Error al configurar TOTP" });
  }
};

// ===============================
// 🔹 Verificar código TOTP y activar 2FA
// ===============================
export const verifyTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    secureLog.info('Verificando código TOTP', { correo });

    if (!correo || !token) {
      return res.status(400).json({ message: "Correo y código requeridos" });
    }

    const [rows] = await pool.query(
      "SELECT id_usuario, secreto_2fa FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = rows[0];
    const secret = user.secreto_2fa;

    // Verificar el código TOTP
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2,
    });

    if (verified) {
      await pool.query(
        `UPDATE Usuarios 
         SET esta_2fa_habilitado = 1 
         WHERE correo = ? 
         LIMIT 1`,
        [correo]
      );

      secureLog.security('TOTP_ACTIVADO', user.id_usuario);

      res.json({ message: "TOTP verificado y activado correctamente ✅" });
    } else {
      secureLog.security('TOTP_CODIGO_INCORRECTO', user.id_usuario);
      res.status(401).json({ message: "Código TOTP incorrecto ❌" });
    }
  } catch (error) {
    secureLog.error('Error en verifyTOTP', error);
    res.status(500).json({ message: "Error al verificar TOTP" });
  }
};

// ===============================
// 🔹 Validar TOTP durante login
// ===============================
export const validateTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    secureLog.info('Validando TOTP durante login', { correo });

    if (!correo || !token) {
      return res.status(400).json({ message: "Correo y código requeridos" });
    }

    const [rows] = await pool.query(
      "SELECT id_usuario, secreto_2fa FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = rows[0];
    const secret = user.secreto_2fa;

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2,
    });

    if (verified) {
      secureLog.security('TOTP_VALIDACION_EXITOSA', user.id_usuario);
      res.json({ valid: true, message: "Código válido ✅" });
    } else {
      secureLog.security('TOTP_VALIDACION_FALLIDA', user.id_usuario);
      res.status(401).json({ valid: false, message: "Código incorrecto ❌" });
    }
  } catch (error) {
    secureLog.error('Error en validateTOTP', error);
    res.status(500).json({ message: "Error al validar TOTP" });
  }
};