// =========================================================
// 💉 MIDDLEWARE DE PROTECCIÓN CONTRA SQL INJECTION
// =========================================================

/**
 * Detecta patrones típicos de SQL Injection
 */
const detectSQLInjection = (value) => {
  if (typeof value !== 'string') return false;
  
  const sqlPatterns = [
    // Palabras clave SQL
    /(\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    
    // Patrones de inyección comunes
    /'(\s)*(OR|AND)(\s)*'?\d/gi,
    /'(\s)*(OR|AND)(\s)*'?'(\s)*=/gi,
    /'(\s)*OR(\s)*'1'(\s)*=(\s)*'1/gi,
    /'(\s)*OR(\s)*1(\s)*=(\s)*1/gi,
    
    // Comentarios SQL
    /--/g,
    /\/\*/g,
    /\*\//g,
    /#/g,
    
    // Comandos peligrosos
    /;(\s)*(DROP|DELETE|INSERT|UPDATE)/gi,
    /xp_/gi,  // Procedimientos SQL Server
    /sp_/gi,
    
    // Funciones de tiempo (blind SQL injection)
    /WAITFOR(\s)+DELAY/gi,
    /BENCHMARK/gi,
    /SLEEP\(/gi,
    /pg_sleep/gi,
    
    // Otros patrones
    /INFORMATION_SCHEMA/gi,
    /LOAD_FILE/gi,
    /INTO(\s)+OUTFILE/gi,
    /INTO(\s)+DUMPFILE/gi
  ];
  
  return sqlPatterns.some(pattern => pattern.test(value));
};

/**
 * Middleware principal
 */
export const preventSQLInjection = (req, res, next) => {
  try {
    // Verificar body
    if (req.body) {
      for (const key in req.body) {
        if (detectSQLInjection(req.body[key])) {
          console.log(`🚫 SQL Injection detectado en body.${key}:`, req.body[key]);
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectaron patrones sospechosos en la solicitud',
            code: 'SQL_INJECTION_DETECTED',
            field: key
          });
        }
      }
    }
    
    // Verificar query params
    if (req.query) {
      for (const key in req.query) {
        if (detectSQLInjection(req.query[key])) {
          console.log(`🚫 SQL Injection detectado en query.${key}`);
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectaron patrones sospechosos en los parámetros',
            code: 'SQL_INJECTION_DETECTED',
            field: key
          });
        }
      }
    }
    
    // Verificar params de ruta
    if (req.params) {
      for (const key in req.params) {
        if (detectSQLInjection(req.params[key])) {
          console.log(`🚫 SQL Injection detectado en params.${key}`);
          return res.status(400).json({
            error: 'Solicitud rechazada',
            message: 'Se detectaron patrones sospechosos en la ruta',
            code: 'SQL_INJECTION_DETECTED',
            field: key
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error en validación SQL:', error);
    return res.status(500).json({
      error: 'Error interno',
      message: 'Error al procesar la solicitud'
    });
  }
};

export { detectSQLInjection };