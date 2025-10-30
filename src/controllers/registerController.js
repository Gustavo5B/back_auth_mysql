import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { poolPromise } from "../config/db.js";

dotenv.config();

export const register = async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  try {
    const pool = await poolPromise;

    // 🔹 Verificar si el correo ya existe
    const [existingUser] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: "El correo ya está registrado." });
    }

    // 🔹 Encriptar contraseña
    const hash = await bcrypt.hash(contrasena, 10);

    // 🔹 Insertar nuevo usuario
    await pool.query(
      "INSERT INTO Usuarios (nombre, correo, contrasena, estado) VALUES (?, ?, ?, ?)",
      [nombre, correo, hash, "Activo"]
    );

    res.json({ message: "Usuario registrado exitosamente ✅" });
  } catch (error) {
    console.error("❌ Error en registro:", error);
    res.status(500).json({ message: "Error al registrar usuario." });
  }
};
