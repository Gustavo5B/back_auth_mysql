import express from 'express';
import { setupTOTP, verifyTOTP, validateTOTP } from '../controllers/twoFactorController.js';

const router = express.Router();

router.post('/setup-totp', setupTOTP);
router.post('/verify-totp', verifyTOTP);
router.post('/validate-totp', validateTOTP);

export default router;