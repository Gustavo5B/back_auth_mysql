import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode, sendWelcomeEmail } from "../services/emailService.js";
import { saveActiveSession, revokeOtherSessions } from '../services/sessionService.js';
import crypto from 'crypto';

dotenv.config();
// =========================================================
// 🔒 ENMASCARAR EMAIL (para logs y mensajes al usuario)
// =========================================================
const maskEmail = (email) => {
  if (!email) return 'correo oculto';
  
  const [localPart, domain] = email.split('@');
  
  if (!domain) return '***@***';
  
  // Enmascarar parte local (antes del @)
  const maskedLocal = localPart.length > 4
    ? localPart.substring(0, 2) + '***' + localPart.substring(localPart.length - 3)
    : '***';
  
  // Enmascarar dominio
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length > 1
    ? domainParts[0].substring(0, 1) + '***.' + domainParts.slice(1).join('.')
    : '***';
  
  return `${maskedLocal}@${maskedDomain}`;
};

// =========================================================
// 🔒 LOGGER SEGURO - NO REGISTRA DATOS SENSIBLES
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    const sanitized = { ...metadata };
    delete sanitized.contrasena;
    delete sanitized.password;
    delete sanitized.codigo;
    delete sanitized.token;
    delete sanitized.secret;
    
    console.log(`ℹ️ ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  
  error: (message, error) => {
    console.error(`❌ ${message}`, {
      name: error.name,
      code: error.code
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
// 🔑 FUNCIÓN PARA GENERAR TOKEN - MINIMIZADA Y SEGURA
// =========================================================
const generateToken = (user) => {
  return jwt.sign(
    {
      sub: user.id_usuario.toString(),
      jti: crypto.randomUUID()
    },
    process.env.JWT_SECRET,
    { 
      algorithm: 'HS256',
      expiresIn: "24h",
      issuer: 'nub-studio',
      audience: 'nub-users'
    }
  );
};

// =========================================================
// 🔒 HELPER: Calcular tiempo de bloqueo progresivo
// =========================================================
const calcularTiempoBloqueo = (bloqueosTotales) => {
  if (bloqueosTotales === 0) return 15;
  if (bloqueosTotales === 1) return 30;
  return 60;
};

// =========================================================
// 📊 HELPER: Registrar en historial (SIN DATOS SENSIBLES)
// =========================================================
const registrarHistorialLogin = async (usuario, tipo, razon = null) => {
  try {
    await pool.query(
      `INSERT INTO Historial_Login (id_usuario, correo, tipo, razon_fallo) 
       VALUES (?, ?, ?, ?)`,
      [usuario?.id_usuario || null, usuario?.correo || 'desconocido', tipo, razon]
    );
  } catch (error) {
    secureLog.error('Error al registrar historial', error);
  }
};

// =========================================================
// 📝 REGISTRO DE USUARIO CON EMAIL DE BIENVENIDA
// =========================================================
export const register = async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  try {
    secureLog.info('Intento de registro', { email: maskEmail(correo) });

    // Validaciones básicas
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ 
        message: "Todos los campos son obligatorios" 
      });
    }

    if (contrasena.length < 8) {
      return res.status(400).json({ 
        message: "La contraseña debe tener al menos 8 caracteres" 
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ 
        message: "El formato del correo no es válido" 
      });
    }

    // Verificar si el correo ya existe
    const [existingUser] = await pool.query(
      "SELECT id_usuario FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (existingUser.length > 0) {
      secureLog.security('REGISTRO_DUPLICADO', null, { email: maskEmail(correo) });
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    // Encriptar contraseña con salt automático
    const saltRounds = 12;
    const hash = await bcrypt.hash(contrasena, saltRounds);

    // Insertar nuevo usuario
    const [result] = await pool.query(
      "INSERT INTO Usuarios (nombre, correo, contrasena, estado) VALUES (?, ?, ?, ?)",
      [nombre, correo, hash, "Activo"]
    );

    secureLog.security('REGISTRO_EXITOSO', result.insertId, { correo });

    // ENVIAR EMAIL DE BIENVENIDA DE FORMA ASÍNCRONA
    sendWelcomeEmail(correo, nombre)
      .then(() => {
        secureLog.info('Email de bienvenida enviado', { userId: result.insertId });
      })
      .catch((emailError) => {
        secureLog.error('Error enviando email de bienvenida', emailError);
      });

    res.status(201).json({ 
      message: "Usuario registrado exitosamente ✅",
      user: {
        id: result.insertId,
        nombre,
        correo
      }
    });

  } catch (error) {
    secureLog.error('Error en registro', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    res.status(500).json({ 
      message: "Error al registrar usuario."
    });
  }
};

// =========================================================
// 🔐 LOGIN CON BLOQUEO Y LOGGING SEGURO
// =========================================================
export const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    secureLog.info('Intento de login', { email: maskEmail(correo) });

    // 1️⃣ VALIDACIONES BÁSICAS
    if (!correo || !contrasena) {
      return res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    }

    // 2️⃣ BUSCAR USUARIO
    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (rows.length === 0) {
      secureLog.security('LOGIN_USUARIO_NO_ENCONTRADO', null, { email: maskEmail(correo) });
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = rows[0];
    secureLog.info('Usuario encontrado', { userId: user.id_usuario });

    // 3️⃣ VERIFICAR SI ESTÁ BLOQUEADO
    if (user.bloqueado_hasta) {
      const ahora = new Date();
      const desbloqueo = new Date(user.bloqueado_hasta);

      if (ahora < desbloqueo) {
        const minutosRestantes = Math.ceil((desbloqueo - ahora) / 60000);
        const horaDesbloqueo = desbloqueo.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });

        secureLog.security('LOGIN_BLOQUEADO', user.id_usuario);
        await registrarHistorialLogin(user, 'bloqueado', 'Intento durante bloqueo');

        return res.status(403).json({
          blocked: true,
          message: `🔒 Cuenta bloqueada por seguridad. Intenta de nuevo en ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''}.`,
          minutesRemaining: minutosRestantes,
          unlockTime: horaDesbloqueo
        });
      } else {
        secureLog.security('DESBLOQUEO_AUTOMATICO', user.id_usuario);
        await pool.query(
          `UPDATE Usuarios 
           SET bloqueado_hasta = NULL, 
               intentos_login_fallidos = 0 
           WHERE id_usuario = ?`,
          [user.id_usuario]
        );
        user.bloqueado_hasta = null;
        user.intentos_login_fallidos = 0;
      }
    }

    // 4️⃣ VALIDAR CONTRASEÑA
    const match = await bcrypt.compare(contrasena, user.contrasena);

    if (!match) {
      const nuevoIntentos = user.intentos_login_fallidos + 1;
      
      secureLog.security('LOGIN_CONTRASEÑA_INCORRECTA', user.id_usuario, {
        intento: nuevoIntentos
      });

      if (nuevoIntentos >= 3) {
        const tiempoBloqueo = calcularTiempoBloqueo(user.bloqueos_totales);

        await pool.query(
          `UPDATE Usuarios 
           SET intentos_login_fallidos = ?,
               bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE),
               bloqueos_totales = bloqueos_totales + 1,
               ultimo_intento_fallido = NOW()
           WHERE id_usuario = ?`,
          [nuevoIntentos, tiempoBloqueo, user.id_usuario]
        );

        await registrarHistorialLogin(user, 'bloqueado', `Bloqueado por ${tiempoBloqueo} minutos`);

        secureLog.security('CUENTA_BLOQUEADA', user.id_usuario, {
          tiempoBloqueo,
          bloqueosTotales: user.bloqueos_totales + 1
        });

        return res.status(403).json({
          blocked: true,
          message: `🔒 Cuenta bloqueada por ${tiempoBloqueo} minutos debido a múltiples intentos fallidos.`,
          minutesBlocked: tiempoBloqueo,
          attempts: nuevoIntentos
        });
      } else {
        await pool.query(
          `UPDATE Usuarios 
           SET intentos_login_fallidos = ?,
               ultimo_intento_fallido = NOW()
           WHERE id_usuario = ?`,
          [nuevoIntentos, user.id_usuario]
        );

        await registrarHistorialLogin(user, 'fallido', `Intento ${nuevoIntentos}/3`);

        const intentosRestantes = 3 - nuevoIntentos;

        return res.status(401).json({
          message: `❌ Contraseña incorrecta. Te ${intentosRestantes === 1 ? 'queda' : 'quedan'} ${intentosRestantes} intento${intentosRestantes > 1 ? 's' : ''}.`,
          attemptsRemaining: intentosRestantes,
          totalAttempts: nuevoIntentos
        });
      }
    }

    // 5️⃣ CONTRASEÑA CORRECTA - RESETEAR INTENTOS
    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
      secureLog.info('Contador de intentos reseteado', { userId: user.id_usuario });
    }

    // 6️⃣ VALIDAR ESTADO DE LA CUENTA
    if (user.estado !== "Activo") {
      if (user.estado === "Pendiente") {
        return res.status(403).json({
          message: "Cuenta pendiente de verificación. Revisa tu correo 📧",
          requiresVerification: true,
          correo: user.correo
        });
      }
      return res.status(403).json({ message: "Cuenta inactiva o suspendida." });
    }

    // 7️⃣ VERIFICAR 2FA (GMAIL)
    if (user.metodo_gmail_2fa) {
      const code = generateCode();
      await pool.query(
        'UPDATE Usuarios SET ultimo_codigo_gmail=?, expiracion_codigo_gmail=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id_usuario=?',
        [code, user.id_usuario]
      );
      
      secureLog.security('2FA_GMAIL_ENVIADO', user.id_usuario);
      await sendRecoveryCode(user.correo, code);
      await registrarHistorialLogin(user, 'exitoso', '2FA Gmail enviado');

      return res.json({
        message: "Se envió un código de acceso a tu correo 📧",
        requires2FA: true,
        metodo_2fa: "GMAIL",
        correo: user.correo,
      });
    }

    // 8️⃣ VERIFICAR 2FA (TOTP)
    if (user.esta_2fa_habilitado) {
      secureLog.security('2FA_TOTP_REQUERIDO', user.id_usuario);
      await registrarHistorialLogin(user, 'exitoso', '2FA TOTP requerido');

      return res.json({
        message: "Credenciales correctas",
        requires2FA: true,
        metodo_2fa: user.metodo_2fa || "TOTP",
        correo: user.correo
      });
    }

    // 9️⃣ LOGIN EXITOSO SIN 2FA
    const token = generateToken(user);

    await saveActiveSession(user.id_usuario, token, req);
    await registrarHistorialLogin(user, 'exitoso', 'Login directo');

    secureLog.security('LOGIN_EXITOSO', user.id_usuario);

    res.json({
      message: "Inicio de sesión exitoso ✅",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });

  } catch (error) {
    secureLog.error('Error crítico en login', error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// =========================================================
// ⭐ LOGIN CON CÓDIGO 2FA (TOTP)
// =========================================================
export const loginWith2FA = async (req, res) => {
  try {
    const { correo, codigo2fa } = req.body;

    secureLog.info('Verificación 2FA TOTP', { email: maskEmail(correo) });

    if (!correo || !codigo2fa) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = rows[0];

    const speakeasy = (await import("speakeasy")).default;
    
    const verified = speakeasy.totp.verify({
      secret: user.secreto_2fa,
      encoding: "base32",
      token: codigo2fa,
      window: 2
    });

    if (!verified) {
      secureLog.security('2FA_TOTP_INCORRECTO', user.id_usuario);
      return res.status(401).json({ message: "Código 2FA incorrecto ❌" });
    }

    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
    }

    const token = generateToken(user);
    await saveActiveSession(user.id_usuario, token, req);
    await registrarHistorialLogin(user, 'exitoso', 'Login con 2FA TOTP');

    secureLog.security('2FA_TOTP_EXITOSO', user.id_usuario);

    res.json({
      message: "Inicio de sesión exitoso ✅",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    secureLog.error('Error en loginWith2FA', error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// =========================================================
// ✅ VERIFICACIÓN DE CÓDIGO GMAIL (EMAIL 2FA)
// =========================================================
export const verifyLoginCode = async (req, res) => {
  try {
    const { correo, codigo } = req.body;

    secureLog.info('Verificación código Gmail 2FA', { email: maskEmail(correo) });

    if (!correo || !codigo) {
      return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ? AND metodo_gmail_2fa = 1 LIMIT 1",
      [correo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado o sin Gmail 2FA" });
    }

    const user = rows[0];

    if (
      !user.ultimo_codigo_gmail ||
      user.ultimo_codigo_gmail !== codigo ||
      new Date(user.expiracion_codigo_gmail) < new Date()
    ) {
      secureLog.security('CODIGO_GMAIL_INVALIDO', user.id_usuario);
      return res.status(401).json({ message: "Código inválido o expirado ❌" });
    }

    await pool.query(
      "UPDATE Usuarios SET ultimo_codigo_gmail=NULL, expiracion_codigo_gmail=NULL WHERE id_usuario=?",
      [user.id_usuario]
    );

    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
    }

    const token = generateToken(user);
    await saveActiveSession(user.id_usuario, token, req);
    await registrarHistorialLogin(user, 'exitoso', 'Login con Gmail 2FA');

    secureLog.security('GMAIL_2FA_EXITOSO', user.id_usuario);

    res.json({
      message: "✅ Verificación exitosa. Sesión iniciada.",
      access_token: token,
      token_type: "bearer",
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        estado: user.estado
      }
    });
  } catch (error) {
    secureLog.error('Error en verifyLoginCode', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// =========================================================
// 🔥 REVOCAR OTRAS SESIONES
// =========================================================
export const closeOtherSessions = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const currentToken = req.headers.authorization?.split(' ')[1];

    if (!currentToken) {
      return res.status(400).json({ message: "No se encontró token actual" });
    }

    const sessionsRevoked = await revokeOtherSessions(userId, currentToken);

    secureLog.security('SESIONES_REVOCADAS', userId, { 
      cantidad: sessionsRevoked 
    });

    res.json({
      message: `✅ Se cerraron ${sessionsRevoked} sesión(es) en otros dispositivos`,
      sessionsRevoked
    });

  } catch (error) {
    secureLog.error('Error al revocar sesiones', error);
    res.status(500).json({ message: "Error al cerrar otras sesiones" });
  }
};

// =========================================================
// ✅ VERIFICAR SI LA SESIÓN ACTUAL ES VÁLIDA
// =========================================================
export const checkSession = async (req, res) => {
  try {
    res.json({
      valid: true,
      message: "Sesión válida"
    });
  } catch (error) {
    secureLog.error('Error al verificar sesión', error);
    res.status(500).json({ message: "Error al verificar sesión" });
  }
};