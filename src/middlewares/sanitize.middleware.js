// =========================================================
// 🛡️ MIDDLEWARE DE SANITIZACIÓN CONTRA XSS
// =========================================================

/**
 * Detecta patrones XSS peligrosos
 */
const detectXSS = (value) => {
  if (typeof value !== 'string') return false;
  
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick=, onerror=, onload=, etc.
    /<img[^>]+src[\s]*=[\s]*[\"\'][\s]*javascript:/gi,
    /eval\(/gi,
    /expression\(/gi,
    /<svg[\s\S]*?on\w+/gi,
    /vbscript:/gi,
    /data:text\/html/gi
  ];
  
  return xssPatterns.some(pattern => pattern.test(value));
};

/**
 * Sanitiza un string removiendo caracteres peligrosos
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/</g, '&lt;')   // < a &lt;
    .replace(/>/g, '&gt;')   // > a &gt;
    .replace(/"/g, '&quot;') // " a &quot;
    .replace(/'/g, '&#x27;') // ' a &#x27;
    .replace(/\//g, '&#x2F;') // / a &#x2F;
    .trim();
};

/**
 * Sanitiza recursivamente un objeto
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key]);
    } else if (typeof obj[key] === 'string') {
      sanitized[key] = sanitizeString(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  
  return sanitized;
};

/**
 * Middleware principal - NO sanitiza, solo DETECTA y RECHAZA
 */
export const sanitizeInput = (req, res, next) => {
  try {
    // Verificar XSS en body
    if (req.body) {
      for (const key in req.body) {
        if (detectXSS(req.body[key])) {
          console.log(`🚫 XSS detectado en body.${key}:`, req.body[key].substring(0, 100));
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectó contenido potencialmente malicioso en la solicitud',
            code: 'XSS_DETECTED',
            field: key
          });
        }
      }
    }
    
    // Verificar XSS en query params
    if (req.query) {
      for (const key in req.query) {
        if (detectXSS(req.query[key])) {
          console.log(`🚫 XSS detectado en query.${key}`);
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectó contenido potencialmente malicioso en los parámetros',
            code: 'XSS_DETECTED',
            field: key
          });
        }
      }
    }
    
    // Verificar XSS en params de ruta
    if (req.params) {
      for (const key in req.params) {
        if (detectXSS(req.params[key])) {
          console.log(`🚫 XSS detectado en params.${key}`);
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectó contenido potencialmente malicioso en la ruta',
            code: 'XSS_DETECTED',
            field: key
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error en sanitización:', error);
    return res.status(500).json({
      error: 'Error interno',
      message: 'Error al procesar la solicitud'
    });
  }
};

/**
 * Exportar funciones individuales para uso manual
 */
export { detectXSS, sanitizeString, sanitizeObject };