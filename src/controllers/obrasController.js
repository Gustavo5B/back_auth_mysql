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
      ordenar = 'recientes' // recientes, antiguos, precio_asc, precio_desc, nombre
    } = req.query;

    const offset = (page - 1) * limit;

    // Construir query dinámicamente
    let whereConditions = ['o.activa = 1'];
    let queryParams = [];

    // Filtro por categoría
    if (categoria) {
      whereConditions.push('o.id_categoria = ?');
      queryParams.push(categoria);
    }

    // Filtro por artista
    if (artista) {
      whereConditions.push('o.id_artista = ?');
      queryParams.push(artista);
    }

    // Filtro de obras destacadas
    if (destacadas === 'true') {
      whereConditions.push('o.destacada = 1');
    }

    // Filtro por rango de precio
    if (precio_min || precio_max) {
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM obras_tamaños ot
          WHERE ot.id_obra = o.id_obra 
          AND ot.activo = 1
          ${precio_min ? 'AND ot.precio_base >= ?' : ''}
          ${precio_max ? 'AND ot.precio_base <= ?' : ''}
        )
      `);
      if (precio_min) queryParams.push(precio_min);
      if (precio_max) queryParams.push(precio_max);
    }

    const whereClause = whereConditions.join(' AND ');

    // Determinar ORDER BY
    let orderBy = 'o.fecha_creacion DESC'; // Por defecto: más recientes
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
        
        (SELECT COUNT(*) FROM obras_tamaños WHERE id_obra = o.id_obra AND activo = 1) AS total_tamaños
        
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE ${whereClause}
      GROUP BY o.id_obra
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    const [obras] = await pool.query(query, queryParams);

    // Contar total de obras para paginación
    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE ${whereClause}
    `;

    const [countResult] = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = countResult[0].total;

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
      WHERE o.id_obra = ? AND o.activa = 1
      LIMIT 1
    `;

    const [obras] = await pool.query(queryObra, [id]);

    if (obras.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Obra no encontrada" 
      });
    }

    const obra = obras[0];

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
      WHERE ot.id_obra = ? AND ot.activo = 1 AND t.activo = 1
      ORDER BY ot.precio_base ASC
    `;

    const [tamaños] = await pool.query(queryTamaños, [id]);

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
        WHERE om.id_obra_tamaño = ? AND om.activo = 1 AND tm.activo = 1
        ORDER BY om.precio_total ASC
      `;

      const [marcos] = await pool.query(queryMarcos, [tamaño.id_obra_tamaño]);
      tamaño.marcos = marcos;
    }

    // 4️⃣ GALERÍA DE IMÁGENES
    const queryImagenes = `
      SELECT 
        id_imagen,
        url_imagen,
        orden,
        es_principal
      FROM imagenes_obras
      WHERE id_obra = ? AND activa = 1
      ORDER BY es_principal DESC, orden ASC
    `;

    const [imagenes] = await pool.query(queryImagenes, [id]);

    // 5️⃣ ETIQUETAS
    const queryEtiquetas = `
      SELECT 
        e.id_etiqueta,
        e.nombre,
        e.slug
      FROM obras_etiquetas oe
      INNER JOIN etiquetas e ON oe.id_etiqueta = e.id_etiqueta
      WHERE oe.id_obra = ? AND e.activa = 1
    `;

    const [etiquetas] = await pool.query(queryEtiquetas, [id]);

    // 6️⃣ INCREMENTAR CONTADOR DE VISTAS
    await pool.query('UPDATE obras SET vistas = vistas + 1 WHERE id_obra = ?', [id]);

    // 7️⃣ OBRAS RELACIONADAS (misma categoría, mismo artista)
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
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE o.activa = 1 
        AND o.id_obra != ?
        AND (o.id_categoria = ? OR o.id_artista = ?)
      GROUP BY o.id_obra
      ORDER BY RAND()
      LIMIT 4
    `;

    const [relacionadas] = await pool.query(queryRelacionadas, [id, obra.id_categoria, obra.id_artista]);

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

    const [obras] = await pool.query(
      'SELECT id_obra FROM obras WHERE slug = ? AND activa = 1 LIMIT 1',
      [slug]
    );

    if (obras.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Obra no encontrada" 
      });
    }

    // Reutilizar la función de obtener por ID
    req.params.id = obras[0].id_obra;
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
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE o.activa = 1 
        AND (
          o.titulo LIKE ? 
          OR o.descripcion LIKE ?
          OR a.nombre_completo LIKE ?
          OR a.nombre_artistico LIKE ?
          OR c.nombre LIKE ?
        )
      GROUP BY o.id_obra
      ORDER BY o.fecha_creacion DESC
      LIMIT ? OFFSET ?
    `;

    const [resultados] = await pool.query(query, [
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
      parseInt(limit), parseInt(offset)
    ]);

    // Contar total
    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      INNER JOIN artistas a ON o.id_artista = a.id_artista
      INNER JOIN categorias c ON o.id_categoria = c.id_categoria
      WHERE o.activa = 1 
        AND (
          o.titulo LIKE ? 
          OR o.descripcion LIKE ?
          OR a.nombre_completo LIKE ?
          OR a.nombre_artistico LIKE ?
          OR c.nombre LIKE ?
        )
    `;

    const [countResult] = await pool.query(countQuery, [
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm
    ]);

    const total = countResult[0].total;

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
    const [etiquetas] = await pool.query(
      'SELECT id_etiqueta, nombre FROM etiquetas WHERE slug = ? AND activa = 1',
      [slug]
    );

    if (etiquetas.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Etiqueta no encontrada" 
      });
    }

    const etiqueta = etiquetas[0];

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
      LEFT JOIN obras_tamaños ot ON o.id_obra = ot.id_obra AND ot.activo = 1
      WHERE oe.id_etiqueta = ? AND o.activa = 1
      GROUP BY o.id_obra
      ORDER BY o.fecha_creacion DESC
      LIMIT ? OFFSET ?
    `;

    const [obras] = await pool.query(query, [etiqueta.id_etiqueta, parseInt(limit), parseInt(offset)]);

    const countQuery = `
      SELECT COUNT(DISTINCT o.id_obra) as total
      FROM obras o
      INNER JOIN obras_etiquetas oe ON o.id_obra = oe.id_obra
      WHERE oe.id_etiqueta = ? AND o.activa = 1
    `;

    const [countResult] = await pool.query(countQuery, [etiqueta.id_etiqueta]);
    const total = countResult[0].total;

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const [resultado] = await pool.query(query, [
      titulo,
      slug,
      descripcion,
      id_categoria,
      id_artista,
      anio_creacion || null,
      tecnica || null,
      imagen_principal,
      destacada ? 1 : 0,
      id_usuario
    ]);

    secureLog.info('Obra creada exitosamente', { 
      id_obra: resultado.insertId,
      imagen: imagen_principal 
    });

    res.status(201).json({
      success: true,
      message: 'Obra creada exitosamente',
      data: { 
        id_obra: resultado.insertId,
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
        titulo = ?,
        descripcion = ?,
        id_categoria = ?,
        id_artista = ?,
        anio_creacion = ?,
        tecnica = ?,
        destacada = ?
      WHERE id_obra = ?
    `;

    await pool.query(query, [
      titulo,
      descripcion,
      id_categoria,
      id_artista,
      anio_creacion || null,
      tecnica || null,
      destacada ? 1 : 0,
      id
    ]);

    res.json({
      success: true,
      message: 'Obra actualizada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error al actualizar obra:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la obra'
    });
  }
};