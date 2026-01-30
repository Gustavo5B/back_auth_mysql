import express from 'express';
import { 
  listarObras,
  obtenerObraPorId,
  obtenerObraPorSlug,
  buscarObras,
  obtenerObrasPorCategoria,
  obtenerObrasPorArtista,
  obtenerObrasPorEtiqueta,
  obtenerObrasDestacadas,
  crearObra,        
  actualizarObra 
} from '../controllers/obrasController.js';
import { 
  validarBusqueda,
  validarIdObra,
  validarIdCategoria,
  validarIdArtista,
  validarSlug
} from '../validators/validators.js';

const router = express.Router();

// =========================================================
// 📚 RUTAS PÚBLICAS CON VALIDACIONES
// =========================================================

// CATÁLOGO GENERAL (con validación de query params)
router.get('/', validarBusqueda, listarObras);

// OBRAS DESTACADAS
router.get('/destacadas', obtenerObrasDestacadas);

// BÚSQUEDA (valida término de búsqueda)
router.get('/buscar', validarBusqueda, buscarObras);

// FILTROS (validan IDs y slugs)
router.get('/categoria/:id', validarIdCategoria, obtenerObrasPorCategoria);
router.get('/artista/:id', validarIdArtista, obtenerObrasPorArtista);
router.get('/etiqueta/:slug', validarSlug, obtenerObrasPorEtiqueta);

// DETALLE DE OBRA (valida slug e ID)
router.get('/slug/:slug', validarSlug, obtenerObraPorSlug);
router.get('/:id', validarIdObra, obtenerObraPorId);

// ✅ AGREGAR RUTAS PROTEGIDAS
router.post('/', crearObra);
router.put('/:id', actualizarObra);

export default router;