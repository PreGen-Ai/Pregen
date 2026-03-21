import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";

import {
  listClasses,
  createClass,
  assignTeacher,
  enrollStudents,
  unenrollStudents,
} from "../../controllers/admin/classesController.js";

const router = express.Router();

/**
 * GET /api/admin/classes
 * List classes (tenant-scoped)
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
 * Teacher must have role TEACHER. Teachers can be cross-tenant.
 */
router.post("/:id/assign-teacher", requireAdmin, assignTeacher);

/**
 * POST /api/admin/classes/:id/enroll
 * Body: { studentIds: [id, id, ...] }
 * Students must belong to the same tenant and have role STUDENT.
 */
router.post("/:id/enroll", requireAdmin, enrollStudents);

/**
 * DELETE /api/admin/classes/:id/unenroll
 * Body: { studentIds: [id, ...] }
 */
router.delete("/:id/unenroll", requireAdmin, unenrollStudents);

export default router;
