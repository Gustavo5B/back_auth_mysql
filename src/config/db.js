import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  waitForConnections: true,
  connectionLimit: 5, // ✅ Reducido para MySQL gratuito
  queueLimit: 0,
  connectTimeout: 60000, // ✅ 60 segundos (MySQL remoto puede ser lento)
  acquireTimeout: 60000, // ✅ Nuevo: tiempo para adquirir conexión
  timeout: 60000, // ✅ Nuevo: timeout de query
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // ✅ Configuración adicional para estabilidad
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
    await connection.ping(); // ✅ Verificar que la conexión esté viva
    console.log(`✅ Conectado a MySQL Remoto (${process.env.DB_NAME})`);
    console.log(`📍 Servidor: ${process.env.DB_HOST}`);
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error.message);
    console.error("💡 Verifica que:");
    console.error("   - Las credenciales en Render Environment sean correctas");
    console.error("   - Tu IP esté permitida en freesqldatabase.com");
    console.error("   - El servidor esté disponible");
    return false;
  } finally {
    if (connection) connection.release();
  }
};

// ✅ Manejo de errores del pool
pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de MySQL:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('💡 Conexión perdida con MySQL. Se reconectará automáticamente.');
  }
});

// Auto-test al iniciar
testConnection();