import express from 'express';
import cron from 'node-cron';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import recoveryRoutes from './routes/recoveryRoutes.js';
import twoFactorRoutes from './routes/twoFactorRoutes.js'; // ⚠️ Esta línea debe existir
import { testConnection } from './config/db.js';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
// ✅ TODAS estas rutas deben estar registradas
app.use('/api/auth', authRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/2fa', twoFactorRoutes); // ⚠️ ESTA ES LA QUE FALTA
// Registrar las rutas
const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  await testConnection();
});
// Ejecutar cada hora
cron.schedule('0 * * * *', () => {
  console.log('🧹 Ejecutando limpieza de códigos expirados...');
  cleanupExpiredCodes();
});