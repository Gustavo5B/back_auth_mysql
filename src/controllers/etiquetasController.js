import { pool } from "../config/db.js";

const secureLog = {
  info: (message, metadata = {}) => {
    console.log(`ℹ️ ${message}`, Object.keys(metadata).length > 0 ? metadata : '');
  },
  error: (message, error) => {
    console.error(`❌ ${message}`, { name: error.name, code: error.code });
  }
};

// =========================================================
// 🏷️ LISTAR TODAS LAS ETIQUETAS ACTIVAS
// =========================================================
export const listarEtiquetas = async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id_etiqueta,
        e.nombre,
        e.slug,
        COUNT(oe.id_obra) AS total_obras
      FROM etiquetas e
      LEFT JOIN obras_etiquetas oe ON e.id_etiqueta = oe.id_etiqueta
      LEFT JOIN obras o ON oe.id_obra = o.id_obra AND o.activa = 1
      WHERE e.activa = 1
      GROUP BY e.id_etiqueta
      HAVING total_obras > 0
      ORDER BY total_obras DESC, e.nombre ASC
    `;

    const [etiquetas] = await pool.query(query);

    secureLog.info('Etiquetas listadas', { total: etiquetas.length });

    res.json({
      success: true,
      data: etiquetas
    });

  } catch (error) {
    secureLog.error('Error al listar etiquetas', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener las etiquetas" 
    });
  }
};

// =========================================================
// 🔍 OBTENER ETIQUETA POR SLUG
// =========================================================
export const obtenerEtiquetaPorSlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const query = `
      SELECT 
        e.id_etiqueta,
        e.nombre,
        e.slug,
        COUNT(oe.id_obra) AS total_obras
      FROM etiquetas e
      LEFT JOIN obras_etiquetas oe ON e.id_etiqueta = oe.id_etiqueta
      LEFT JOIN obras o ON oe.id_obra = o.id_obra AND o.activa = 1
      WHERE e.slug = ? AND e.activa = 1
      GROUP BY e.id_etiqueta
      LIMIT 1
    `;

    const [etiquetas] = await pool.query(query, [slug]);

    if (etiquetas.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Etiqueta no encontrada" 
      });
    }

    res.json({
      success: true,
      data: etiquetas[0]
    });

  } catch (error) {
    secureLog.error('Error al obtener etiqueta', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener la etiqueta" 
    });
  }
};