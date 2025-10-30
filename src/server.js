import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Rutas
import authRoutes from './routes/authRoutes.js';
import twoFactorRoutes from './routes/twoFactorRoutes.js';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas base
app.use("/api/auth", authRoutes);
app.use("/api/2fa", twoFactorRoutes);

// Servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
