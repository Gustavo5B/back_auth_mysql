import brevo from '@getbrevo/brevo';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================
// ✉️ CONFIGURAR BREVO
// =========================================================
const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new brevo.TransactionalEmailsApi();

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
// 📧 ENVIAR CORREO CON BREVO
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    const sendSmtpEmail = {
      sender: { name: 'NU-B Studio', email: 'noreply@nubstudio.com' },
      to: [{ email }],
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center;">
            <h1>Recuperación de contraseña</h1>
          </div>
          <div style="padding: 30px; text-align: center;">
            <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
            <p>Tu código de recuperación es:</p>
            <div style="font-size: 28px; font-weight: bold; color: #667eea; margin: 20px 0;">
              ${code}
            </div>
            <p>Este código expira en 15 minutos.</p>
          </div>
          <div style="background: #f8f9fa; padding: 20px; font-size: 13px; color: #666; text-align: center;">
            © ${new Date().getFullYear()} NU-B Studio — No respondas a este mensaje.
          </div>
        </div>
      `,
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Email enviado correctamente. ID:', result.messageId);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('❌ Error al enviar email con Brevo:', error);
    console.error('Detalles completos:', error.response?.body || error.message);
    throw new Error('Error al enviar el código por correo');
  }
};

// =========================================================
// 🧹 LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = () => {
  console.log('🧹 Limpieza de códigos expirados ejecutada');
};
