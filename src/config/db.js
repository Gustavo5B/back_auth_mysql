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
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000, // 30 segundos de timeout
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Alias para compatibilidad
export const poolPromise = pool;

// Test de conexión mejorado
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Conectado a MySQL Remoto (${process.env.DB_NAME})`);
    console.log(`📍 Host: ${process.env.DB_HOST}`);
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error.message);
    console.error("💡 Verifica que:");
    console.error("   - Las credenciales en .env sean correctas");
    console.error("   - Tu IP esté permitida en freesqldatabase.com");
    console.error("   - El servidor esté disponible");
    return false;
  }
};

// Auto-test al iniciar
testConnection();