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
import { cleanupExpiredCodes } from './services/emailService.js';

// =========================================================
// ⚙️ CONFIGURACIÓN INICIAL
// =========================================================
dotenv.config();
const app = express();

// =========================================================
// 🔒 CONFIGURACIÓN DE CORS (producción + local)
// =========================================================
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://front-auth-two.vercel.app', // 🔹 tu frontend en Vercel
  'http://localhost:4200', // 🔹 entorno local Angular
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Si no hay origen (por ejemplo en Postman), permitir
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`🚫 CORS bloqueó el origen no permitido: ${origin}`);
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
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
// 🧪 RUTA DE PRUEBA
// =========================================================
app.get('/', (req, res) => {
  res.send('✅ Backend AUTH activo y corriendo correctamente.');
});

// =========================================================
// 🕒 TAREAS PROGRAMADAS (CRON cada hora)
// =========================================================
cron.schedule('0 * * * *', async () => {
  console.log('🧹 Ejecutando limpieza de códigos expirados...');
  try {
    await cleanupExpiredCodes();
    console.log('✅ Limpieza completada.');
  } catch (err) {
    console.error('❌ Error en limpieza automática:', err.message);
  }
});

// =========================================================
// 🚀 INICIO DEL SERVIDOR
// =========================================================
const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);

  try {
    await testConnection();
    console.log('🟢 Conexión MySQL verificada correctamente.');
  } catch (error) {
    console.error('❌ Error en la conexión MySQL:', error.message);
  }
});
