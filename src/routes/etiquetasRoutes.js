import { Router } from "express";
import { 
  listarEtiquetas, 
  obtenerEtiquetaPorSlug
} from "../controllers/etiquetasController.js";

const router = Router();

// =========================================================
// 🏷️ RUTAS PÚBLICAS DE ETIQUETAS
// =========================================================

// Listar todas las etiquetas
router.get("/", listarEtiquetas);

// Obtener etiqueta por slug
router.get("/:slug", obtenerEtiquetaPorSlug);

export default router;