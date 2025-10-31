import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Configurar transporter de Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// 🔒 Generar código alfanumérico seguro de 8 caracteres
export const generateCode = () => {
  // Usa crypto.randomBytes para mayor seguridad
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres confusos (0,O,1,I)
  const bytes = crypto.randomBytes(8);
  
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  
  // Formato: XXXX-XXXX para legibilidad
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

// Enviar código de recuperación por email
export const sendRecoveryCode = async (email, code) => {
  const mailOptions = {
    from: `"NU-B Studio" <${process.env.EMAIL_USER}>`,
    to: email,
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
          .security-notice {
            background: #f8f9fa;
            border-left: 4px solid #6c757d;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
            font-size: 14px;
            color: #666;
            border-radius: 4px;
          }
          .footer {
            background: #f8f9fa;
            padding: 30px 20px;
            text-align: center;
            font-size: 13px;
            color: #666;
            border-top: 1px solid #e9ecef;
          }
          .footer p {
            margin: 5px 0;
          }
          .btn {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔑 Recuperación de contraseña</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #333; margin-bottom: 10px;">
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

            <div class="security-notice">
              <strong>🔒 Consejo de seguridad:</strong><br>
              Nunca compartas tus códigos de seguridad por teléfono, email o mensajes. 
              NU-B Studio nunca te pedirá tus códigos de acceso.
            </div>
            
            <p style="color: #666; margin-top: 30px; font-size: 14px;">
              Si tienes problemas o no solicitaste este cambio, contacta con nuestro soporte inmediatamente.
            </p>
          </div>
          <div class="footer">
            <p style="font-weight: 600;">© ${new Date().getFullYear()} NU-B Studio. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas.</p>
            <p style="margin-top: 15px; font-size: 12px;">
              Si no reconoces esta actividad, tu cuenta puede estar en riesgo. Cambia tu contraseña inmediatamente.
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Código enviado correctamente' };
  } catch (error) {
    console.error('❌ Error al enviar email:', error);
    throw new Error('Error al enviar el código por correo');
  }
};