import sql from "mssql";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { poolPromise } from "../config/db.js";

dotenv.config();

export const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena)
      return res.status(400).json({ message: "Correo y contraseña son obligatorios." });

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("correo", sql.VarChar, correo)
      .query("SELECT * FROM Usuarios WHERE correo = @correo");

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado." });

    const user = result.recordset[0];

    // Verificar contraseña
    const match = await bcrypt.compare(contrasena, user.contrasena);
    if (!match)
      return res.status(401).json({ message: "Contraseña incorrecta." });

    // Verificar estado
    if (user.estado !== "Activo")
      return res.status(403).json({ message: "Cuenta inactiva o suspendida." });

    // ⭐ Verificar si tiene 2FA habilitado
    if (user.esta_2fa_habilitado) {
      return res.json({
        message: "Credenciales correctas",
        requires2FA: true,
        metodo_2fa: user.metodo_2fa || 'TOTP',
        correo: user.correo  // ⭐ IMPORTANTE: Enviar el correo
      });
    }

    // Si no tiene 2FA, generar token directamente
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
    console.error("Error en login:", error);
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

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("correo", sql.VarChar, correo)
      .query("SELECT * FROM Usuarios WHERE correo = @correo");

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado." });

    const user = result.recordset[0];

    // Generar token después de validar 2FA
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