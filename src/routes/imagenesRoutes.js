import { Router } from 'express';
import { upload } from '../config/cloudinaryConfig.js';
import {
  subirImagenPrincipal,
  subirImagenesGaleria,
  eliminarImagenObra,
  reordenarImagenes
} from '../controllers/imagenesController.js';


const router = Router();

// =========================================================
// 🔒 RUTAS PROTEGIDAS (REQUIEREN AUTENTICACIÓN)
// =========================================================

// Subir imagen principal de obra
// Uso: POST /api/imagenes/principal
// Body: FormData con 'imagen' (file) e 'id_obra' (number)
router.post('/principal', upload.single('imagen'), subirImagenPrincipal);

// Subir múltiples imágenes para galería
// Uso: POST /api/imagenes/galeria
// Body: FormData con 'imagenes' (files[]) e 'id_obra' (number)
router.post('/galeria', upload.array('imagenes', 5), subirImagenesGaleria);

// Eliminar imagen
// Uso: DELETE /api/imagenes/:id_imagen
router.delete('/:id_imagen', eliminarImagenObra);

// Reordenar imágenes
// Uso: PUT /api/imagenes/reordenar
// Body: { id_obra: number, ordenNuevo: [id1, id2, id3, ...] }
router.put('/reordenar', reordenarImagenes);

export default router;