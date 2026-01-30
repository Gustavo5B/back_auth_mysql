// =========================================================
// 📋 VALIDADORES PARA BACKEND - NU-B STUDIO
// =========================================================
// Validaciones usando express-validator
// Instalar: npm install express-validator
// =========================================================

import { body, param, query, validationResult } from 'express-validator';

// =========================================================
// 🔧 MIDDLEWARE PARA MANEJAR ERRORES DE VALIDACIÓN
// =========================================================
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Errores de validación',
      errors: errors.array().map(err => ({
        campo: err.path,
        mensaje: err.msg,
        valor_recibido: err.value
      }))
    });
  }
  
  next();
};

// =========================================================
// 👤 VALIDACIONES DE USUARIO (REGISTRO/LOGIN)
// =========================================================

export const validarRegistro = [
  body('nombre_completo')
    .trim()
    .notEmpty().withMessage('El nombre completo es obligatorio')
    .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios'),

  body('correo')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('El formato del correo electrónico no es válido')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('El correo no puede exceder 100 caracteres'),

  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('La contraseña debe contener al menos una letra mayúscula')
    .matches(/[a-z]/).withMessage('La contraseña debe contener al menos una letra minúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe contener al menos un número')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('La contraseña debe contener al menos un símbolo (!@#$%^&*...)'),

  body('telefono')
    .optional()
    .trim()
    .matches(/^[0-9]{10}$/).withMessage('El teléfono debe tener exactamente 10 números'),

  handleValidationErrors
];

export const validarLogin = [
  body('correo')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('El formato del correo electrónico no es válido')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria'),

  handleValidationErrors
];

// =========================================================
// 🎨 VALIDACIONES DE OBRAS
// =========================================================

export const validarCrearObra = [
  body('titulo')
    .trim()
    .notEmpty().withMessage('El título es obligatorio')
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),

  body('descripcion')
    .trim()
    .notEmpty().withMessage('La descripción es obligatoria')
    .isLength({ min: 10, max: 1000 }).withMessage('La descripción debe tener entre 10 y 1000 caracteres'),

  body('id_artista')
    .notEmpty().withMessage('El ID del artista es obligatorio')
    .isInt({ min: 1 }).withMessage('El ID del artista debe ser un número válido'),

  body('id_categoria')
    .notEmpty().withMessage('El ID de la categoría es obligatorio')
    .isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número válido'),

  body('anio_creacion')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage(`El año de creación debe estar entre 1900 y ${new Date().getFullYear()}`),

  body('tecnica')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('La técnica no puede exceder 100 caracteres'),

  body('imagen_principal')
    .notEmpty().withMessage('La imagen principal es obligatoria')
    .isURL().withMessage('La imagen principal debe ser una URL válida'),

  body('destacada')
    .optional()
    .isBoolean().withMessage('El campo destacada debe ser verdadero o falso'),

  handleValidationErrors
];

export const validarActualizarObra = [
  param('id')
    .isInt({ min: 1 }).withMessage('El ID de la obra debe ser un número válido'),

  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('El título debe tener entre 3 y 200 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 }).withMessage('La descripción debe tener entre 10 y 1000 caracteres'),

  body('id_categoria')
    .optional()
    .isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número válido'),

  body('anio_creacion')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage(`El año debe estar entre 1900 y ${new Date().getFullYear()}`),

  handleValidationErrors
];

// =========================================================
// 💰 VALIDACIONES DE PRECIOS Y TAMAÑOS
// =========================================================

export const validarPrecioTamaño = [
  body('id_obra')
    .notEmpty().withMessage('El ID de la obra es obligatorio')
    .isInt({ min: 1 }).withMessage('El ID de la obra debe ser un número válido'),

  body('id_tamaño')
    .notEmpty().withMessage('El ID del tamaño es obligatorio')
    .isInt({ min: 1 }).withMessage('El ID del tamaño debe ser un número válido'),

  body('precio_base')
    .notEmpty().withMessage('El precio base es obligatorio')
    .isFloat({ min: 0.01 }).withMessage('El precio base debe ser mayor a 0')
    .custom((value) => {
      if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        throw new Error('El precio debe tener máximo 2 decimales');
      }
      return true;
    }),

  body('cantidad_disponible')
    .notEmpty().withMessage('La cantidad disponible es obligatoria')
    .isInt({ min: 0 }).withMessage('La cantidad debe ser un número entero mayor o igual a 0'),

  handleValidationErrors
];

// =========================================================
// 👨‍🎨 VALIDACIONES DE ARTISTAS
// =========================================================

export const validarCrearArtista = [
  body('nombre_completo')
    .trim()
    .notEmpty().withMessage('El nombre completo es obligatorio')
    .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres'),

  body('nombre_artistico')
    .trim()
    .notEmpty().withMessage('El nombre artístico es obligatorio')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre artístico debe tener entre 2 y 100 caracteres'),

  body('correo')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('El formato del correo electrónico no es válido')
    .normalizeEmail(),

  body('telefono')
    .optional()
    .trim()
    .matches(/^[0-9]{10}$/).withMessage('El teléfono debe tener exactamente 10 números'),

  body('porcentaje_comision')
    .notEmpty().withMessage('El porcentaje de comisión es obligatorio')
    .isFloat({ min: 0, max: 100 }).withMessage('El porcentaje debe estar entre 0 y 100')
    .custom((value) => {
      if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        throw new Error('El porcentaje debe tener máximo 2 decimales');
      }
      return true;
    }),

  body('biografia')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('La biografía no puede exceder 1000 caracteres'),

  handleValidationErrors
];

// =========================================================
// 📂 VALIDACIONES DE CATEGORÍAS
// =========================================================

export const validarCrearCategoria = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre de la categoría es obligatorio')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('La descripción no puede exceder 500 caracteres'),

  body('icono')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('El icono no puede exceder 50 caracteres'),

  handleValidationErrors
];

// =========================================================
// 🔍 VALIDACIONES DE BÚSQUEDA Y FILTROS
// =========================================================

export const validarBusqueda = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El término de búsqueda debe tener entre 2 y 100 caracteres')
    .matches(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-]+$/).withMessage('El término de búsqueda contiene caracteres no válidos'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('El número de página debe ser mayor a 0'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),

  query('precio_min')
    .optional()
    .isFloat({ min: 0 }).withMessage('El precio mínimo debe ser mayor o igual a 0'),

  query('precio_max')
    .optional()
    .isFloat({ min: 0 }).withMessage('El precio máximo debe ser mayor o igual a 0')
    .custom((value, { req }) => {
      if (req.query.precio_min && parseFloat(value) < parseFloat(req.query.precio_min)) {
        throw new Error('El precio máximo debe ser mayor al precio mínimo');
      }
      return true;
    }),

  handleValidationErrors
];

// =========================================================
// 🆔 VALIDACIONES DE PARÁMETROS
// =========================================================

export const validarIdObra = [
  param('id')
    .isInt({ min: 1 }).withMessage('El ID de la obra debe ser un número válido mayor a 0'),
  handleValidationErrors
];

export const validarIdArtista = [
  param('id')
    .isInt({ min: 1 }).withMessage('El ID del artista debe ser un número válido mayor a 0'),
  handleValidationErrors
];

export const validarIdCategoria = [
  param('id')
    .isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número válido mayor a 0'),
  handleValidationErrors
];

export const validarSlug = [
  param('slug')
    .trim()
    .notEmpty().withMessage('El slug es obligatorio')
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('El formato del slug no es válido (solo minúsculas, números y guiones)'),
  handleValidationErrors
];

// =========================================================
// 🔐 VALIDACIONES DE RECUPERACIÓN DE CONTRASEÑA
// =========================================================

export const validarSolicitudRecuperacion = [
  body('correo')
    .trim()
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('El formato del correo electrónico no es válido')
    .normalizeEmail(),
  handleValidationErrors
];

export const validarRestablecerPassword = [
  body('codigo')
    .trim()
    .notEmpty().withMessage('El código de recuperación es obligatorio')
    .isLength({ min: 6, max: 6 }).withMessage('El código debe tener 6 caracteres')
    .matches(/^[0-9]{6}$/).withMessage('El código debe contener solo números'),

  body('nueva_password')
    .notEmpty().withMessage('La nueva contraseña es obligatoria')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('La contraseña debe contener al menos una letra mayúscula')
    .matches(/[a-z]/).withMessage('La contraseña debe contener al menos una letra minúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe contener al menos un número')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('La contraseña debe contener al menos un símbolo'),

  handleValidationErrors
];

// =========================================================
// 🔐 VALIDACIONES DE 2FA
// =========================================================

export const validarCodigo2FA = [
  body('codigo')
    .trim()
    .notEmpty().withMessage('El código 2FA es obligatorio')
    .isLength({ min: 6, max: 6 }).withMessage('El código debe tener 6 caracteres')
    .matches(/^[0-9]{6}$/).withMessage('El código debe contener solo números'),
  handleValidationErrors
];