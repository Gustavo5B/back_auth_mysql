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
      LEFT JOIN obras o ON c.id_categoria = o.id_categoria AND o.activa = 1
      WHERE c.activa = 1
      GROUP BY c.id_categoria
      ORDER BY c.nombre ASC
    `;

    const [categorias] = await pool.query(query);

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
      LEFT JOIN obras o ON c.id_categoria = o.id_categoria AND o.activa = 1
      WHERE c.id_categoria = ? AND c.activa = 1
      GROUP BY c.id_categoria
      LIMIT 1
    `;

    const [categorias] = await pool.query(queryCat, [id]);

    if (categorias.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Categoría no encontrada" 
      });
    }

    const categoria = categorias[0];

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
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE o.id_categoria = ? AND o.activa = 1
      GROUP BY o.id_obra
      ORDER BY o.fecha_creacion DESC
      LIMIT 12
    `;

    const [obras] = await pool.query(queryObras, [id]);

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

    const [categorias] = await pool.query(
      'SELECT id_categoria FROM categorias WHERE slug = ? AND activa = 1 LIMIT 1',
      [slug]
    );

    if (categorias.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Categoría no encontrada" 
      });
    }

    req.params.id = categorias[0].id_categoria;
    return obtenerCategoriaPorId(req, res);

  } catch (error) {
    secureLog.error('Error al obtener categoría por slug', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener la categoría" 
    });
  }
};