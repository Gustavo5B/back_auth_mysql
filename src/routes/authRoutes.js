import express from 'express';
import { login, loginWith2FA } from '../controllers/authController.js';
import { register } from '../controllers/registerController.js';

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login-2fa", loginWith2FA);

export default router;