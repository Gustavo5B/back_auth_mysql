import express from "express";
import { 
  requestRecoveryCode, 
  validateRecoveryCode, 
  resetPassword 
} from "../controllers/recoveryController.js";

const router = express.Router();

router.post("/request-code", requestRecoveryCode);
router.post("/validate-code", validateRecoveryCode);
router.post("/reset-password", resetPassword);

export default router;