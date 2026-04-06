import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";

import {
  listUsers,
  createUser,
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
 * POST /api/admin/users/create
 * Create a user with explicit email + password
 * Body: { email, password, username?, firstName?, lastName?, gender?, role? }
 */
router.post("/create", requireAdmin, createUser);

/**
 * POST /api/admin/users/invite
 * Body: { name?, email, role?, password?, username?, firstName?, lastName? }
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
 * Body: { newPassword? } — generates temp if omitted
 */
router.post("/:id/reset-password", requireAdmin, resetPassword);

export default router;
