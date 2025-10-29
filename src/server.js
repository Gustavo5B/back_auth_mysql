import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import twoFactorRoutes from './routes/twoFactorRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/2fa", twoFactorRoutes);

app.listen(process.env.PORT || 4000, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${process.env.PORT || 4000}`);
});