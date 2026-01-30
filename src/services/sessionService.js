import crypto from 'crypto';
import { pool } from '../config/db.js';

// =========================================================
// 🔐 GENERAR HASH DEL TOKEN (para guardar en BD)
// =========================================================
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// =========================================================
// 💾 GUARDAR SESIÓN ACTIVA
// =========================================================
export const saveActiveSession = async (userId, token, req) => {
  try {
    const tokenHash = hashToken(token);
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.socket.remoteAddress || 
               req.connection.remoteAddress || 
               'unknown';
    const userAgent = req.headers['user-agent'] || 'Desconocido';
    const fechaExpiracion = new Date();
    fechaExpiracion.setHours(fechaExpiracion.getHours() + 24); // 24 horas

    // ✅ COLUMNAS CORRECTAS: token, token_hash, fecha_expiracion, ip_address, user_agent
    await pool.query(
      `INSERT INTO sesiones_activas 
       (id_usuario, token, token_hash, fecha_expiracion, ip_address, user_agent, activa) 
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [userId, token, tokenHash, fechaExpiracion, ip, userAgent]
    );

    console.log(`✅ Sesión guardada para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error al guardar sesión:', error.message);
    return false;
  }
};

// =========================================================
// ✅ VERIFICAR SI SESIÓN ES VÁLIDA
// =========================================================
export const isSessionValid = async (token) => {
  try {
    const tokenHash = hashToken(token);
    
    // ✅ COLUMNA CORRECTA: id_sesion (no "id")
    const [rows] = await pool.query(
      `SELECT id_sesion 
       FROM sesiones_activas 
       WHERE token_hash = ? 
       AND activa = 1 
       AND fecha_expiracion > NOW()`,
      [tokenHash]
    );

    const isValid = rows.length > 0;
    console.log(`🔍 Sesión válida: ${isValid ? 'SÍ ✅' : 'NO ❌'}`);
    
    return isValid;
  } catch (error) {
    console.error('❌ Error al verificar sesión:', error.message);
    return false;
  }
};

// =========================================================
// 🗑️ ELIMINAR SESIÓN ESPECÍFICA (Logout normal)
// =========================================================
export const removeSession = async (token) => {
  try {
    const tokenHash = hashToken(token);
    
    await pool.query(
      'DELETE FROM sesiones_activas WHERE token_hash = ?',
      [tokenHash]
    );

    console.log('✅ Sesión eliminada correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al eliminar sesión:', error.message);
    return false;
  }
};

// =========================================================
// 🔥 REVOCAR OTRAS SESIONES (excepto la actual)
// =========================================================
export const revokeOtherSessions = async (userId, currentToken) => {
  try {
    const currentTokenHash = hashToken(currentToken);

    const [result] = await pool.query(
      `DELETE FROM sesiones_activas 
       WHERE id_usuario = ? 
       AND token_hash != ?`,
      [userId, currentTokenHash]
    );

    console.log(`🔥 ${result.affectedRows} sesiones revocadas para usuario ${userId}`);
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error al revocar sesiones:', error.message);
    throw error;
  }
};

// =========================================================
// 🧹 LIMPIAR SESIONES EXPIRADAS (opcional, para cron job)
// =========================================================
export const cleanupExpiredSessions = async () => {
  try {
    const [result] = await pool.query(
      `DELETE FROM sesiones_activas 
       WHERE fecha_expiracion < NOW() 
       OR ultima_actividad < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    console.log(`🧹 ${result.affectedRows} sesiones antiguas eliminadas`);
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error al limpiar sesiones:', error.message);
    return 0;
  }
};