import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode } from "../services/emailService.js";

dotenv.config();

// 🔒 Rate limiting simple en memoria
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 3;

const checkRateLimit = (correo) => {
  const now = Date.now();
  const userAttempts = rateLimitStore.get(correo) || [];
  
  const recentAttempts = userAttempts.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return { allowed: false, remainingTime: RATE_LIMIT_WINDOW - (now - recentAttempts[0]) };
  }
  
  recentAttempts.push(now);
  rateLimitStore.set(correo, recentAttempts);
  return { allowed: true };
};

// Solicitar código de recuperación
export const requestRecoveryCode = async (req, res) => {
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({ message: "El correo es obligatorio" });
    }

    // 🔒 Rate limiting
    const rateCheck = checkRateLimit(correo);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil(rateCheck.remainingTime / 60000);
      return res.status(429).json({ 
        message: `Demasiados intentos. Intenta de nuevo en ${minutes} minutos` 
      });
    }

    // Verificar que el usuario existe
    const [users] = await pool.query(
      'SELECT * FROM Usuarios WHERE correo = ?',
      [correo]
    );

    // SIEMPRE responder con éxito (timing-attack prevention)
    if (users.length > 0) {
      // ✅ Minúsculas: codigosrecuperacion
      await pool.query(
        'UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ? AND usado = FALSE',
        [correo]
      );

      const codigo = generateCode();
      const fechaExpiracion = new Date();
      fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15);

      // ✅ Minúsculas: codigosrecuperacion
      await pool.query(
        'INSERT INTO codigosrecuperacion (correo, codigo, fecha_expiracion) VALUES (?, ?, ?)',
        [correo, codigo, fechaExpiracion]
      );

      try {
        await sendRecoveryCode(correo, codigo);
        console.log(`✅ Código enviado a ${correo}: ${codigo}`);
      } catch (emailError) {
        console.error('❌ Error al enviar email:', emailError);
      }
    }

    res.json({ 
      message: "Si el correo existe, recibirás un código de recuperación",
      correo: correo
    });

  } catch (error) {
    console.error("❌ Error en requestRecoveryCode:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Validar código de recuperación
export const validateRecoveryCode = async (req, res) => {
  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    // ✅ Minúsculas: codigosrecuperacion
    const [codes] = await pool.query(
      `SELECT * FROM codigosrecuperacion 
       WHERE correo = ? 
         AND codigo = ? 
         AND usado = FALSE 
         AND fecha_expiracion > NOW()
       ORDER BY fecha_creacion DESC
       LIMIT 1`,
      [correo, codigo]
    );

    if (codes.length === 0) {
      return res.status(401).json({ 
        valid: false, 
        message: "Código inválido o expirado" 
      });
    }

    res.json({ 
      valid: true, 
      message: "Código válido" 
    });

  } catch (error) {
    console.error("❌ Error en validateRecoveryCode:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Restablecer contraseña
export const resetPassword = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { correo, codigo, nuevaContrasena } = req.body;

    if (!correo || !codigo || !nuevaContrasena) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (nuevaContrasena.length < 8) {
      return res.status(400).json({ 
        message: "La contraseña debe tener al menos 8 caracteres" 
      });
    }

    // 🔒 Validación adicional
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(nuevaContrasena)) {
      return res.status(400).json({ 
        message: "La contraseña debe contener mayúsculas, minúsculas y números" 
      });
    }

    // ✅ Minúsculas: codigosrecuperacion
    const [codes] = await connection.query(
      `SELECT * FROM codigosrecuperacion
       WHERE correo = ? 
         AND codigo = ? 
         AND usado = FALSE 
         AND fecha_expiracion > NOW()
       ORDER BY fecha_creacion DESC
       LIMIT 1`,
      [correo, codigo]
    );

    if (codes.length === 0) {
      await connection.rollback();
      return res.status(401).json({ message: "Código inválido o expirado" });
    }

    const [users] = await connection.query(
      'SELECT id_usuario FROM Usuarios WHERE correo = ?',
      [correo]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await connection.query(
      'UPDATE Usuarios SET contrasena = ? WHERE correo = ?',
      [hashedPassword, correo]
    );

    // ✅ Minúsculas: codigosrecuperacion
    await connection.query(
      'UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ?',
      [correo]
    );

    await connection.commit();
    
    console.log(`✅ Contraseña actualizada para ${correo}`);
    rateLimitStore.delete(correo);
    
    res.json({ 
      message: "Contraseña actualizada exitosamente" 
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en resetPassword:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    connection.release();
  }
};

// 🧹 Función de limpieza periódica
export const cleanupExpiredCodes = async () => {
  try {
    // ✅ Minúsculas: codigosrecuperacion
    const [result] = await pool.query(
      'DELETE FROM codigosrecuperacion WHERE fecha_expiracion < NOW() OR usado = TRUE'
    );
    console.log(`🧹 Códigos eliminados: ${result.affectedRows}`);
  } catch (error) {
    console.error('Error al limpiar códigos:', error);
  }
};