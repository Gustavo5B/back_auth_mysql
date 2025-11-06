import express from "express";
import {
  configurarGmail2FA,
  verificarGmail2FA,
  enviarCodigoLoginGmail,
  verificarCodigoLoginGmail,
} from "../controllers/gmail2faController.js";

const router = express.Router();

router.post("/configurar", configurarGmail2FA);
router.post("/verificar", verificarGmail2FA);
//router.post("/send-login-code", enviarCodigoLoginGmail);
//router.post("/verify-login-code", verificarCodigoLoginGmail);
// ✅ LOGIN CON GMAIL 2FA (CORREGIDO)
router.post("/enviar-codigo-login", enviarCodigoLoginGmail);        // ⬅️ CAMBIADO
router.post("/verificar-codigo-login", verificarCodigoLoginGmail);  // ⬅️ CAMBIADO
export default router;
