import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";

import {
  listClasses,
  createClass,
  assignTeacher,
  enrollStudents,
} from "../../controllers/admin/classesController.js";

const router = express.Router();

/**
 * GET /api/admin/classes
 * List classes (tenant-scoped if tenantId exists)
 */
router.get("/", requireAdmin, listClasses);

/**
 * POST /api/admin/classes
 * Body: { name, grade?, section? }
 */
router.post("/", requireAdmin, createClass);

/**
 * POST /api/admin/classes/:id/assign-teacher
 * Body: { teacherId }
 */
router.post("/:id/assign-teacher", requireAdmin, assignTeacher);

/**
 * POST /api/admin/classes/:id/enroll
 * Body: { studentIds: [id, id, ...] }
 */
router.post("/:id/enroll", requireAdmin, enrollStudents);

export default router;
