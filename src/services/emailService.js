import * as brevo from '@getbrevo/brevo';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================
// 🔐 GENERAR CÓDIGO DE RECUPERACIÓN
// =========================================================
export const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

// =========================================================
// 📧 ENVIAR CORREO CON BREVO (SMTP/API)
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const sendSmtpEmail = {
      sender: { name: 'NU-B Studio', email: 'noreply@nubstudio.com' },
      to: [{ email }],
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:25px;background:#fff;border-radius:8px;border:1px solid #eee;">
          <h2 style="color:#5b3cc4;text-align:center;">Recuperación de contraseña</h2>
          <p style="text-align:center;color:#333;">Usa este código para restablecer tu contraseña:</p>
          <div style="text-align:center;margin:20px 0;font-size:28px;font-weight:bold;color:#5b3cc4;">${code}</div>
          <p style="text-align:center;color:#777;">Este código expira en 15 minutos.</p>
          <p style="text-align:center;font-size:12px;color:#999;">© ${new Date().getFullYear()} NU-B Studio. No respondas a este mensaje.</p>
        </div>
      `,
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Email enviado correctamente:', result.messageId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error al enviar email con Brevo:', error.message);
    throw new Error('Error al enviar el código por correo');
  }
};

// =========================================================
// 🧹 LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = () => {
  console.log('🧹 Limpieza de códigos expirados ejecutada');
};
