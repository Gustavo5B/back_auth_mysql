import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode } from "../services/emailService.js";

dotenv.config();

// =========================================================
// 🔑 FUNCIÓN PARA GENERAR TOKEN (Centralizada)
// =========================================================
const generateToken = (user) => {
  return jwt.sign(
    {
      sub: user.correo,              // ← ESTÁNDAR JWT (subject)
      correo: user.correo,            // ← Tu campo personalizado
      email: user.correo,             // ← Compatibilidad
      id_usuario: user.id_usuario,
      metodo_gmail_2fa: user.metodo_gmail_2fa || false
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
};

export const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    console.log('📥 Login attempt:', { correo, hasPassword: !!contrasena });

    if (!correo || !contrasena) {
      return res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    }

    console.log('🔍 Buscando usuario en BD...');
    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    console.log('📊 Resultados:', rows.length, 'usuario(s) encontrado(s)');

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado." });

    const user = rows[0];
    console.log('👤 Usuario encontrado:', user.correo, '| 2FA habilitado:', user.esta_2fa_habilitado);

    console.log('🔐 Verificando contraseña...');
    const match = await bcrypt.compare(contrasena, user.contrasena);
    console.log('🔐 Match:', match);
    
    if (!match)
      return res.status(401).json({ message: "Contraseña incorrecta." });

    if (user.estado !== "Activo")
      return res.status(403).json({ message: "Cuenta inactiva o suspendida." });

    // ✅ Verificar si tiene Gmail-2FA activo
    if (user.metodo_gmail_2fa) {
      console.log('✅ Requiere Gmail-2FA');
      const code = generateCode();
      await pool.query(
        'UPDATE Usuarios SET ultimo_codigo_gmail=?, expiracion_codigo_gmail=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id_usuario=?',
        [code, user.id_usuario]
      );
      await sendRecoveryCode(user.correo, code);
      return res.json({
        message: "Se envió un código de acceso a tu correo 📧",
        requires2FA: true,
        metodo_2fa: "GMAIL",
        correo: user.correo,
      });
    }

    // ✅ Verificar si tiene 2FA habilitado
    if (user.esta_2fa_habilitado) {
      console.log('✅ Requiere 2FA');
      return res.json({
        message: "Credenciales correctas",
        requires2FA: true,
        metodo_2fa: user.metodo_2fa || "TOTP",
        correo: user.correo
      });
    }

    console.log('✅ Generando token JWT...');
    const token = generateToken(user); // ← USAR FUNCIÓN CENTRALIZADA

    console.log('✅ Login exitoso para:', user.correo);
    res.json({
      message: "Inicio de sesión exitoso ✅",
      access_token: token, // ← Cambiar "token" a "access_token"
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error("❌ Error en login:", error.message);
    console.error("❌ Stack:", error.stack);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// ⭐ Login con código 2FA
export const loginWith2FA = async (req, res) => {
  try {
    const { correo, codigo2fa } = req.body;

    if (!correo || !codigo2fa) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado." });

    const user = rows[0];

    const speakeasy = (await import("speakeasy")).default;
    
    const verified = speakeasy.totp.verify({
      secret: user.secreto_2fa,
      encoding: "base32",
      token: codigo2fa,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ message: "Código 2FA incorrecto ❌" });
    }

    const token = generateToken(user); // ← USAR FUNCIÓN CENTRALIZADA

    res.json({
      message: "Inicio de sesión exitoso ✅",
      access_token: token, // ← Cambiar "token" a "access_token"
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error("Error en loginWith2FA:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// ===========================================================
// ✅ Verificación de código Gmail (Email 2FA)
// ===========================================================
export const verifyLoginCode = async (req, res) => {
  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo)
      return res.status(400).json({ message: "Correo y código son obligatorios" });

    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ? AND metodo_gmail_2fa = 1",
      [correo]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado o sin Gmail 2FA" });

    const user = rows[0];

    if (
      !user.ultimo_codigo_gmail ||
      user.ultimo_codigo_gmail !== codigo ||
      new Date(user.expiracion_codigo_gmail) < new Date()
    ) {
      return res.status(401).json({ message: "Código inválido o expirado ❌" });
    }

    await pool.query(
      "UPDATE Usuarios SET ultimo_codigo_gmail=NULL, expiracion_codigo_gmail=NULL WHERE id_usuario=?",
      [user.id_usuario]
    );

    const token = generateToken(user); // ← USAR FUNCIÓN CENTRALIZADA

    res.json({
      message: "✅ Verificación exitosa. Sesión iniciada.",
      access_token: token, // ← Cambiar "token" a "access_token"
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error("❌ Error en verifyLoginCode:", error.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};