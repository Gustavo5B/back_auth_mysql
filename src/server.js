import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import recoveryRoutes from './routes/recoveryRoutes.js';
import twoFactorRoutes from './routes/twoFactorRoutes.js';
import { testConnection } from './config/db.js';
import { cleanupExpiredCodes } from './services/emailService.js';

dotenv.config();
const app = express();

// =========================================================
// 🌐 CONFIGURACIÓN DE CORS
// =========================================================
const allowedOrigins = [
  'https://front-auth-two.vercel.app',
  'http://localhost:4200',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`🚫 Bloqueado por CORS: ${origin}`);
      return callback(new Error('Origen no permitido por CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// =========================================================
// 🧩 RUTAS
// =========================================================
app.use('/api/auth', authRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/2fa', twoFactorRoutes);

app.get('/', (req, res) => {
  res.json({
    message: '✅ Backend AUTH activo y corriendo correctamente.',
    cors: allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// ⏰ CRON (cada hora)
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
