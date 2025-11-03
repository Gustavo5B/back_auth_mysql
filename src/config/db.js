import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10), // ✅ Railway usa puerto personalizado
  
  // ✅ CONFIGURACIÓN OPTIMIZADA PARA RAILWAY
  waitForConnections: true,
  connectionLimit: 10,              // ✅ Railway soporta más conexiones
  queueLimit: 0,
  connectTimeout: 60000,            // ✅ 60 segundos
  acquireTimeout: 60000,
  timeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // ✅ Configuración adicional
  multipleStatements: false,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true
});

// Alias para compatibilidad
export const poolPromise = pool;

// Test de conexión mejorado
export const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log(`✅ Conectado a MySQL Railway (${process.env.DB_NAME})`);
    console.log(`📍 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error.message);
    console.error("💡 Verifica que:");
    console.error("   - Las credenciales en Render Environment sean correctas");
    console.error("   - Railway esté activo y accesible");
    return false;
  } finally {
    if (connection) connection.release();
  }
};

// ✅ Manejo de errores del pool
pool.on('connection', (connection) => {
  console.log('🔌 Nueva conexión MySQL Railway establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de MySQL:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('💡 Conexión perdida con MySQL. Se reconectará automáticamente.');
  }
  if (err.code === 'ECONNRESET') {
    console.error('💡 Conexión resetada. Reintentando...');
  }
});

// ✅ Helper para ejecutar queries con reintentos
export const queryWithRetry = async (sql, params, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await pool.query(sql, params);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`❌ Intento ${i + 1}/${maxRetries} falló:`, error.message);
      
      if (i < maxRetries - 1) {
        // Esperar antes de reintentar (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
  
  throw lastError;
};

// Auto-test al iniciar
testConnection();