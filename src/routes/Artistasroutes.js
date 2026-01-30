import { Router } from "express";
import { 
  listarArtistas, 
  obtenerArtistaPorId
} from "../controllers/artistasController.js";

const router = Router();

// =========================================================
// 👨‍🎨 RUTAS PÚBLICAS DE ARTISTAS
// =========================================================

// Listar todos los artistas
router.get("/", listarArtistas);

// Obtener artista por ID
router.get("/:id", obtenerArtistaPorId);

export default router;
