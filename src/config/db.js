import pkg from 'pg';
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  
  // ✅ CONFIGURACIÓN DE POSTGRESQL
  max: 10,                      // máximo de conexiones en el pool
  idleTimeoutMillis: 30000,     // cerrar conexiones inactivas después de 30s
  connectionTimeoutMillis: 2000, // timeout para obtener conexión
  
  // ✅ Configuración adicional
  ssl: false,                   // cambiar a true si usas SSL
  application_name: 'nuub_studio_backend'
});

// Alias para compatibilidad
export const poolPromise = pool;

// Test de conexión
export const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log(`🟢 Conectado a PostgreSQL (${process.env.DB_NAME})`);
    console.log(`📍 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`⏰ Server time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error("❌ Error de conexión a PostgreSQL:", error.message);
    console.error("💡 Verifica que:");
    console.error("   - PostgreSQL esté corriendo en localhost:5432");
    console.error("   - Las credenciales en .env sean correctas");
    console.error("   - La base de datos 'nuub_studio' exista");
    return false;
  } finally {
    if (client) client.release();
  }
};

// Manejo de eventos del pool
pool.on('connect', () => {
  console.log('🔌 Nueva conexión PostgreSQL establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
  process.exit(-1);
});

pool.on('remove', () => {
  console.log('🔌 Conexión PostgreSQL removida del pool');
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

// ✅ HELPER PARA COMPATIBILIDAD: pool.query vs pool.execute
// PostgreSQL usa .query() en lugar de .execute()
// Este wrapper mantiene compatibilidad con tu código existente
pool.execute = pool.query;