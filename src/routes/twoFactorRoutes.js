import express from 'express';
import { setupTOTP, verifyTOTP, validateTOTP } from '../controllers/twoFactorController.js';

const router = express.Router();

console.log('🔧 [2FA ROUTES] Cargando rutas de 2FA...');

// Middleware de debug para ver todas las requests
router.use((req, res, next) => {
  console.log(`🔍 [2FA] ${req.method} ${req.path}`);
  next();
});

router.post('/setup-totp', (req, res, next) => {
  console.log('📍 Ruta /setup-totp llamada');
  setupTOTP(req, res, next);
});

router.post('/verify-totp', (req, res, next) => {
  console.log('📍 Ruta /verify-totp llamada');
  verifyTOTP(req, res, next);
});

router.post('/validate-totp', (req, res, next) => {
  console.log('📍 Ruta /validate-totp llamada');
  validateTOTP(req, res, next);
});

console.log('✅ [2FA ROUTES] Rutas 2FA registradas:');
console.log('   POST /api/2fa/setup-totp');
console.log('   POST /api/2fa/verify-totp');
console.log('   POST /api/2fa/validate-totp');

export default router;