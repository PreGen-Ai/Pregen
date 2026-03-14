import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";

import {
  listUsers,
  inviteUser,
  setUserStatus,
  setUserRole,
  resetPassword,
} from "../../controllers/admin/usersController.js";

const router = express.Router();

/**
 * GET /api/admin/users
 * Query params: q, role, status
 */
router.get("/", requireAdmin, listUsers);

/**
 * POST /api/admin/users/invite
 * Body: { name?, email, role? }
 */
router.post("/invite", requireAdmin, inviteUser);

/**
 * PATCH /api/admin/users/:id/status
 * Body: { enabled: boolean }
 */
router.patch("/:id/status", requireAdmin, setUserStatus);

/**
 * PATCH /api/admin/users/:id/role
 * Body: { role: "ADMIN"|"TEACHER"|"STUDENT"|"PARENT" }
 */
router.patch("/:id/role", requireAdmin, setUserRole);

/**
 * POST /api/admin/users/:id/reset-password
 * Generates a new temp password + sets mustChangePassword=true
 */
router.post("/:id/reset-password", requireAdmin, resetPassword);

export default router;
