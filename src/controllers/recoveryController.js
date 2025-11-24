import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { generateCode, sendRecoveryCode } from "../services/emailService.js";

dotenv.config();

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

// =========================================================
// 🔒 HELPER: Calcular tiempo de bloqueo progresivo
// =========================================================
const calcularTiempoBloqueoRecuperacion = (bloqueosTotales) => {
  if (bloqueosTotales === 0) return 15;      // 15 minutos (primer bloqueo)
  if (bloqueosTotales === 1) return 30;      // 30 minutos (segundo bloqueo)
  return 60;                                  // 60 minutos (tercer bloqueo en adelante)
};

// =========================================================
// 📧 SOLICITAR CÓDIGO DE RECUPERACIÓN (CON RATE LIMITING MEJORADO)
// =========================================================
export const requestRecoveryCode = async (req, res) => {
  let connection;
  
  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({ message: "El correo es obligatorio" });
    }

    console.log(`📧 Solicitud de recuperación para: ${correo}`);

    // ✅ OBTENER CONEXIÓN
    connection = await retryOperation(() => pool.getConnection());

    // ============================================
    // 1️⃣ BUSCAR USUARIO
    // ============================================
    const [users] = await retryOperation(() => 
      connection.query('SELECT * FROM Usuarios WHERE correo = ?', [correo])
    );

    if (users.length === 0) {
      console.log(`❌ Correo no encontrado: ${correo}`);
      // 🔒 SEGURIDAD: No revelar si el correo existe
      return res.json({ 
        message: "Si el correo existe, recibirás un código de recuperación",
        correo: correo
      });
    }

    const user = users[0];

    // ============================================
    // 2️⃣ VERIFICAR SI ESTÁ BLOQUEADO
    // ============================================
    if (user.bloqueado_recuperacion_hasta) {
      const ahora = new Date();
      const desbloqueo = new Date(user.bloqueado_recuperacion_hasta);

      if (ahora < desbloqueo) {
        // 🔒 AÚN ESTÁ BLOQUEADO
        const minutosRestantes = Math.ceil((desbloqueo - ahora) / 60000);
        const horaDesbloqueo = desbloqueo.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });

        console.log(`🔒 Recuperación bloqueada hasta: ${horaDesbloqueo}`);

        return res.status(429).json({
          blocked: true,
          message: `🔒 Demasiados intentos de recuperación. Por favor espera ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''} antes de intentar de nuevo.`,
          minutesRemaining: minutosRestantes,
          unlockTime: horaDesbloqueo
        });
      } else {
        // ✅ DESBLOQUEO AUTOMÁTICO
        console.log('✅ Desbloqueando recuperación automáticamente...');
        await retryOperation(() =>
          connection.query(
            `UPDATE Usuarios 
             SET bloqueado_recuperacion_hasta = NULL, 
                 intentos_recuperacion = 0 
             WHERE id_usuario = ?`,
            [user.id_usuario]
          )
        );
        user.bloqueado_recuperacion_hasta = null;
        user.intentos_recuperacion = 0;
      }
    }

    // ============================================
    // 3️⃣ VERIFICAR VENTANA DE 15 MINUTOS
    // ============================================
    const ahora = new Date();
    const hace15Min = new Date(ahora.getTime() - 15 * 60000);
    
    let intentosActuales = user.intentos_recuperacion || 0;
    const ultimoIntento = user.ultimo_intento_recuperacion ? new Date(user.ultimo_intento_recuperacion) : null;

    // Si el último intento fue hace más de 15 minutos, resetear contador
    if (!ultimoIntento || ultimoIntento < hace15Min) {
      console.log('⏰ Ventana de 15 minutos expirada, reseteando contador');
      intentosActuales = 0;
    }

    // ============================================
    // 4️⃣ VERIFICAR LÍMITE DE INTENTOS
    // ============================================
    const nuevoIntentos = intentosActuales + 1;
    console.log(`📊 Intento de recuperación #${nuevoIntentos}/3`);

    if (nuevoIntentos > 3) {
      // 🔒 BLOQUEAR TEMPORALMENTE
      const tiempoBloqueo = calcularTiempoBloqueoRecuperacion(user.total_bloqueos_recuperacion || 0);

      await retryOperation(() =>
        connection.query(
          `UPDATE Usuarios 
           SET intentos_recuperacion = ?,
               bloqueado_recuperacion_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE),
               total_bloqueos_recuperacion = total_bloqueos_recuperacion + 1,
               ultimo_intento_recuperacion = NOW()
           WHERE id_usuario = ?`,
          [nuevoIntentos, tiempoBloqueo, user.id_usuario]
        )
      );

      console.log(`🔒 Recuperación bloqueada por ${tiempoBloqueo} minutos`);

      return res.status(429).json({
        blocked: true,
        message: `🔒 Has excedido el límite de intentos de recuperación. Tu cuenta ha sido bloqueada por ${tiempoBloqueo} minutos por seguridad.`,
        minutesBlocked: tiempoBloqueo
      });
    }

    // ============================================
    // 5️⃣ INVALIDAR CÓDIGOS ANTERIORES
    // ============================================
    await retryOperation(() => 
      connection.query(
        'UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ? AND usado = FALSE',
        [correo]
      )
    );

    // ============================================
    // 6️⃣ GENERAR Y GUARDAR CÓDIGO
    // ============================================
    const codigo = generateCode();

    await retryOperation(() =>
      connection.query(
        `INSERT INTO codigosrecuperacion (correo, codigo, fecha_expiracion)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [correo, codigo]
      )
    );

    // ============================================
    // 7️⃣ ACTUALIZAR CONTADOR DE INTENTOS
    // ============================================
    await retryOperation(() =>
      connection.query(
        `UPDATE Usuarios 
         SET intentos_recuperacion = ?,
             ultimo_intento_recuperacion = NOW()
         WHERE id_usuario = ?`,
        [nuevoIntentos, user.id_usuario]
      )
    );

    // ============================================
    // 8️⃣ ENVIAR EMAIL
    // ============================================
    try {
      await sendRecoveryCode(correo, codigo);
      console.log(`✅ Código enviado a ${correo}: ${codigo}`);
    } catch (emailError) {
      console.error('❌ Error al enviar email:', emailError);
    }

    const intentosRestantes = 3 - nuevoIntentos;
    console.log(`✅ Código enviado. Intentos restantes: ${intentosRestantes}`);

    res.json({ 
      message: "Si el correo existe, recibirás un código de recuperación",
      correo: correo,
      attemptsRemaining: intentosRestantes,
      warning: intentosRestantes === 1 ? "⚠️ Este es tu último intento antes del bloqueo temporal." : null
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

// =========================================================
// ✅ VALIDAR CÓDIGO DE RECUPERACIÓN
// =========================================================
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

// =========================================================
// 🔑 RESTABLECER CONTRASEÑA
// =========================================================
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

    // Verificar código
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

    // Verificar usuario
    const [users] = await retryOperation(() =>
      connection.query('SELECT id_usuario FROM Usuarios WHERE correo = ?', [correo])
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await retryOperation(() =>
      connection.query('UPDATE Usuarios SET contrasena = ? WHERE correo = ?', [hashedPassword, correo])
    );

    // Marcar código como usado
    await retryOperation(() =>
      connection.query('UPDATE codigosrecuperacion SET usado = TRUE WHERE correo = ?', [correo])
    );

    // ✅ RESETEAR CONTADORES DE RECUPERACIÓN
    await retryOperation(() =>
      connection.query(
        `UPDATE Usuarios 
         SET intentos_recuperacion = 0,
             bloqueado_recuperacion_hasta = NULL,
             ultimo_intento_recuperacion = NULL
         WHERE correo = ?`,
        [correo]
      )
    );

    await connection.commit();
    
    console.log(`✅ Contraseña actualizada para ${correo}`);
    
    res.json({ message: "Contraseña actualizada exitosamente" });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error en resetPassword:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
};

// =========================================================
// 🧹 LIMPIEZA PERIÓDICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = async () => {
  try {
    const [result] = await retryOperation(() =>
      pool.query('DELETE FROM codigosrecuperacion WHERE fecha_expiracion < NOW() OR usado = TRUE')
    );
    console.log(`🧹 Códigos eliminados: ${result.affectedRows}`);
  } catch (error) {
    console.error('❌ Error al limpiar códigos:', error);
  }
};