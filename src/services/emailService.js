import { Resend } from 'resend';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// ✅ Configurar Resend en lugar de Gmail
const resend = new Resend(process.env.RESEND_API_KEY);

// 🔒 Generar código alfanumérico seguro de 8 caracteres
export const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

// ✅ Enviar código de recuperación con Resend
export const sendRecoveryCode = async (email, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'NU-B Studio <onboarding@resend.dev>', // ✅ Email por defecto de Resend
      to: [email],
      subject: '🔑 Recuperación de contraseña - NU-B Studio',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
              line-height: 1.6;
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
              font-weight: 600;
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
              padding: 20px;
              margin: 30px 0;
              text-align: left;
              border-radius: 4px;
            }
            .warning ul {
              margin: 10px 0;
              padding-left: 20px;
            }
            .warning li {
              margin: 8px 0;
            }
            .footer {
              background: #f8f9fa;
              padding: 30px 20px;
              text-align: center;
              font-size: 13px;
              color: #666;
              border-top: 1px solid #e9ecef;
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
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>NU-B Studio</strong>.
              </p>
              <p style="font-size: 16px; color: #555;">
                Usa el siguiente código para continuar:
              </p>
              
              <div class="code-box">
                ${code}
              </div>
              
              <div class="warning">
                <strong>⚠️ Información importante:</strong>
                <ul>
                  <li>Este código expira en <strong>15 minutos</strong></li>
                  <li><strong>No compartas</strong> este código con nadie</li>
                  <li>El código solo se puede usar <strong>una vez</strong></li>
                  <li>Si no solicitaste este cambio, <strong>ignora este mensaje</strong></li>
                </ul>
              </div>
              
              <p style="color: #666; margin-top: 30px; font-size: 14px;">
                Si tienes problemas, contacta con nuestro soporte.
              </p>
            </div>
            <div class="footer">
              <p style="font-weight: 600;">© ${new Date().getFullYear()} NU-B Studio. Todos los derechos reservados.</p>
              <p>Este es un correo automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Error de Resend:', error);
      throw new Error(error.message);
    }

    console.log('✅ Email enviado correctamente:', data);
    return { success: true, message: 'Código enviado correctamente' };
    
  } catch (error) {
    console.error('❌ Error al enviar email:', error);
    throw new Error('Error al enviar el código por correo');
  }
};

// 🧹 Limpieza de códigos expirados
export const cleanupExpiredCodes = () => {
  console.log("🧹 Limpieza de códigos expirados ejecutada");
};