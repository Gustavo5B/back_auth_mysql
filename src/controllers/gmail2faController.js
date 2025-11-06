import { pool } from "../config/db.js";
import { generateCode, sendGmail2FACode } from "../services/emailService.js";


/**
 * 1️⃣ Configura Gmail-2FA (solo se usa una vez)
 */
export const configurarGmail2FA = async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ message: "Correo requerido" });

    const code = generateCode();
    await pool.query(
      `UPDATE Usuarios
       SET ultimo_codigo_gmail = ?, expiracion_codigo_gmail = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE correo = ?`,
      [code, correo]
    );

    await sendGmail2FACode(correo, code);
    res.json({ success: true, message: "Código de verificación enviado a tu correo." });
  } catch (error) {
    console.error("Error en configurarGmail2FA:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
};

/**
 * 2️⃣ Verifica el código recibido y activa Gmail-2FA
 */
export const verificarGmail2FA = async (req, res) => {
  try {
    const { correo, codigo } = req.body;
    if (!correo || !codigo)
      return res.status(400).json({ message: "Correo y código requeridos" });

    const [rows] = await pool.query(
      `SELECT * FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length)
      return res.status(401).json({ message: "Código inválido o expirado" });

    await pool.query(
      `UPDATE Usuarios
       SET metodo_gmail_2fa = 1, ultimo_codigo_gmail = NULL, expiracion_codigo_gmail = NULL
       WHERE correo = ?`,
      [correo]
    );

    res.json({ success: true, message: "Gmail-2FA activado correctamente ✅" });
  } catch (error) {
    console.error("Error en verificarGmail2FA:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
};

/**
 * 3️⃣ Enviar código al iniciar sesión
 */
export const enviarCodigoLoginGmail = async (req, res) => {
  try {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ message: "Correo requerido" });

    const code = generateCode();
    await pool.query(
      `UPDATE Usuarios
       SET ultimo_codigo_gmail = ?, expiracion_codigo_gmail = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE correo = ?`,
      [code, correo]
    );

    await sendGmail2FACode(correo, code);
    res.json({ success: true, message: "Código de acceso enviado a tu correo." });
  } catch (error) {
    console.error("Error en enviarCodigoLoginGmail:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
};

/**
 * 4️⃣ Verificar código durante login
 */
export const verificarCodigoLoginGmail = async (req, res) => {
  try {
    const { correo, codigo } = req.body;
    const [rows] = await pool.query(
      `SELECT * FROM Usuarios
       WHERE correo = ? AND ultimo_codigo_gmail = ? AND expiracion_codigo_gmail > NOW()`,
      [correo, codigo]
    );

    if (!rows.length)
      return res.status(401).json({ message: "Código inválido o expirado" });

    // ✅ Generar token JWT
    const jwt = (await import("jsonwebtoken")).default;
    const user = rows[0];
    const token = jwt.sign(
      { id_usuario: user.id_usuario, correo: user.correo },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Inicio de sesión exitoso ✅",
      token,
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
      },
    });
  } catch (error) {
    console.error("Error en verificarCodigoLoginGmail:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};
