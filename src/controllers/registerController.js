import bcrypt from 'bcrypt';
import sql from 'mssql'; // ⚠️ FALTABA ESTE IMPORT
import { poolPromise } from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

export const register = async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  try {
    const pool = await poolPromise;
    
    // Verificar si el correo ya está registrado
    const check = await pool.request()
      .input("correo", sql.VarChar, correo)
      .query("SELECT * FROM Usuarios WHERE correo = @correo");

    if (check.recordset.length > 0)
      return res.status(400).json({ message: "El correo ya está registrado." });

    // Encriptar contraseña
    const hash = await bcrypt.hash(contrasena, 10);

    // Insertar usuario
    await pool.request()
      .input("nombre", sql.VarChar, nombre)
      .input("correo", sql.VarChar, correo)
      .input("contrasena", sql.VarChar, hash)
      .input("estado", sql.VarChar, "Activo")
      .query(`
        INSERT INTO Usuarios (nombre, correo, contrasena, estado)
        VALUES (@nombre, @correo, @contrasena, @estado)
      `);

    res.json({ message: "Usuario registrado exitosamente" });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: "Error al registrar usuario." });
  }
};