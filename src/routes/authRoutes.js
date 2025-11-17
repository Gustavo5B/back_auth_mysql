import express from 'express';
import { login, loginWith2FA, verifyLoginCode } from '../controllers/authController.js';
import { register, verifyEmail, resendVerificationCode } from '../controllers/registerController.js';

const router = express.Router();

// Rutas de registro
router.post("/register", register);
router.post("/verify-email", verifyEmail);              // ← NUEVO
router.post("/resend-code", resendVerificationCode);    // ← NUEVO

// Rutas de login
router.post("/login", login);
router.post("/login-2fa", loginWith2FA);
router.post("/verify-login-code", verifyLoginCode);

export default router;