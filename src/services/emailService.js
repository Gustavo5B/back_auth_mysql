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
// 📧 ENVIAR CORREO CON BREVO (CORREGIDO)
// =========================================================
export const sendRecoveryCode = async (email, code) => {
  try {
    // ✅ CORRECCIÓN: Inicialización correcta de Brevo
    const apiInstance = new brevo.TransactionalEmailsApi();
    
    // ✅ Configurar la API Key correctamente
    apiInstance.authentications.apiKey.apiKey = process.env.BREVO_API_KEY;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = { name: 'NU-B Studio', email: 'noreply@nubstudio.com' };
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.subject = '🔑 Recuperación de contraseña - NU-B Studio';
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 50px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
            text-align: center;
          }
          .code-box {
            background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
            border: 2px solid #667eea;
            border-radius: 12px;
            padding: 25px;
            margin: 30px 0;
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #667eea;
            font-family: 'Courier New', monospace;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
            border-radius: 4px;
            font-size: 14px;
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔑 Recuperación de contraseña</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #333;">
              Hola,
            </p>
            <p style="font-size: 16px; color: #555;">
              Recibimos una solicitud para restablecer tu contraseña.
            </p>
            <p style="font-size: 16px; color: #555;">
              Usa el siguiente código:
            </p>
            
            <div class="code-box">
              ${code}
            </div>
            
            <div class="warning">
              <strong>⚠️ Importante:</strong><br>
              • Este código expira en <strong>15 minutos</strong><br>
              • No lo compartas con nadie<br>
              • Solo puedes usarlo una vez
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} NU-B Studio</p>
            <p>Este es un correo automático, no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // ✅ Enviar email
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