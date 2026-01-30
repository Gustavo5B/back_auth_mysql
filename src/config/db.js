import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  
  // ✅ CONFIGURACIÓN CORRECTA (sin acquireTimeout ni timeout)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,        // ✅ Este SÍ es válido
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // ✅ Configuración adicional
  multipleStatements: false,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  charset: 'utf8mb4',
  timezone: '+00:00'
});

// Alias para compatibilidad
export const poolPromise = pool;

// Test de conexión
export const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log(`🟢 Conectado a MySQL (${process.env.DB_NAME})`);
    console.log(`📍 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error.message);
    console.error("💡 Verifica que:");
    console.error("   - MySQL esté corriendo en localhost:3306");
    console.error("   - Las credenciales en .env sean correctas");
    console.error("   - La base de datos 'nuub_studio' exista");
    return false;
  } finally {
    if (connection) connection.release();
  }
};

// Manejo de errores del pool
pool.on('connection', () => {
  console.log('🔌 Nueva conexión MySQL establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de MySQL:', err.message);
});

// Helper para ejecutar queries con reintentos
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
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
  
  throw lastError;
};