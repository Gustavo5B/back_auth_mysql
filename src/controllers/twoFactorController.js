import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { poolPromise } from "../config/db.js";

// ===============================
// 🔹 Generar secreto y QR para TOTP
// ===============================
export const setupTOTP = async (req, res) => {
  try {
    const { correo } = req.body;

    // Generar secreto TOTP
    const secret = speakeasy.generateSecret({
      name: `LoginApp (${correo})`,
      length: 32,
    });

    // Generar QR Code (imagen base64)
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Guardar el secreto temporalmente en BD
    const pool = await poolPromise;
    await pool.query(
      `UPDATE Usuarios 
       SET secreto_2fa = ?, metodo_2fa = 'TOTP', esta_2fa_habilitado = 0 
       WHERE correo = ?`,
      [secret.base32, correo]
    );

    res.json({
      message: "TOTP generado correctamente ✅",
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    console.error("❌ Error en setupTOTP:", error);
    res.status(500).json({ message: "Error al configurar TOTP" });
  }
};

// ===============================
// 🔹 Verificar código TOTP y activar 2FA
// ===============================
export const verifyTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    const pool = await poolPromise;
    const [rows] = await pool.query(
      "SELECT secreto_2fa FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const secret = rows[0].secreto_2fa;

    // Verificar el código TOTP
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2, // margen de 60s
    });

    if (verified) {
      await pool.query(
        `UPDATE Usuarios 
         SET esta_2fa_habilitado = 1 
         WHERE correo = ?`,
        [correo]
      );

      res.json({ message: "TOTP verificado y activado correctamente ✅" });
    } else {
      res.status(401).json({ message: "Código TOTP incorrecto ❌" });
    }
  } catch (error) {
    console.error("❌ Error en verifyTOTP:", error);
    res.status(500).json({ message: "Error al verificar TOTP" });
  }
};

// ===============================
// 🔹 Validar TOTP durante login
// ===============================
export const validateTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    const pool = await poolPromise;
    const [rows] = await pool.query(
      "SELECT secreto_2fa FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const secret = rows[0].secreto_2fa;

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2,
    });

    if (verified) {
      res.json({ valid: true, message: "Código válido ✅" });
    } else {
      res.status(401).json({ valid: false, message: "Código incorrecto ❌" });
    }
  } catch (error) {
    console.error("❌ Error en validateTOTP:", error);
    res.status(500).json({ message: "Error al validar TOTP" });
  }
};
