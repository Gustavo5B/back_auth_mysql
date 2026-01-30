// =========================================================
// 📸 CONFIGURACIÓN DE CLOUDINARY
// =========================================================
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// =========================================================
// 🔑 CONFIGURAR CREDENCIALES
// =========================================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// =========================================================
// 📁 CONFIGURAR STORAGE DE MULTER CON CLOUDINARY
// =========================================================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nub-studio/obras', // Carpeta en Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' }, // Redimensionar si es muy grande
      { quality: 'auto' } // Optimización automática
    ]
  }
});

// =========================================================
// 🛡️ CONFIGURAR MULTER
// =========================================================
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Máximo 5MB por imagen
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG, WEBP y GIF.'));
    }
  }
});

// =========================================================
// 🗑️ FUNCIÓN PARA ELIMINAR IMAGEN
// =========================================================
export const eliminarImagen = async (publicId) => {
  try {
    const resultado = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Imagen eliminada de Cloudinary:', resultado);
    return resultado;
  } catch (error) {
    console.error('❌ Error al eliminar imagen:', error);
    throw error;
  }
};

// =========================================================
// 📤 EXPORTAR
// =========================================================
export { cloudinary, upload };