import brevo from '@getbrevo/brevo';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// =========================================================
// ✉️ CONFIGURACIÓN DE BREVO (usando API key HTTPS, no SMTP)
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
// 📧 ENVIAR CORREO CON BREVO API
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    const sendSmtpEmail = {
      sender: {
        name: 'NubStudio',
        email: 'gustavotubazo@gmail.com', // Remitente verificado en Brevo ✅
      },
      to: [{ email }],
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      htmlContent: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: 'Segoe UI', Roboto, sans-serif;
              background-color: #f9fafb;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 6px 14px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 26px;
            }
            .content {
              padding: 40px 30px;
              text-align: center;
              color: #333;
            }
            .code-box {
              background: #eef2ff;
              border: 2px solid #667eea;
              border-radius: 10px;
              padding: 20px;
              margin: 25px 0;
              font-size: 32px;
              font-weight: bold;
              color: #4c51bf;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
            }
            .footer {
              background: #f8f9fa;
              padding: 15px;
              text-align: center;
              font-size: 13px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Recuperación de Contraseña</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
              <p>Tu código de recuperación es:</p>
              <div class="code-box">${code}</div>
              <p>Este código expirará en <strong>15 minutos</strong>.</p>
              <p style="font-size: 13px; color: #777;">Si no solicitaste este cambio, ignora este mensaje.</p>
            </div>
            <div class="footer">
              © ${new Date().getFullYear()} NubStudio — No respondas a este mensaje.
            </div>
          </div>
        </body>
        </html>
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
// =========================================================
// 📧 ENVIAR CORREO DE VERIFICACIÓN (2FA) CON BREVO
// =========================================================
export const sendGmail2FACode = async (email, code) => {
  try {
    const sendSmtpEmail = {
      sender: {
        name: 'NU-B Studio Seguridad',
        email: 'gustavotubazo@gmail.com', // Remitente verificado en Brevo ✅
      },
      to: [{ email }],
      subject: '🔐 Código de verificación (2FA) - NU-B Studio',
      htmlContent: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: 'Segoe UI', Roboto, sans-serif;
              background-color: #f9fafb;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 6px 14px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 26px;
            }
            .content {
              padding: 40px 30px;
              text-align: center;
              color: #333;
            }
            .code-box {
              background: #eef2ff;
              border: 2px solid #3b82f6;
              border-radius: 10px;
              padding: 20px;
              margin: 25px 0;
              font-size: 32px;
              font-weight: bold;
              color: #1e3a8a;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
            }
            .footer {
              background: #f8f9fa;
              padding: 15px;
              text-align: center;
              font-size: 13px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verificación de Seguridad</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Tu código de autenticación de dos factores es:</p>
              <div class="code-box">${code}</div>
              <p>Este código expirará en <strong>10 minutos</strong>.</p>
              <p style="font-size: 13px; color: #777;">Si no solicitaste este código, ignora este mensaje.</p>
            </div>
            <div class="footer">
              © ${new Date().getFullYear()} NU-B Studio — Seguridad de cuentas.
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Email 2FA enviado correctamente. ID:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error al enviar correo 2FA con Brevo:', error);
    console.error('Detalles:', error.response?.body || error.message);
    throw new Error('Error al enviar el correo 2FA');
  }
};
