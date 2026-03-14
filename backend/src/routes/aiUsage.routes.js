// backend/src/routes/aiUsage.routes.js
import { Router } from "express";
import mongoose from "mongoose";
import {
  createAiUsage,
  listAiUsage,
  getAiUsageById,
  getAiUsageSummary,
  deleteAiUsageById,
  bulkDeleteAiUsage,
} from "../controllers/aiUsage.controller.js";

import {
  requireAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
} from "../middleware/authMiddleware.js";

const router = Router();

/**
 * Helpers
 */
function validateObjectIdParam(paramName = "id") {
  return (req, res, next) => {
    const value = req.params?.[paramName];
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}`,
      });
    }
    return next();
  };
}

/**
 * Access policy (best practice)
 *
 * - POST /api/ai-usage: any authenticated user can create their own usage row
 * - GET  /api/ai-usage: admin/superadmin only (listing all users is sensitive)
 * - GET  /api/ai-usage/summary: admin/superadmin only
 * - GET/DELETE by id: admin/superadmin only
 * - bulk delete: superadmin only
 *
 * If you want students/teachers to list only their own usage, we can add
 * server-side filtering by req.user._id and loosen GET access.
 */

/**
 * Create usage log (any authenticated role)
 */
router.post("/", requireAuth, createAiUsage);

/**
 * List + summary (Admin/SuperAdmin)
 */
router.get("/", ...requireAdmin, listAiUsage);

// Summary must come before :id
router.get("/summary", ...requireAdmin, getAiUsageSummary);

/**
 * Item routes (Admin/SuperAdmin)
 */
router.get(
  "/:id",
  ...requireAdmin,
  validateObjectIdParam("id"),
  getAiUsageById,
);

router.delete(
  "/:id",
  ...requireAdmin,
  validateObjectIdParam("id"),
  deleteAiUsageById,
);

/**
 * Bulk delete (SuperAdmin only)
 * Keep / as legacy, add /bulk as explicit safer endpoint
 */
router.delete("/bulk", ...requireSuperAdmin, bulkDeleteAiUsage);
router.delete("/", ...requireSuperAdmin, bulkDeleteAiUsage);

export default router;
