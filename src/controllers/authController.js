import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode, sendWelcomeEmail } from "../services/emailService.js";

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

// =========================================================
// 🔒 HELPER: Calcular tiempo de bloqueo progresivo
// =========================================================
const calcularTiempoBloqueo = (bloqueosTotales) => {
  if (bloqueosTotales === 0) return 15;      // 15 minutos (primer bloqueo)
  if (bloqueosTotales === 1) return 30;      // 30 minutos (segundo bloqueo)
  return 60;                                  // 60 minutos (tercer bloqueo en adelante)
};

// =========================================================
// 📊 HELPER: Registrar en historial (OPCIONAL)
// =========================================================
const registrarHistorialLogin = async (usuario, tipo, razon = null) => {
  try {
    await pool.query(
      `INSERT INTO Historial_Login (id_usuario, correo, tipo, razon_fallo) 
       VALUES (?, ?, ?, ?)`,
      [usuario?.id_usuario || null, usuario?.correo || 'desconocido', tipo, razon]
    );
  } catch (error) {
    console.error('⚠️ Error al registrar historial:', error.message);
  }
};

// =========================================================
// 📝 REGISTRO DE USUARIO CON EMAIL DE BIENVENIDA
// =========================================================
export const register = async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  try {
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
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    // Encriptar contraseña
    const hash = await bcrypt.hash(contrasena, 10);

    // Insertar nuevo usuario
    const [result] = await pool.query(
      "INSERT INTO Usuarios (nombre, correo, contrasena, estado) VALUES (?, ?, ?, ?)",
      [nombre, correo, hash, "Activo"]
    );

    console.log(`✅ Usuario registrado: ${correo} (ID: ${result.insertId})`);

    // ENVIAR EMAIL DE BIENVENIDA DE FORMA ASÍNCRONA
    sendWelcomeEmail(correo, nombre)
      .then(() => {
        console.log(`📧 Email de bienvenida enviado a: ${correo}`);
      })
      .catch((emailError) => {
        console.error(`⚠️ No se pudo enviar email a ${correo}:`, emailError.message);
      });

    // Responder inmediatamente al cliente
    res.status(201).json({ 
      message: "Usuario registrado exitosamente ✅",
      user: {
        id: result.insertId,
        nombre,
        correo
      }
    });

  } catch (error) {
    console.error("❌ Error en registro:", error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    res.status(500).json({ 
      message: "Error al registrar usuario.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// =========================================================
// 🔐 LOGIN CON BLOQUEO POR INTENTOS FALLIDOS
// =========================================================
export const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    console.log('📥 Login attempt:', { correo, hasPassword: !!contrasena });

    // ============================================
    // 1️⃣ VALIDACIONES BÁSICAS
    // ============================================
    if (!correo || !contrasena) {
      return res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    }

    // ============================================
    // 2️⃣ BUSCAR USUARIO
    // ============================================
    console.log('🔍 Buscando usuario en BD...');
    const [rows] = await pool.query(
      "SELECT * FROM Usuarios WHERE correo = ?",
      [correo]
    );

    if (rows.length === 0) {
      console.log('❌ Usuario no encontrado:', correo);
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = rows[0];
    console.log('👤 Usuario encontrado:', user.correo);

    // ============================================
    // 3️⃣ VERIFICAR SI ESTÁ BLOQUEADO
    // ============================================
    if (user.bloqueado_hasta) {
      const ahora = new Date();
      const desbloqueo = new Date(user.bloqueado_hasta);

      if (ahora < desbloqueo) {
        // 🔒 AÚN ESTÁ BLOQUEADO
        const minutosRestantes = Math.ceil((desbloqueo - ahora) / 60000);
        const horaDesbloqueo = desbloqueo.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });

        console.log(`🔒 Cuenta bloqueada hasta: ${horaDesbloqueo}`);

        await registrarHistorialLogin(user, 'bloqueado', 'Intento durante bloqueo');

        return res.status(403).json({
          blocked: true,
          message: `🔒 Cuenta bloqueada por seguridad. Intenta de nuevo en ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''}.`,
          minutesRemaining: minutosRestantes,
          unlockTime: horaDesbloqueo
        });
      } else {
        // ✅ DESBLOQUEO AUTOMÁTICO
        console.log('✅ Desbloqueando cuenta automáticamente...');
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

    // ============================================
    // 4️⃣ VALIDAR CONTRASEÑA
    // ============================================
    console.log('🔐 Verificando contraseña...');
    const match = await bcrypt.compare(contrasena, user.contrasena);

    if (!match) {
      // ❌ CONTRASEÑA INCORRECTA
      console.log('❌ Contraseña incorrecta');

      const nuevoIntentos = user.intentos_login_fallidos + 1;
      console.log(`⚠️ Intento fallido #${nuevoIntentos}`);

      if (nuevoIntentos >= 3) {
        // 🔒 BLOQUEAR CUENTA
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

        console.log(`🔒 Cuenta bloqueada por ${tiempoBloqueo} minutos`);

        return res.status(403).json({
          blocked: true,
          message: `🔒 Cuenta bloqueada por ${tiempoBloqueo} minutos debido a múltiples intentos fallidos.`,
          minutesBlocked: tiempoBloqueo,
          attempts: nuevoIntentos
        });
      } else {
        // ⚠️ SOLO INCREMENTAR CONTADOR
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

    // ============================================
    // 5️⃣ CONTRASEÑA CORRECTA - RESETEAR INTENTOS
    // ============================================
    console.log('✅ Contraseña correcta');

    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
      console.log('✅ Contador de intentos reseteado');
    }

    // ============================================
    // 6️⃣ VALIDAR ESTADO DE LA CUENTA
    // ============================================
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

    // ============================================
    // 7️⃣ VERIFICAR 2FA (GMAIL)
    // ============================================
    if (user.metodo_gmail_2fa) {
      console.log('✅ Requiere Gmail-2FA');
      const code = generateCode();
      await pool.query(
        'UPDATE Usuarios SET ultimo_codigo_gmail=?, expiracion_codigo_gmail=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id_usuario=?',
        [code, user.id_usuario]
      );
      await sendRecoveryCode(user.correo, code);

      await registrarHistorialLogin(user, 'exitoso', '2FA Gmail enviado');

      return res.json({
        message: "Se envió un código de acceso a tu correo 📧",
        requires2FA: true,
        metodo_2fa: "GMAIL",
        correo: user.correo,
      });
    }

    // ============================================
    // 8️⃣ VERIFICAR 2FA (TOTP)
    // ============================================
    if (user.esta_2fa_habilitado) {
      console.log('✅ Requiere 2FA TOTP');

      await registrarHistorialLogin(user, 'exitoso', '2FA TOTP requerido');

      return res.json({
        message: "Credenciales correctas",
        requires2FA: true,
        metodo_2fa: user.metodo_2fa || "TOTP",
        correo: user.correo
      });
    }

    // ============================================
    // 9️⃣ LOGIN EXITOSO SIN 2FA
    // ============================================
    console.log('✅ Generando token JWT...');
    const token = generateToken(user);

    await registrarHistorialLogin(user, 'exitoso', 'Login directo');

    console.log('✅ Login exitoso para:', user.correo);

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
    console.error("❌ Error en login:", error.message);
    console.error("❌ Stack:", error.stack);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// =========================================================
// ⭐ LOGIN CON CÓDIGO 2FA (TOTP)
// =========================================================
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

    // ✅ Resetear intentos fallidos al hacer login exitoso con 2FA
    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
    }

    const token = generateToken(user);

    await registrarHistorialLogin(user, 'exitoso', 'Login con 2FA TOTP');

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
    console.error("Error en loginWith2FA:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// =========================================================
// ✅ VERIFICACIÓN DE CÓDIGO GMAIL (EMAIL 2FA)
// =========================================================
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

    // ✅ Resetear intentos fallidos al hacer login exitoso con Gmail 2FA
    if (user.intentos_login_fallidos > 0) {
      await pool.query(
        'UPDATE Usuarios SET intentos_login_fallidos = 0 WHERE id_usuario = ?',
        [user.id_usuario]
      );
    }

    const token = generateToken(user);

    await registrarHistorialLogin(user, 'exitoso', 'Login con Gmail 2FA');

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
    console.error("❌ Error en verifyLoginCode:", error.message);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};