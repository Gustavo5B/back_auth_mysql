import { pool } from "../config/db.js";

// =========================================================
// 🔒 LOGGER SEGURO
// =========================================================
const secureLog = {
  info: (message, metadata = {}) => {
    console.log(`ℹ️ ${message}`, Object.keys(metadata).length > 0 ? metadata : '');
  },
  
  error: (message, error) => {
    console.error(`❌ ${message}`, {
      name: error.name,
      code: error.code
    });
  }
};

// =========================================================
// 📚 LISTAR TODAS LAS CATEGORÍAS
// =========================================================
export const listarCategorias = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id_categoria,
        c.nombre,
        c.descripcion,
        c.slug,
        c.icono,
        COUNT(o.id_obra) AS total_obras
      FROM categorias c
      LEFT JOIN obras o ON c.id_categoria = o.id_categoria AND o.activa = TRUE
      WHERE c.activa = TRUE
      GROUP BY c.id_categoria
      ORDER BY c.nombre ASC
    `;

    const result = await pool.query(query);
    const categorias = result.rows;

    secureLog.info('Categorías listadas', { total: categorias.length });

    res.json({
      success: true,
      data: categorias
    });

  } catch (error) {
    secureLog.error('Error al listar categorías', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener las categorías" 
    });
  }
};

// =========================================================
// 🔍 OBTENER DETALLE DE UNA CATEGORÍA
// =========================================================
export const obtenerCategoriaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ INFORMACIÓN DE LA CATEGORÍA
    const queryCat = `
      SELECT 
        c.*,
        COUNT(o.id_obra) AS total_obras
      FROM categorias c
      LEFT JOIN obras o ON c.id_categoria = o.id_categoria AND o.activa = TRUE
      WHERE c.id_categoria = $1 AND c.activa = TRUE
      GROUP BY c.id_categoria
      LIMIT 1
    `;

    const resultCat = await pool.query(queryCat, [id]);

    if (resultCat.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Categoría no encontrada" 
      });
    }

    const categoria = resultCat.rows[0];

    // 2️⃣ OBRAS DE ESTA CATEGORÍA (primeras 12)
    const queryObras = `
      SELECT 
        o.id_obra,
        o.titulo,
        o.slug,
        o.imagen_principal,
        a.nombre_artistico AS artista_alias,
        MIN(ot.precio_base) AS precio_minimo
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE o.id_categoria = $1 AND o.activa = TRUE
      GROUP BY o.id_obra, a.nombre_artistico
      ORDER BY o.fecha_creacion DESC
      LIMIT 12
    `;

    const resultObras = await pool.query(queryObras, [id]);
    const obras = resultObras.rows;

    res.json({
      success: true,
      data: {
        ...categoria,
        obras
      }
    });

  } catch (error) {
    secureLog.error('Error al obtener categoría', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener la categoría" 
    });
  }
};

// =========================================================
// 🔍 OBTENER CATEGORÍA POR SLUG
// =========================================================
export const obtenerCategoriaPorSlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await pool.query(
      'SELECT id_categoria FROM categorias WHERE slug = $1 AND activa = TRUE LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Categoría no encontrada" 
      });
    }

    req.params.id = result.rows[0].id_categoria;
    return obtenerCategoriaPorId(req, res);

  } catch (error) {
    secureLog.error('Error al obtener categoría por slug', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener la categoría" 
    });
  }
};