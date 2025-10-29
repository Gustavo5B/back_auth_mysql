import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

// Generar secreto y QR code para TOTP
export const setupTOTP = async (req, res) => {
  try {
    const { correo } = req.body;

    // Generar secreto
    const secret = speakeasy.generateSecret({
      name: `LoginApp (${correo})`,
      length: 32
    });

    // Generar QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Guardar secreto temporalmente en BD (sin activar aún)
    const pool = await poolPromise;
    await pool.request()
      .input('correo', sql.VarChar, correo)
      .input('secreto', sql.VarChar, secret.base32)
      .query(`
        UPDATE Usuarios 
        SET secreto_2fa = @secreto, 
            metodo_2fa = 'TOTP',
            esta_2fa_habilitado = 0
        WHERE correo = @correo
      `);

    res.json({
      message: 'TOTP generado correctamente',
      secret: secret.base32,
      qrCode: qrCodeUrl
    });

  } catch (error) {
    console.error('Error en setupTOTP:', error);
    res.status(500).json({ message: 'Error al configurar TOTP' });
  }
};

// Verificar código TOTP y activar 2FA
export const verifyTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT secreto_2fa FROM Usuarios WHERE correo = @correo');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const secret = result.recordset[0].secreto_2fa;

    // Verificar el token TOTP
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Permite 2 intervalos de tiempo (60 segundos)
    });

    if (verified) {
      // Activar 2FA
      await pool.request()
        .input('correo', sql.VarChar, correo)
        .query(`
          UPDATE Usuarios 
          SET esta_2fa_habilitado = 1 
          WHERE correo = @correo
        `);

      res.json({ message: 'TOTP verificado y activado correctamente ✅' });
    } else {
      res.status(401).json({ message: 'Código TOTP incorrecto' });
    }

  } catch (error) {
    console.error('Error en verifyTOTP:', error);
    res.status(500).json({ message: 'Error al verificar TOTP' });
  }
};

// Validar TOTP durante el login
export const validateTOTP = async (req, res) => {
  try {
    const { correo, token } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT secreto_2fa FROM Usuarios WHERE correo = @correo');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const secret = result.recordset[0].secreto_2fa;

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (verified) {
      res.json({ valid: true, message: 'Código válido ✅' });
    } else {
      res.status(401).json({ valid: false, message: 'Código incorrecto' });
    }

  } catch (error) {
    console.error('Error en validateTOTP:', error);
    res.status(500).json({ message: 'Error al validar TOTP' });
  }
};