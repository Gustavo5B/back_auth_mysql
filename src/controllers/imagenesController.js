import { pool } from "../config/db.js";
import { eliminarImagen } from "../config/cloudinaryConfig.js";

const secureLog = {
  info: (message, metadata = {}) => {
    console.log(`ℹ️ ${message}`, Object.keys(metadata).length > 0 ? metadata : '');
  },
  error: (message, error) => {
    console.error(`❌ ${message}`, { name: error.name, code: error.code });
  }
};

// =========================================================
// 📸 SUBIR IMAGEN PRINCIPAL DE OBRA
// =========================================================
export const subirImagenPrincipal = async (req, res) => {
  try {
    const { id_obra } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    if (!id_obra) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la obra es obligatorio'
      });
    }

    // Obtener URL de Cloudinary
    const imageUrl = req.file.path;
    const publicId = req.file.public_id;

    // Actualizar obra con nueva imagen
    await pool.query(
      'UPDATE obras SET imagen_principal = ? WHERE id_obra = ?',
      [imageUrl, id_obra]
    );

    // También actualizar en imagenes_obras si existe
    const [imagenExistente] = await pool.query(
      'SELECT id_imagen FROM imagenes_obras WHERE id_obra = ? AND es_principal = 1',
      [id_obra]
    );

    if (imagenExistente.length > 0) {
      await pool.query(
        'UPDATE imagenes_obras SET url_imagen = ? WHERE id_imagen = ?',
        [imageUrl, imagenExistente[0].id_imagen]
      );
    } else {
      await pool.query(
        'INSERT INTO imagenes_obras (id_obra, url_imagen, orden, es_principal, activa) VALUES (?, ?, 1, 1, 1)',
        [id_obra, imageUrl]
      );
    }

    secureLog.info('Imagen principal subida', { id_obra, publicId });

    res.json({
      success: true,
      message: 'Imagen subida exitosamente',
      data: {
        url: imageUrl,
        publicId: publicId
      }
    });

  } catch (error) {
    secureLog.error('Error al subir imagen principal', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen'
    });
  }
};

// =========================================================
// 🖼️ SUBIR MÚLTIPLES IMÁGENES (GALERÍA)
// =========================================================
export const subirImagenesGaleria = async (req, res) => {
  try {
    const { id_obra } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron imágenes'
      });
    }

    if (!id_obra) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la obra es obligatorio'
      });
    }

    // Obtener el último orden
    const [maxOrden] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) as max_orden FROM imagenes_obras WHERE id_obra = ?',
      [id_obra]
    );

    let ordenInicial = maxOrden[0].max_orden + 1;
    const imagenesSubidas = [];

    // Insertar cada imagen
    for (const file of req.files) {
      await pool.query(
        'INSERT INTO imagenes_obras (id_obra, url_imagen, orden, es_principal, activa) VALUES (?, ?, ?, 0, 1)',
        [id_obra, file.path, ordenInicial]
      );

      imagenesSubidas.push({
        url: file.path,
        publicId: file.filename,
        orden: ordenInicial
      });

      ordenInicial++;
    }

    secureLog.info('Imágenes de galería subidas', { id_obra, cantidad: req.files.length });

    res.json({
      success: true,
      message: `${req.files.length} imagen(es) subida(s) exitosamente`,
      data: imagenesSubidas
    });

  } catch (error) {
    secureLog.error('Error al subir imágenes de galería', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir las imágenes'
    });
  }
};

// =========================================================
// 🗑️ ELIMINAR IMAGEN
// =========================================================
export const eliminarImagenObra = async (req, res) => {
  try {
    const { id_imagen } = req.params;

    // Obtener datos de la imagen
    const [imagen] = await pool.query(
      'SELECT url_imagen, es_principal FROM imagenes_obras WHERE id_imagen = ?',
      [id_imagen]
    );

    if (imagen.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Imagen no encontrada'
      });
    }

    if (imagen[0].es_principal) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la imagen principal. Primero asigna otra imagen como principal.'
      });
    }

    // Extraer public_id de Cloudinary
    const urlParts = imagen[0].url_imagen.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = `nub-studio/obras/${filename.split('.')[0]}`;

    // Eliminar de Cloudinary
    await eliminarImagen(publicId);

    // Eliminar de BD
    await pool.query('DELETE FROM imagenes_obras WHERE id_imagen = ?', [id_imagen]);

    secureLog.info('Imagen eliminada', { id_imagen, publicId });

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente'
    });

  } catch (error) {
    secureLog.error('Error al eliminar imagen', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la imagen'
    });
  }
};

// =========================================================
// 🔄 REORDENAR IMÁGENES
// =========================================================
export const reordenarImagenes = async (req, res) => {
  try {
    const { id_obra, ordenNuevo } = req.body;
    // ordenNuevo es un array de IDs en el orden deseado: [3, 1, 5, 2]

    if (!id_obra || !ordenNuevo || !Array.isArray(ordenNuevo)) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos'
      });
    }

    // Actualizar orden de cada imagen
    for (let i = 0; i < ordenNuevo.length; i++) {
      await pool.query(
        'UPDATE imagenes_obras SET orden = ? WHERE id_imagen = ? AND id_obra = ?',
        [i + 1, ordenNuevo[i], id_obra]
      );
    }

    secureLog.info('Imágenes reordenadas', { id_obra });

    res.json({
      success: true,
      message: 'Imágenes reordenadas exitosamente'
    });

  } catch (error) {
    secureLog.error('Error al reordenar imágenes', error);
    res.status(500).json({
      success: false,
      message: 'Error al reordenar imágenes'
    });
  }
};