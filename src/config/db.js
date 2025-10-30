import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const poolPromise = mysql.createPool({
  host: process.env.DB_HOST,      // cambia de DB_SERVER → DB_HOST
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Comprobamos la conexión
(async () => {
  try {
    const connection = await poolPromise.getConnection();
    console.log(`✅ Conectado a MySQL (${process.env.DB_NAME})`);
    connection.release();
  } catch (error) {
    console.error("❌ Error de conexión a MySQL:", error);
  }
})();
