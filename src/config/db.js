import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  
  // ✅ CONFIGURACIÓN OPTIMIZADA PARA FREESQLDATABASE
  waitForConnections: true,
  connectionLimit: 3,              // ⬇️ Reducir a 3 (límite de FreeSQLDatabase)
  queueLimit: 0,
  connectTimeout: 30000,           // ⬇️ Reducir a 30 segundos
  acquireTimeout: 30000,
  timeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  
  // ✅ IMPORTANTE: No usar múltiples queries
  multipleStatements: false,
  dateStrings: true,
  
  // ✅ RECONEXIÓN AUTOMÁTICA
  reconnect: true
});

export const poolPromise = pool;

export const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log(`✅ Conectado a MySQL Remoto (${process.env.DB_NAME})`);
    console.log(`📍 Servidor: ${process.env.DB_HOST}`);
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error.message);
    return false;
  } finally {
    if (connection) connection.release();
  }
};

// ✅ Manejar errores del pool
pool.on('connection', (connection) => {
  console.log('🔌 Nueva conexión MySQL establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error en pool MySQL:', err.code);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Reconectando automáticamente...');
  }
});

testConnection();