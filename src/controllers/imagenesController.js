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

    // ✅ POSTGRESQL
    // Actualizar obra con nueva imagen
    await pool.query(
      'UPDATE obras SET imagen_principal = $1 WHERE id_obra = $2',
      [imageUrl, id_obra]
    );

    // También actualizar en imagenes_obras si existe
    const imagenExistente = await pool.query(
      'SELECT id_imagen FROM imagenes_obras WHERE id_obra = $1 AND es_principal = TRUE',
      [id_obra]
    );

    if (imagenExistente.rows.length > 0) {
      await pool.query(
        'UPDATE imagenes_obras SET url_imagen = $1 WHERE id_imagen = $2',
        [imageUrl, imagenExistente.rows[0].id_imagen]
      );
    } else {
      await pool.query(
        'INSERT INTO imagenes_obras (id_obra, url_imagen, orden, es_principal, activa) VALUES ($1, $2, 1, TRUE, TRUE)',
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

    // ✅ POSTGRESQL - COALESCE
    // Obtener el último orden
    const maxOrden = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) as max_orden FROM imagenes_obras WHERE id_obra = $1',
      [id_obra]
    );

    let ordenInicial = maxOrden.rows[0].max_orden + 1;
    const imagenesSubidas = [];

    // Insertar cada imagen
    for (const file of req.files) {
      await pool.query(
        'INSERT INTO imagenes_obras (id_obra, url_imagen, orden, es_principal, activa) VALUES ($1, $2, $3, FALSE, TRUE)',
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

    // ✅ POSTGRESQL
    // Obtener datos de la imagen
    const imagen = await pool.query(
      'SELECT url_imagen, es_principal FROM imagenes_obras WHERE id_imagen = $1',
      [id_imagen]
    );

    if (imagen.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Imagen no encontrada'
      });
    }

    if (imagen.rows[0].es_principal) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la imagen principal. Primero asigna otra imagen como principal.'
      });
    }

    // Extraer public_id de Cloudinary
    const urlParts = imagen.rows[0].url_imagen.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = `nub-studio/obras/${filename.split('.')[0]}`;

    // Eliminar de Cloudinary
    await eliminarImagen(publicId);

    // Eliminar de BD
    await pool.query('DELETE FROM imagenes_obras WHERE id_imagen = $1', [id_imagen]);

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

    // ✅ POSTGRESQL
    // Actualizar orden de cada imagen
    for (let i = 0; i < ordenNuevo.length; i++) {
      await pool.query(
        'UPDATE imagenes_obras SET orden = $1 WHERE id_imagen = $2 AND id_obra = $3',
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