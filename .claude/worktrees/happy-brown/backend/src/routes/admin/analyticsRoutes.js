import express from "express";
import { requireAuth, requireRole } from "../../middleware/authMiddleware.js";
import {
  exportReport,
  getSummary,
} from "../../controllers/admin/analyticsController.js";

const router = express.Router();

router.get(
  "/summary",
  requireAuth,
  requireRole("ADMIN", "SUPERADMIN"),
  getSummary,
);
router.get(
  "/export/:type",
  requireAuth,
  requireRole("ADMIN", "SUPERADMIN"),
  exportReport,
);

export default router;
