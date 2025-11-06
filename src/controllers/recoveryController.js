import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode } from "../services/emailService.js";

dotenv.config();

// 🔒 Rate limiting simple en memoria
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
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

// ✅ HELPER: Reintentar operaciones con la BD
const retryOperation = async (operation, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`⚠️ Intento ${i + 1}/${retries} falló:`, error.code || error.message);
      
      if (i === retries - 1) throw error;
      
      // Esperar antes de reintentar (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Solicitar código de recuperación
export const requestRecoveryCode = async (req, res) => {
  let connection;
  
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({ message: "El correo es obligatorio" });
    }

    // Rate limiting
    const rateCheck = checkRateLimit(correo);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil(rateCheck.remainingTime / 60000);
      return res.status(429).json({ 
        message: `Demasiados intentos. Intenta de nuevo en ${minutes} minutos` 
      });
    }

    // ✅ OBTENER CONEXIÓN CON REINTENTOS
    connection = await retryOperation(() => pool.getConnection());

    // Verificar usuario con reintentos
    const [users] = await retryOperation(() => 
      connection.query('SELECT * FROM Usuarios WHERE correo = ?', [correo])
    );

    if (users.length > 0) {
      // Invalidar códigos anteriores con reintentos
      await retryOperation(() => 
        connection.query(
          'UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ? AND usado = FALSE',
          [correo]
        )
      );

      const codigo = generateCode();
      const fechaExpiracion = new Date();
      fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15);

      // Insertar código con reintentos
     // await retryOperation(() =>
       // connection.query(
         // 'INSERT INTO codigosrecuperacion (correo, codigo, fecha_expiracion) VALUES (?, ?, ?)',
          //[correo, codigo, fechaExpiracion]
        //)
      //);
      await retryOperation(() =>
  connection.query(
    `INSERT INTO codigosrecuperacion (correo, codigo, fecha_expiracion)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
    [correo, codigo]
  )
);


      // Enviar email
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
    
    if (error.code === 'ECONNRESET') {
      res.status(503).json({ 
        message: "Servicio temporalmente no disponible. Por favor, intenta de nuevo." 
      });
    } else {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  } finally {
    if (connection) connection.release();
  }
};

// Validar código de recuperación
export const validateRecoveryCode = async (req, res) => {
  let connection;
  
  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    connection = await retryOperation(() => pool.getConnection());

    const [codes] = await retryOperation(() =>
      connection.query(
        `SELECT * FROM codigosrecuperacion 
         WHERE correo = ? AND codigo = ? AND usado = FALSE AND fecha_expiracion > NOW()
         ORDER BY fecha_creacion DESC LIMIT 1`,
        [correo, codigo]
      )
    );

    if (codes.length === 0) {
      return res.status(401).json({ 
        valid: false, 
        message: "Código inválido o expirado" 
      });
    }

    res.json({ valid: true, message: "Código válido" });

  } catch (error) {
    console.error("❌ Error en validateRecoveryCode:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
};

// Restablecer contraseña
export const resetPassword = async (req, res) => {
  let connection;
  
  try {
    const { correo, codigo, nuevaContrasena } = req.body;

    if (!correo || !codigo || !nuevaContrasena) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (nuevaContrasena.length < 8) {
      return res.status(400).json({ 
        message: "La contraseña debe tener al menos 8 caracteres" 
      });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(nuevaContrasena)) {
      return res.status(400).json({ 
        message: "La contraseña debe contener mayúsculas, minúsculas y números" 
      });
    }

    connection = await retryOperation(() => pool.getConnection());
    await connection.beginTransaction();

    const [codes] = await retryOperation(() =>
      connection.query(
        `SELECT * FROM codigosrecuperacion
         WHERE correo = ? AND codigo = ? AND usado = FALSE AND fecha_expiracion > NOW()
         ORDER BY fecha_creacion DESC LIMIT 1`,
        [correo, codigo]
      )
    );

    if (codes.length === 0) {
      await connection.rollback();
      return res.status(401).json({ message: "Código inválido o expirado" });
    }

    const [users] = await retryOperation(() =>
      connection.query('SELECT id_usuario FROM Usuarios WHERE correo = ?', [correo])
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await retryOperation(() =>
      connection.query('UPDATE Usuarios SET contrasena = ? WHERE correo = ?', [hashedPassword, correo])
    );

    await retryOperation(() =>
      connection.query('UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ?', [correo])
    );

    await connection.commit();
    
    console.log(`✅ Contraseña actualizada para ${correo}`);
    rateLimitStore.delete(correo);
    
    res.json({ message: "Contraseña actualizada exitosamente" });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error en resetPassword:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
};

// Limpieza periódica
export const cleanupExpiredCodes = async () => {
  try {
    const [result] = await retryOperation(() =>
      pool.query('DELETE FROM codigosrecuperacion WHERE fecha_expiracion < NOW() OR usado = TRUE')
    );
    console.log(`🧹 Códigos eliminados: ${result.affectedRows}`);
  } catch (error) {
    console.error('Error al limpiar códigos:', error);
  }
};