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
import { cleanupExpiredCodes, sendRecoveryCode, generateCode } from './services/emailService.js';

// =========================================================
// ⚙️ CONFIGURACIÓN INICIAL
// =========================================================
dotenv.config();
const app = express();

// =========================================================
// 🌐 CONFIGURACIÓN DE CORS
// =========================================================
const allowedOrigins = [
  'https://front-auth-two.vercel.app', // Producción
  'http://localhost:4200',             // Local
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

// =========================================================
// 🧩 MIDDLEWARES
// =========================================================
app.use(express.json());

// =========================================================
// 🚀 RUTAS PRINCIPALES
// =========================================================
app.use('/api/auth', authRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/2fa', twoFactorRoutes);

// =========================================================
// 🧪 RUTA DE PRUEBA DEL SERVIDOR
// =========================================================
app.get('/', (req, res) => {
  res.json({
    message: '✅ Backend AUTH activo y corriendo correctamente.',
    cors: allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// 🧪 RUTA DE PRUEBA DE EMAIL (BREVO)
// =========================================================
app.get('/api/test-email', async (req, res) => {
  try {
    const testEmail = 'tucorreo@gmail.com'; // 📧 cambia por el correo que quieras probar
    const code = generateCode();

    console.log(`📧 Probando envío de correo a ${testEmail} con código ${code}...`);
    await sendRecoveryCode(testEmail, code);

    res.json({
      message: `✅ Correo de prueba enviado correctamente a ${testEmail}`,
      code,
    });
  } catch (error) {
    console.error('❌ Error al enviar el correo de prueba:', error);
    res.status(500).json({
      message: 'Error al enviar correo de prueba',
      error: error.message,
    });
  }
});

// =========================================================
// 🕒 CRON JOB: Limpieza automática cada hora
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
