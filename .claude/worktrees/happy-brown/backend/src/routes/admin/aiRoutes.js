// backend/src/routes/admin/aiRoutes.js
import { Router } from "express";
import {
  getAiSettings,
  updateAiSettings,
} from "../../controllers/admin/aiController.js";
import { requireAuth, requireRole } from "../../middleware/authMiddleware.js";

const router = Router();

router.get(
  "/settings",
  requireAuth,
  requireRole("ADMIN", "SUPERADMIN"),
  getAiSettings,
);

router.put(
  "/settings",
  requireAuth,
  requireRole("ADMIN", "SUPERADMIN"),
  updateAiSettings,
);

export default router;
