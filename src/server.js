// =========================================================
// 📦 IMPORTACIONES
// =========================================================
import express from 'express';
import cron from 'node-cron';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import recoveryRoutes from './routes/recoveryRoutes.js';
import twoFactorRoutes from './routes/twoFactorRoutes.js';
import { testConnection } from './config/db.js';
import { cleanupExpiredCodes } from './services/emailService.js'; // si limpias códigos aquí

// =========================================================
// ⚙️ CONFIGURACIÓN INICIAL
// =========================================================
dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

// =========================================================
// 🔒 CONFIGURACIÓN DE CORS
// =========================================================
app.use(
  cors({
    origin: [
      'https://front-auth-two.vercel.app', // frontend en Vercel
      'http://localhost:4200' // entorno local
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  })
);

// =========================================================
// 🧩 MIDDLEWARES GLOBALES
// =========================================================
app.use(express.json());

// =========================================================
// 🚀 RUTAS PRINCIPALES
// =========================================================
app.use('/api/auth', authRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/2fa', twoFactorRoutes);

// =========================================================
// 🧪 RUTA DE PRUEBA (opcional para test rápido)
app.get('/', (req, res) => {
  res.send('✅ Backend AUTH activo y corriendo correctamente.');
});

// =========================================================
// 🕒 TAREAS PROGRAMADAS (CRON)
// =========================================================
cron.schedule('0 * * * *', () => {
  console.log('🧹 Ejecutando limpieza de códigos expirados...');
  try {
    cleanupExpiredCodes();
  } catch (err) {
    console.error('❌ Error al limpiar códigos expirados:', err.message);
  }
});

// =========================================================
// 🚀 INICIO DEL SERVIDOR
// =========================================================
app.listen(PORT, async () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  await testConnection();
  console.log('🟢 Conexión MySQL verificada correctamente.');
});
