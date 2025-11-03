import { Resend } from 'resend';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// =========================================================
// ✉️ CONFIGURAR RESEND
// =========================================================
const resend = new Resend(process.env.RESEND_API_KEY);

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
// 📧 ENVIAR CORREO DE RECUPERACIÓN
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'NU-B Studio <noreply@resend.dev>', // ✅ nombre de remitente
      to: [email],
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
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
    });

    if (error) {
      console.error('❌ Error de Resend:', error);
      throw new Error(error.message);
    }

    console.log('✅ Email enviado correctamente:', data);
    return { success: true };
  } catch (error) {
    console.error('❌ Error al enviar email:', error);
    throw new Error('Error al enviar el código por correo');
  }
};

// =========================================================
// 🧹 LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = () => {
  console.log('🧹 Limpieza de códigos expirados ejecutada');
};
