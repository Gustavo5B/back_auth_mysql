import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { sendVerificationEmail } from "../services/emailService.js";

dotenv.config();

// =========================================================
// 🔢 GENERAR CÓDIGO DE VERIFICACIÓN DE 6 DÍGITOS
// =========================================================
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// =========================================================
// 🛡️ SANITIZAR NOMBRE (Protección contra XSS)
// =========================================================
const sanitizeName = (nombre) => {
  // Remover caracteres peligrosos
  return nombre
    .trim()
    .replace(/[<>\"'`]/g, '') // Eliminar caracteres HTML/JS peligrosos
    .substring(0, 100); // Limitar longitud
};

// =========================================================
// 🔐 VALIDAR FORMATO DE NOMBRE
// =========================================================
const isValidName = (nombre) => {
  // Solo letras, espacios, acentos y ñ
  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  return nameRegex.test(nombre) && nombre.length >= 2 && nombre.length <= 100;
};

// =========================================================
// 🔐 VALIDAR COMPLEJIDAD DE CONTRASEÑA
// =========================================================
const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Debe tener al menos 8 caracteres');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una mayúscula');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una minúscula');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número');
  }

  if (!/[@$!%*?&#]/.test(password)) {
    errors.push('Debe contener al menos un carácter especial (@$!%*?&#)');
  }

  // Lista de contraseñas comunes (top 20)
  const commonPasswords = [
    '12345678', 'password', 'qwerty123', '123456789', 'abc123',
    'password123', '11111111', 'qwertyuiop', 'password1', 'admin123',
    'letmein', 'welcome123', 'monkey123', 'dragon123', 'master123',
    'sunshine', 'princess', 'football', 'iloveyou', 'trustno1'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Contraseña demasiado común. Elige una más segura');
  }

  return errors;
};

// =========================================================
// 🔐 VALIDAR FORMATO DE EMAIL
// =========================================================
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 255;
};

// =========================================================
// 📝 REGISTRO DE USUARIO CON VERIFICACIÓN DE EMAIL
// =========================================================
export const register = async (req, res) => {
  let { nombre, correo, contrasena } = req.body;

  try {
    console.log('📝 Iniciando registro para:', correo);

    // ============================================
    // 1️⃣ VALIDACIONES BÁSICAS
    // ============================================
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ 
        message: "Todos los campos son obligatorios" 
      });
    }

    // ============================================
    // 2️⃣ SANITIZAR Y VALIDAR NOMBRE
    // ============================================
    nombre = sanitizeName(nombre);
    
    if (!isValidName(nombre)) {
      return res.status(400).json({ 
        message: "El nombre solo puede contener letras y espacios (2-100 caracteres)" 
      });
    }

    // ============================================
    // 3️⃣ VALIDAR FORMATO DE EMAIL
    // ============================================
    correo = correo.trim().toLowerCase();
    
    if (!isValidEmail(correo)) {
      return res.status(400).json({ 
        message: "El formato del correo no es válido" 
      });
    }

    // ============================================
    // 4️⃣ VALIDAR COMPLEJIDAD DE CONTRASEÑA
    // ============================================
    const passwordErrors = validatePasswordStrength(contrasena);
    
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: "Contraseña insegura",
        errors: passwordErrors
      });
    }

    // ============================================
    // 5️⃣ VERIFICAR SI EL CORREO YA EXISTE
    // ============================================
    console.log('🔍 Verificando si el correo ya existe...');
    const [existingUser] = await pool.query(
      "SELECT id_usuario FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ 
        message: "El correo ya está registrado." 
      });
    }

    // ============================================
    // 6️⃣ ENCRIPTAR CONTRASEÑA
    // ============================================
    console.log('🔐 Encriptando contraseña...');
    const saltRounds = 12; // Mayor que 10 para más seguridad
    const hash = await bcrypt.hash(contrasena, saltRounds);

    // ============================================
    // 7️⃣ GENERAR CÓDIGO DE VERIFICACIÓN
    // ============================================
    const codigoVerificacion = generateVerificationCode();
    const expiracion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    console.log('🔢 Código generado:', codigoVerificacion);

    // ============================================
    // 8️⃣ INSERTAR USUARIO CON PREPARED STATEMENT
    // ============================================
    console.log('💾 Guardando usuario en BD con estado Pendiente...');
    
    const insertQuery = `
      INSERT INTO Usuarios 
      (nombre, correo, contrasena, estado, codigo_verificacion, expiracion_codigo_verificacion) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.query(insertQuery, [
      nombre,
      correo,
      hash,
      "Pendiente",
      codigoVerificacion,
      expiracion
    ]);

    console.log(`✅ Usuario registrado (Pendiente): ${correo} (ID: ${result.insertId})`);

    // ============================================
    // 9️⃣ ENVIAR EMAIL DE VERIFICACIÓN
    // ============================================
    try {
      console.log('📧 Enviando código de verificación por email...');
      await sendVerificationEmail(correo, nombre, codigoVerificacion);
      console.log(`✅ Código de verificación enviado a: ${correo}`);
    } catch (emailError) {
      console.error(`⚠️ Error al enviar email a ${correo}:`, emailError.message);
      
      // Si falla el email, eliminar el usuario creado
      await pool.query(
        "DELETE FROM Usuarios WHERE id_usuario = ?",
        [result.insertId]
      );
      
      return res.status(500).json({ 
        message: "No se pudo enviar el correo de verificación. Intenta nuevamente."
      });
    }

    // ============================================
    // 🎉 RESPONDER AL CLIENTE
    // ============================================
    res.status(201).json({ 
      message: "Registro exitoso. Revisa tu correo para verificar tu cuenta 📧",
      requiresVerification: true,
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
      message: "Error al registrar usuario."
    });
  }
};

// =========================================================
// ✅ VERIFICAR CÓDIGO DE EMAIL
// =========================================================
export const verifyEmail = async (req, res) => {
  try {
    let { correo, codigo } = req.body;

    console.log('🔍 Verificando código para:', correo);

    // Validaciones
    if (!correo || !codigo) {
      return res.status(400).json({ 
        message: "Correo y código son obligatorios" 
      });
    }

    // Sanitizar inputs
    correo = correo.trim().toLowerCase();
    codigo = codigo.trim();

    // Validar formato de código
    if (!/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ 
        message: "Código inválido. Debe ser de 6 dígitos" 
      });
    }

    // Buscar usuario pendiente
    const selectQuery = `
      SELECT id_usuario, nombre, codigo_verificacion, expiracion_codigo_verificacion 
      FROM Usuarios 
      WHERE correo = ? AND estado = ? 
      LIMIT 1
    `;
    
    const [rows] = await pool.query(selectQuery, [correo, 'Pendiente']);

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: "Usuario no encontrado o ya verificado" 
      });
    }

    const user = rows[0];

    // Verificar código
    if (user.codigo_verificacion !== codigo) {
      console.log('❌ Código incorrecto');
      return res.status(401).json({ 
        message: "Código de verificación incorrecto" 
      });
    }

    // Verificar expiración
    const now = new Date();
    const expiracion = new Date(user.expiracion_codigo_verificacion);
    
    if (now > expiracion) {
      console.log('❌ Código expirado');
      return res.status(401).json({ 
        message: "El código ha expirado. Solicita uno nuevo." 
      });
    }

    // Activar cuenta
    const updateQuery = `
      UPDATE Usuarios 
      SET estado = ?, 
          codigo_verificacion = NULL, 
          expiracion_codigo_verificacion = NULL 
      WHERE id_usuario = ?
    `;
    
    await pool.query(updateQuery, ['Activo', user.id_usuario]);

    console.log(`✅ Cuenta verificada exitosamente: ${correo}`);

    // Enviar email de bienvenida
    const { sendWelcomeEmail } = await import('../services/emailService.js');
    sendWelcomeEmail(correo, user.nombre)
      .then(() => console.log('📧 Email de bienvenida enviado'))
      .catch((err) => console.error('⚠️ Error enviando email de bienvenida:', err.message));

    res.json({ 
      message: "✅ Cuenta verificada exitosamente. Ya puedes iniciar sesión.",
      verified: true
    });

  } catch (error) {
    console.error("❌ Error en verificación:", error);
    res.status(500).json({ 
      message: "Error al verificar cuenta" 
    });
  }
};

// =========================================================
// 🔄 REENVIAR CÓDIGO DE VERIFICACIÓN
// =========================================================
export const resendVerificationCode = async (req, res) => {
  try {
    let { correo } = req.body;

    console.log('🔄 Reenviando código a:', correo);

    if (!correo) {
      return res.status(400).json({ 
        message: "El correo es obligatorio" 
      });
    }

    // Sanitizar email
    correo = correo.trim().toLowerCase();

    // Buscar usuario pendiente
    const selectQuery = `
      SELECT id_usuario, nombre 
      FROM Usuarios 
      WHERE correo = ? AND estado = ? 
      LIMIT 1
    `;
    
    const [rows] = await pool.query(selectQuery, [correo, 'Pendiente']);

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: "Usuario no encontrado o ya verificado" 
      });
    }

    const user = rows[0];

    // Generar nuevo código
    const nuevoCodigoVerificacion = generateVerificationCode();
    const nuevaExpiracion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Actualizar en BD
    const updateQuery = `
      UPDATE Usuarios 
      SET codigo_verificacion = ?, 
          expiracion_codigo_verificacion = ? 
      WHERE id_usuario = ?
    `;
    
    await pool.query(updateQuery, [
      nuevoCodigoVerificacion,
      nuevaExpiracion,
      user.id_usuario
    ]);

    // Enviar email
    const { sendVerificationEmail } = await import('../services/emailService.js');
    await sendVerificationEmail(correo, user.nombre, nuevoCodigoVerificacion);

    console.log(`✅ Código reenviado a: ${correo}`);

    res.json({ 
      message: "Código reenviado exitosamente 📧" 
    });

  } catch (error) {
    console.error("❌ Error reenviando código:", error);
    res.status(500).json({ 
      message: "Error al reenviar código" 
    });
  }
};