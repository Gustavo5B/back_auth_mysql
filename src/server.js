// =========================================================
// 📦 IMPORTACIONES
// =========================================================
import express from 'express';
import cron from 'node-cron';
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
// 🔒 CONFIGURACIÓN DE CORS (manual, compatible con Render + Vercel)
// =========================================================
const allowedOrigins = [
  'https://front-auth-two.vercel.app', // ✅ TU FRONTEND EN VERCEL
  'http://localhost:4200', // ✅ Desarrollo local
];

// Middleware manual para CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // 🔹 Responder inmediatamente las solicitudes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

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
  res.json({ 
    message: '✅ Backend AUTH activo',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// =========================================================
// 🕒 TAREAS PROGRAMADAS (Limpieza cada hora)
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