import { Router } from "express";
import { 
  listarCategorias, 
  obtenerCategoriaPorId,
  obtenerCategoriaPorSlug
} from "../controllers/categoriasController.js";

const router = Router();

// =========================================================
// 📂 RUTAS PÚBLICAS DE CATEGORÍAS
// =========================================================

// Listar todas las categorías
router.get("/", listarCategorias);

// Obtener categoría por slug
router.get("/slug/:slug", obtenerCategoriaPorSlug);

// Obtener categoría por ID
router.get("/:id", obtenerCategoriaPorId);

export default router;