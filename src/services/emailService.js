import nodemailer from 'nodemailer';
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
// ✉️ CONFIGURAR TRANSPORTADOR SMTP (BREVO)
// =========================================================
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: '9aa523001@smtp-brevo.com', // tu usuario SMTP (lo ves en Brevo)
    pass: process.env.BREVO_API_KEY, // usa aquí tu xsmtpsib-... key
  },
});

// =========================================================
// 📧 ENVIAR CORREO CON SMTP
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center;">
          <h1>Recuperación de contraseña</h1>
        </div>
        <div style="padding: 30px; text-align: center;">
          <p>Tu código de recuperación es:</p>
          <div style="font-size: 28px; font-weight: bold; color: #667eea; margin: 20px 0;">
            ${code}
          </div>
          <p>Este código expira en 15 minutos.</p>
        </div>
        <div style="background: #f8f9fa; padding: 20px; font-size: 13px; color: #666; text-align: center;">
          © ${new Date().getFullYear()} NubStudio — No respondas a este mensaje.
        </div>
      </div>
    `;

    const mailOptions = {
      from: '"NubStudio" <gustavotubazo@gmail.com>',
      to: email,
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado:', info.messageId);
    return { success: true };

  } catch (error) {
    console.error('❌ Error al enviar correo:', error);
    throw new Error('No se pudo enviar el código por correo');
  }
};

// =========================================================
// 🧹 LIMPIEZA AUTOMÁTICA DE CÓDIGOS EXPIRADOS
// =========================================================
export const cleanupExpiredCodes = () => {
  console.log('🧹 Limpieza de códigos expirados ejecutada');
};
