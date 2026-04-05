import express from "express";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "../controllers/announcements.controller.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(auth);

router.get(
  "/",
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"),
  listAnnouncements,
);
router.post(
  "/",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  createAnnouncement,
);
router.patch(
  "/:id",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateAnnouncement,
);
router.delete(
  "/:id",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  deleteAnnouncement,
);

export default router;
