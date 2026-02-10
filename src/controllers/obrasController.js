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
// 📚 LISTAR TODAS LAS OBRAS (CON PAGINACIÓN Y FILTROS)
// =========================================================
export const listarObras = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12,
      categoria,
      artista,
      precio_min,
      precio_max,
      destacadas,
      ordenar = 'recientes'
    } = req.query;

    const offset = (page - 1) * limit;

    // Construir query dinámicamente
    let whereConditions = ['o.activa = TRUE'];
    let queryParams = [];
    let paramCount = 1;

    // Filtro por categoría
    if (categoria) {
      whereConditions.push(`o.id_categoria = $${paramCount}`);
      queryParams.push(categoria);
      paramCount++;
    }

    // Filtro por artista
    if (artista) {
      whereConditions.push(`o.id_artista = $${paramCount}`);
      queryParams.push(artista);
      paramCount++;
    }

    // Filtro de obras destacadas
    if (destacadas === 'true') {
      whereConditions.push('o.destacada = TRUE');
    }

    // Filtro por rango de precio
    if (precio_min || precio_max) {
      let precioConditions = [];
      if (precio_min) {
        precioConditions.push(`ot.precio_base >= $${paramCount}`);
        queryParams.push(precio_min);
        paramCount++;
      }
      if (precio_max) {
        precioConditions.push(`ot.precio_base <= $${paramCount}`);
        queryParams.push(precio_max);
        paramCount++;
      }
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM obras_tamaños ot
          WHERE ot.id_obra = o.id_obra 
          AND ot.activo = TRUE
          ${precioConditions.length > 0 ? 'AND ' + precioConditions.join(' AND ') : ''}
        )
      `);
    }

    const whereClause = whereConditions.join(' AND ');

    // Determinar ORDER BY
    let orderBy = 'o.fecha_creacion DESC';
    switch(ordenar) {
      case 'antiguos':
        orderBy = 'o.fecha_creacion ASC';
        break;
      case 'precio_asc':
        orderBy = 'precio_minimo ASC';
        break;
      case 'precio_desc':
        orderBy = 'precio_minimo DESC';
        break;
      case 'nombre':
        orderBy = 'o.titulo ASC';
        break;
    }

    // Query principal con JOIN
    const query = `
      SELECT 
        o.id_obra,
        o.titulo,
        o.descripcion,
        o.slug,
        o.imagen_principal,
        o.anio_creacion,
        o.tecnica,
        o.destacada,
        o.vistas,
        o.fecha_creacion,
        
        a.id_artista,
        a.nombre_completo AS artista_nombre,
        a.nombre_artistico AS artista_alias,
        
        c.id_categoria,
        c.nombre AS categoria_nombre,
        c.slug AS categoria_slug,
        
        MIN(ot.precio_base) AS precio_minimo,
        MAX(ot.precio_base) AS precio_maximo,
        
        (SELECT COUNT(*) FROM obras_tamaños WHERE id_obra = o.id_obra AND activo = TRUE) AS total_tamaños
        
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE ${whereClause}
      GROUP BY o.id_obra, a.id_artista, a.nombre_completo, a.nombre_artistico, 
               c.id_categoria, c.nombre, c.slug
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, queryParams);
    const obras = result.rows;

    // Contar total de obras para paginación
    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    secureLog.info('Obras listadas', { 
      total, 
      page, 
      limit,
      filtros: { categoria, artista, precio_min, precio_max }
    });

    res.json({
      success: true,
      data: obras,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    secureLog.error('Error al listar obras', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener las obras" 
    });
  }
};

// =========================================================
// 🔍 DETALLE COMPLETO DE UNA OBRA
// =========================================================
export const obtenerObraPorId = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ INFORMACIÓN BÁSICA DE LA OBRA
    const queryObra = `
      SELECT 
        o.*,
        a.nombre_completo AS artista_nombre,
        a.nombre_artistico AS artista_alias,
        a.biografia AS artista_biografia,
        a.foto_perfil AS artista_foto,
        c.nombre AS categoria_nombre,
        c.slug AS categoria_slug
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      WHERE o.id_obra = $1 AND o.activa = TRUE
      LIMIT 1
    `;

    const resultObra = await pool.query(queryObra, [id]);

    if (resultObra.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Obra no encontrada" 
      });
    }

    const obra = resultObra.rows[0];

    // 2️⃣ TAMAÑOS DISPONIBLES CON PRECIOS
    const queryTamaños = `
      SELECT 
        ot.id AS id_obra_tamaño,
        ot.precio_base,
        ot.cantidad_disponible,
        t.id_tamaño,
        t.nombre AS tamaño_nombre,
        t.ancho_cm,
        t.alto_cm
      FROM obras_tamaños ot
      INNER JOIN tamaños_disponibles t ON ot.id_tamaño = t.id_tamaño
      WHERE ot.id_obra = $1 AND ot.activo = TRUE AND t.activo = TRUE
      ORDER BY ot.precio_base ASC
    `;

    const resultTamaños = await pool.query(queryTamaños, [id]);
    const tamaños = resultTamaños.rows;

    // 3️⃣ OPCIONES DE MARCO POR TAMAÑO
    for (let tamaño of tamaños) {
      const queryMarcos = `
        SELECT 
          om.id,
          om.precio_total,
          tm.id_tipo_marco,
          tm.nombre AS marco_nombre,
          tm.descripcion AS marco_descripcion,
          tm.precio_adicional,
          tm.imagen AS marco_imagen
        FROM obras_marcos om
        INNER JOIN tipos_marco tm ON om.id_tipo_marco = tm.id_tipo_marco
        WHERE om.id_obra_tamaño = $1 AND om.activo = TRUE AND tm.activo = TRUE
        ORDER BY om.precio_total ASC
      `;

      const resultMarcos = await pool.query(queryMarcos, [tamaño.id_obra_tamaño]);
      tamaño.marcos = resultMarcos.rows;
    }

    // 4️⃣ GALERÍA DE IMÁGENES
    const queryImagenes = `
      SELECT 
        id_imagen,
        url_imagen,
        orden,
        es_principal
      FROM imagenes_obras
      WHERE id_obra = $1 AND activa = TRUE
      ORDER BY es_principal DESC, orden ASC
    `;

    const resultImagenes = await pool.query(queryImagenes, [id]);
    const imagenes = resultImagenes.rows;

    // 5️⃣ ETIQUETAS
    const queryEtiquetas = `
      SELECT 
        e.id_etiqueta,
        e.nombre,
        e.slug
      FROM obras_etiquetas oe
      INNER JOIN etiquetas e ON oe.id_etiqueta = e.id_etiqueta
      WHERE oe.id_obra = $1 AND e.activa = TRUE
    `;

    const resultEtiquetas = await pool.query(queryEtiquetas, [id]);
    const etiquetas = resultEtiquetas.rows;

    // 6️⃣ INCREMENTAR CONTADOR DE VISTAS
    await pool.query('UPDATE obras SET vistas = vistas + 1 WHERE id_obra = $1', [id]);

    // 7️⃣ OBRAS RELACIONADAS - ✅ PostgreSQL usa RANDOM() en lugar de RAND()
    const queryRelacionadas = `
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
      WHERE o.activa = TRUE
        AND o.id_obra != $1
        AND (o.id_categoria = $2 OR o.id_artista = $3)
      GROUP BY o.id_obra, a.nombre_artistico
      ORDER BY RANDOM()
      LIMIT 4
    `;

    const resultRelacionadas = await pool.query(queryRelacionadas, [id, obra.id_categoria, obra.id_artista]);
    const relacionadas = resultRelacionadas.rows;

    // 8️⃣ RESPUESTA COMPLETA
    res.json({
      success: true,
      data: {
        ...obra,
        tamaños,
        imagenes,
        etiquetas,
        obras_relacionadas: relacionadas
      }
    });

  } catch (error) {
    secureLog.error('Error al obtener detalle de obra', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener el detalle de la obra" 
    });
  }
};

// =========================================================
// 🔍 OBTENER OBRA POR SLUG
// =========================================================
export const obtenerObraPorSlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await pool.query(
      'SELECT id_obra FROM obras WHERE slug = $1 AND activa = TRUE LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Obra no encontrada" 
      });
    }

    // Reutilizar la función de obtener por ID
    req.params.id = result.rows[0].id_obra;
    return obtenerObraPorId(req, res);

  } catch (error) {
    secureLog.error('Error al obtener obra por slug', error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener la obra" 
    });
  }
};

// =========================================================
// 🔎 BÚSQUEDA POR PALABRA CLAVE
// =========================================================
export const buscarObras = async (req, res) => {
  try {
    const { q, page = 1, limit = 12 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false,
        message: "La búsqueda debe tener al menos 2 caracteres" 
      });
    }

    const offset = (page - 1) * limit;
    const searchTerm = `%${q}%`;

    // ✅ PostgreSQL: ILIKE es case-insensitive (mejor que LIKE)
    const query = `
      SELECT 
        o.id_obra,
        o.titulo,
        o.descripcion,
        o.slug,
        o.imagen_principal,
        a.nombre_completo AS artista_nombre,
        a.nombre_artistico AS artista_alias,
        c.nombre AS categoria_nombre,
        MIN(ot.precio_base) AS precio_minimo
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE o.activa = TRUE
        AND (
          o.titulo ILIKE $1
          OR o.descripcion ILIKE $1
          OR a.nombre_completo ILIKE $1
          OR a.nombre_artistico ILIKE $1
          OR c.nombre ILIKE $1
        )
      GROUP BY o.id_obra, a.nombre_completo, a.nombre_artistico, c.nombre
      ORDER BY o.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [searchTerm, parseInt(limit), parseInt(offset)]);
    const resultados = result.rows;

    // Contar total
    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      WHERE o.activa = TRUE
        AND (
          o.titulo ILIKE $1
          OR o.descripcion ILIKE $1
          OR a.nombre_completo ILIKE $1
          OR a.nombre_artistico ILIKE $1
          OR c.nombre ILIKE $1
        )
    `;

    const countResult = await pool.query(countQuery, [searchTerm]);
    const total = parseInt(countResult.rows[0].total);

    secureLog.info('Búsqueda realizada', { q, total });

    res.json({
      success: true,
      data: resultados,
      search: {
        query: q,
        total
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    secureLog.error('Error en búsqueda de obras', error);
    res.status(500).json({ 
      success: false,
      message: "Error al buscar obras" 
    });
  }
};

// =========================================================
// 🏷️ FILTRAR POR CATEGORÍA
// =========================================================
export const obtenerObrasPorCategoria = async (req, res) => {
  req.query.categoria = req.params.id;
  return listarObras(req, res);
};

// =========================================================
// 👨‍🎨 FILTRAR POR ARTISTA
// =========================================================
export const obtenerObrasPorArtista = async (req, res) => {
  req.query.artista = req.params.id;
  return listarObras(req, res);
};

// =========================================================
// 🏷️ FILTRAR POR ETIQUETA
// =========================================================
export const obtenerObrasPorEtiqueta = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    // Obtener ID de la etiqueta
    const resultEtiqueta = await pool.query(
      'SELECT id_etiqueta, nombre FROM etiquetas WHERE slug = $1 AND activa = TRUE',
      [slug]
    );

    if (resultEtiqueta.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Etiqueta no encontrada" 
      });
    }

    const etiqueta = resultEtiqueta.rows[0];

    const query = `
      SELECT 
        o.id_obra,
        o.titulo,
        o.slug,
        o.imagen_principal,
        a.nombre_artistico AS artista_alias,
        c.nombre AS categoria_nombre,
        MIN(ot.precio_base) AS precio_minimo
      FROM obras o
      INNER JOIN obras_etiquetas oe ON o.id_obra = oe.id_obra
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = TRUE
      WHERE oe.id_etiqueta = $1 AND o.activa = TRUE
      GROUP BY o.id_obra, a.nombre_artistico, c.nombre
      ORDER BY o.fecha_creacion DESC
      LIMIT $2 OFFSET $3
    `;

    const resultObras = await pool.query(query, [etiqueta.id_etiqueta, parseInt(limit), parseInt(offset)]);
    const obras = resultObras.rows;

    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      INNER JOIN obras_etiquetas oe ON o.id_obra = oe.id_obra
      WHERE oe.id_etiqueta = $1 AND o.activa = TRUE
    `;

    const countResult = await pool.query(countQuery, [etiqueta.id_etiqueta]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      etiqueta: etiqueta.nombre,
      data: obras,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    secureLog.error('Error al filtrar por etiqueta', error);
    res.status(500).json({ 
      success: false,
      message: "Error al filtrar obras por etiqueta" 
    });
  }
};

// =========================================================
// ⭐ OBTENER OBRAS DESTACADAS
// =========================================================
export const obtenerObrasDestacadas = async (req, res) => {
  req.query.destacadas = 'true';
  req.query.limit = req.query.limit || 8;
  return listarObras(req, res);
};

// =========================================================
// ➕ CREAR OBRA (CON CLOUDINARY)
// =========================================================
export const crearObra = async (req, res) => {
  try {
    const { 
      titulo, 
      descripcion, 
      id_categoria, 
      id_artista, 
      anio_creacion, 
      tecnica, 
      destacada 
    } = req.body;

    const id_usuario = req.user?.id_usuario || 1;

    // ✅ VALIDACIONES
    if (!titulo || !descripcion || !id_categoria || !id_artista) {
      return res.status(400).json({
        success: false,
        message: 'Título, descripción, categoría y artista son obligatorios'
      });
    }

    // ✅ VERIFICAR QUE SE SUBIÓ LA IMAGEN
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'La imagen es obligatoria'
      });
    }

    // ✅ GENERAR SLUG
    const slug = titulo
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // ✅ OBTENER URL DE LA IMAGEN SUBIDA A CLOUDINARY
    const imagen_principal = req.file.path;

    // ✅ POSTGRESQL: Usar RETURNING
    const query = `
      INSERT INTO obras (
        titulo,
        slug,
        descripcion,
        id_categoria,
        id_artista,
        anio_creacion,
        tecnica,
        imagen_principal,
        destacada,
        id_usuario_creacion,
        activa
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
      RETURNING id_obra
    `;

    const result = await pool.query(query, [
      titulo,
      slug,
      descripcion,
      id_categoria,
      id_artista,
      anio_creacion || null,
      tecnica || null,
      imagen_principal,
      destacada || false,
      id_usuario
    ]);

    const id_obra = result.rows[0].id_obra;

    secureLog.info('Obra creada exitosamente', { 
      id_obra,
      imagen: imagen_principal 
    });

    res.status(201).json({
      success: true,
      message: 'Obra creada exitosamente',
      data: { 
        id_obra,
        slug,
        imagen_principal 
      }
    });

  } catch (error) {
    secureLog.error('Error al crear obra', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la obra'
    });
  }
};

// =========================================================
// ✏️ ACTUALIZAR OBRA
// =========================================================
export const actualizarObra = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      titulo, 
      descripcion, 
      id_categoria, 
      id_artista, 
      anio_creacion, 
      tecnica, 
      destacada 
    } = req.body;

    const query = `
      UPDATE obras 
      SET 
        titulo = $1,
        descripcion = $2,
        id_categoria = $3,
        id_artista = $4,
        anio_creacion = $5,
        tecnica = $6,
        destacada = $7
      WHERE id_obra = $8
    `;

    await pool.query(query, [
      titulo,
      descripcion,
      id_categoria,
      id_artista,
      anio_creacion || null,
      tecnica || null,
      destacada || false,
      id
    ]);

    res.json({
      success: true,
      message: 'Obra actualizada exitosamente'
    });

  } catch (error) {
    secureLog.error('Error al actualizar obra', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la obra'
    });
  }
};