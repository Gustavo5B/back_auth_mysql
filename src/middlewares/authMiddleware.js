import jwt from 'jsonwebtoken';
import { isSessionValid } from '../services/sessionService.js';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================
// 🔒 LOGGER SEGURO - NO REGISTRA TOKENS NI DATOS SENSIBLES
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.token;
    delete sanitized.codigo;
    delete sanitized.password;
    delete sanitized.contrasena;
    
    console.log(`ℹ️ ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  
  error: (message, error) => {
    console.error(`❌ ${message}`, {
      name: error.name,
      code: error.code
      // ❌ NO incluir: error.message (puede contener tokens), error.stack
    });
  },
  
  security: (action, userId, metadata = {}) => {
    console.log(`🔐 SECURITY [${action}] User:${userId || 'unknown'}`, {
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }
};

// =========================================================
// 🔐 MIDDLEWARE: Verificar Token JWT + Sesión Activa
// =========================================================
export const authenticateToken = async (req, res, next) => {
  try {
    // 1️⃣ Obtener token del header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      secureLog.security('AUTH_NO_TOKEN', null);
      return res.status(401).json({ 
        message: "Token no proporcionado",
        code: "NO_TOKEN"
      });
    }

    // 2️⃣ Verificar que el token sea válido (JWT)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],      // ✅ CRÍTICO: Solo permitir HS256
        issuer: 'nub-studio',       // ✅ Validar emisor
        audience: 'nub-users'        // ✅ Validar audiencia
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        secureLog.security('TOKEN_EXPIRED', null);
        return res.status(401).json({ 
          message: "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
          code: "TOKEN_EXPIRED",
          expired: true
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        secureLog.security('INVALID_TOKEN', null);
        return res.status(401).json({ 
          message: "Token inválido o manipulado",
          code: "INVALID_TOKEN"
        });
      }

      // Detectar algoritmo no permitido
      if (error.message && error.message.includes('algorithm')) {
        secureLog.security('INVALID_ALGORITHM_ATTEMPT', null);
        return res.status(401).json({ 
          message: "Algoritmo de firma no permitido",
          code: "INVALID_ALGORITHM"
        });
      }
      
      secureLog.error('Token verification error', error);
      return res.status(401).json({ 
        message: "Error al verificar token",
        code: "VERIFICATION_ERROR"
      });
    }

    // 3️⃣ Verificar que la sesión esté activa en la BD (whitelist)
    const sessionExists = await isSessionValid(token);
    
    if (!sessionExists) {
      secureLog.security('SESSION_REVOKED', decoded.sub);
      return res.status(401).json({ 
        message: "Tu sesión ya no es válida. Por favor inicia sesión nuevamente.",
        code: "SESSION_REVOKED"
      });
    }

    // 4️⃣ Todo OK, agregar info del usuario al request
    // ✅ IMPORTANTE: Usar 'sub' como ID de usuario (estándar JWT)
    req.user = {
      id_usuario: parseInt(decoded.sub), // El ID viene en 'sub'
      jti: decoded.jti                    // JWT ID único
    };
    
    req.token = token;

    // ✅ Logs seguros en cada evento:
secureLog.security('AUTH_NO_TOKEN', null);
secureLog.security('TOKEN_EXPIRED', null);
secureLog.security('INVALID_TOKEN', null);
secureLog.security('SESSION_REVOKED', decoded.sub);
secureLog.security('AUTH_SUCCESS', decoded.sub);

    next();

  } catch (error) {
    secureLog.error('Middleware authentication error', error);
    return res.status(500).json({ 
      message: "Error al verificar autenticación",
      code: "AUTH_ERROR"
    });
  }
};