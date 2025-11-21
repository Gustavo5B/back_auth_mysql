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
    const dispositivo = extractDeviceInfo(req.headers['user-agent']);
    const ip = req.ip || req.connection.remoteAddress || 'Desconocida';
    const userAgent = req.headers['user-agent'] || 'Desconocido';

    await pool.query(
      `INSERT INTO sesiones_activas (id_usuario, token_hash, dispositivo, ip, user_agent) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tokenHash, dispositivo, ip, userAgent]
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
    
    const [rows] = await pool.query(
      'SELECT id FROM sesiones_activas WHERE token_hash = ?',
      [tokenHash]
    );

    return rows.length > 0;
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
// 📱 EXTRAER INFO DEL DISPOSITIVO
// =========================================================
const extractDeviceInfo = (userAgent) => {
  if (!userAgent) return 'Desconocido';

  // Detectar tipo de dispositivo
  if (/mobile/i.test(userAgent)) return 'Móvil';
  if (/tablet/i.test(userAgent)) return 'Tablet';
  if (/windows/i.test(userAgent)) return 'Windows PC';
  if (/mac/i.test(userAgent)) return 'Mac';
  if (/linux/i.test(userAgent)) return 'Linux';
  
  return 'Navegador';
};

// =========================================================
// 🧹 LIMPIAR SESIONES EXPIRADAS (opcional, para cron job)
// =========================================================
export const cleanupExpiredSessions = async () => {
  try {
    // Eliminar sesiones inactivas por más de 30 días
    const [result] = await pool.query(
      `DELETE FROM sesiones_activas 
       WHERE ultimo_uso < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    console.log(`🧹 ${result.affectedRows} sesiones antiguas eliminadas`);
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Error al limpiar sesiones:', error.message);
    return 0;
  }
};