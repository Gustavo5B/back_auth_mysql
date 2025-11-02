// =========================================================
// 📦 IMPORTACIONES
// =========================================================
import express from 'express';
import cors from 'cors';
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
// 🔒 CONFIGURACIÓN DE CORS (usando paquete cors)
// =========================================================
const allowedOrigins = [
  'https://front-auth-two.vercel.app',
  'http://localhost:4200'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin origin (como Postman, Thunder Client)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy: This origin is not allowed';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
    timestamp: new Date().toISOString(),
    cors: allowedOrigins
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
  console.log(`🌐 CORS habilitado para:`, allowedOrigins);

  try {
    await testConnection();
    console.log('🟢 Conexión MySQL verificada correctamente.');
  } catch (error) {
    console.error('❌ Error en la conexión MySQL:', error.message);
  }
});