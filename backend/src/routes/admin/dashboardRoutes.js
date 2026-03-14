import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";
import { getDashboardMetrics } from "../../controllers/admin/dashboardController.js";

const router = express.Router();
router.get("/metrics", requireAdmin, getDashboardMetrics);

export default router;
