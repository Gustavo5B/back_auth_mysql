import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js"; // ✅ Usar pool directamente

dotenv.config();

export const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    console.log('📥 Login attempt:', { correo, hasPassword: !!contrasena }); // ✅

    if (!correo || !contrasena) {
      return res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    }

    console.log('🔍 Buscando usuario en BD...'); // ✅
    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    console.log('📊 Resultados:', rows.length, 'usuario(s) encontrado(s)'); // ✅

    if (rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado." });

    const user = rows[0];
    console.log('👤 Usuario encontrado:', user.correo, '| 2FA habilitado:', user.esta_2fa_habilitado); // ✅

    // ✅ Verificar contraseña
    console.log('🔐 Verificando contraseña...'); // ✅
    const match = await bcrypt.compare(contrasena, user.contrasena);
    console.log('🔐 Match:', match); // ✅
    
    if (!match)
      return res.status(401).json({ message: "Contraseña incorrecta." });

    // ✅ Verificar estado
    if (user.estado !== "Activo")
      return res.status(403).json({ message: "Cuenta inactiva o suspendida." });

    // ✅ Verificar si tiene 2FA habilitado
    if (user.esta_2fa_habilitado) {
      console.log('✅ Requiere 2FA'); // ✅
      return res.json({
        message: "Credenciales correctas",
        requires2FA: true,
        metodo_2fa: user.metodo_2fa || "TOTP",
        correo: user.correo
      });
    }

    console.log('✅ Generando token JWT...'); // ✅
    const token = jwt.sign(
      { id_usuario: user.id_usuario, correo: user.correo },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log('✅ Login exitoso para:', user.correo); // ✅
    res.json({
      message: "Inicio de sesión exitoso ✅",
      token,
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    console.error("❌ Error en login:", error.message); // ✅
    console.error("❌ Stack:", error.stack); // ✅
    res.status(500).json({ message: "Error interno del servidor." });
  }
};
// ⭐ Login con código 2FA - AHORA CON VALIDACIÓN REAL
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

    // ✅ VALIDAR EL CÓDIGO TOTP REAL
    const speakeasy = (await import("speakeasy")).default;
    
    const verified = speakeasy.totp.verify({
      secret: user.secreto_2fa,
      encoding: "base32",
      token: codigo2fa,
      window: 2 // permite 60 segundos de margen
    });

    if (!verified) {
      return res.status(401).json({ message: "Código 2FA incorrecto ❌" });
    }

    // ✅ Generar token después de validar 2FA
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
        estado: user.estado
      }
    });
  } catch (error) {
    console.error("Error en loginWith2FA:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
  
};