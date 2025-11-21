import jwt from 'jsonwebtoken';
import { isSessionValid } from '../services/sessionService.js';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================
// 🔐 MIDDLEWARE: Verificar Token JWT + Sesión Activa
// =========================================================
export const authenticateToken = async (req, res, next) => {
  try {
    // 1️⃣ Obtener token del header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ 
        message: "Token no proporcionado",
        code: "NO_TOKEN"
      });
    }

    // 2️⃣ Verificar que el token sea válido (JWT)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          message: "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
          code: "TOKEN_EXPIRED"
        });
      }
      
      return res.status(401).json({ 
        message: "Token inválido",
        code: "INVALID_TOKEN"
      });
    }

    // 3️⃣ Verificar que la sesión esté activa en la BD (whitelist)
    const sessionExists = await isSessionValid(token);
    
    if (!sessionExists) {
      return res.status(401).json({ 
        message: "Tu sesión ya no es válida. Por favor inicia sesión nuevamente.",
        code: "SESSION_REVOKED"
      });
    }

    // 4️⃣ Todo OK, agregar info del usuario al request
    req.user = {
      id_usuario: decoded.id_usuario,
      correo: decoded.correo,
      email: decoded.email
    };
    
    req.token = token; // Por si lo necesitas después

    next(); // Continuar a la siguiente función

  } catch (error) {
    console.error('❌ Error en authenticateToken:', error.message);
    return res.status(500).json({ 
      message: "Error al verificar autenticación",
      code: "AUTH_ERROR"
    });
  }
};