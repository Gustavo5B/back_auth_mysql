import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const dbSettings = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

export const poolPromise = new sql.ConnectionPool(dbSettings)
  .connect()
  .then(pool => {
    console.log(`✅ Conectado a SQL Server (${process.env.DB_NAME})`);
    return pool;
  })
  .catch(err => console.error("❌ Error de conexión:", err));
