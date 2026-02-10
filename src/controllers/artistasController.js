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
// 👨‍🎨 LISTAR TODOS LOS ARTISTAS
// =========================================================
export const listarArtistas = async (req, res) => {
  try {
    // ✅ POSTGRESQL
    const query = `
      SELECT 
        a.id_artista,
        a.nombre_completo,
        a.nombre_artistico,
        a.biografia,
        a.foto_perfil,
        COUNT(o.id_obra) AS total_obras
      FROM artistas a
      LEFT JOIN obras o ON a.id_artista = o.id_artista AND o.activa = TRUE
      WHERE a.activo = TRUE
      GROUP BY a.id_artista
      ORDER BY a.nombre_artistico ASC
    `;

    const result = await pool.query(query);
    const artistas = result.rows;

    secureLog.info('Artistas listados', { total: artistas.length });

    res.json({
      success: true,
      data: artistas
    });

  } catch (error) {
    secureLog.error('Error al listar artistas', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener los artistas" 
    });
  }
};

// =========================================================
// 🔍 OBTENER DETALLE DE UN ARTISTA
// =========================================================
export const obtenerArtistaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ INFORMACIÓN DEL ARTISTA - ✅ POSTGRESQL
    const queryArtista = `
      SELECT 
        a.*,
        COUNT(o.id_obra) AS total_obras
      FROM artistas a
      LEFT JOIN obras o ON a.id_artista = o.id_artista AND o.activa = TRUE
      WHERE a.id_artista = $1 AND a.activo = TRUE
      GROUP BY a.id_artista
      LIMIT 1
    `;

    const resultArtista = await pool.query(queryArtista, [id]);

    if (resultArtista.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Artista no encontrado" 
      });
    }

    const artista = resultArtista.rows[0];

    // 2️⃣ OBRAS DEL ARTISTA - ✅ POSTGRESQL
    const queryObras = `
      SELECT 
        o.id_obra,
        o.titulo,
        o.slug,
        o.imagen_principal,
        o.anio_creacion,
        c.nombre AS categoria_nombre,
        MIN(ot.precio_base) AS precio_minimo
      FROM obras o
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE o.id_artista = $1 AND o.activa = TRUE
      GROUP BY o.id_obra, c.nombre
      ORDER BY o.fecha_creacion DESC
    `;

    const resultObras = await pool.query(queryObras, [id]);
    const obras = resultObras.rows;

    // 3️⃣ ESTADÍSTICAS DEL ARTISTA - ✅ POSTGRESQL
    const queryStats = `
      SELECT 
        COUNT(DISTINCT o.id_categoria) AS categorias_trabajadas,
        MIN(o.anio_creacion) AS primer_obra_anio,
        MAX(o.anio_creacion) AS ultima_obra_anio
      FROM obras o
      WHERE o.id_artista = $1 AND o.activa = TRUE
    `;

    const resultStats = await pool.query(queryStats, [id]);
    const stats = resultStats.rows[0];

    res.json({
      success: true,
      data: {
        ...artista,
        estadisticas: stats,
        obras
      }
    });

  } catch (error) {
    secureLog.error('Error al obtener artista', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener el artista" 
    });
  }
};