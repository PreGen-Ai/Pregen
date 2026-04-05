import express from "express";
import {
  createLessonContent,
  createModule,
  deleteLessonContent,
  deleteModule,
  listCourseLessons,
  updateLessonContent,
  updateModule,
} from "../controllers/lessons.controller.js";
import { upload } from "../middleware/documentMiddleware.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(auth);

router.get(
  "/courses/:courseId",
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"),
  listCourseLessons,
);

router.post(
  "/courses/:courseId/modules",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  createModule,
);
router.patch(
  "/modules/:moduleId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateModule,
);
router.delete(
  "/modules/:moduleId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  deleteModule,
);

router.post(
  "/modules/:moduleId/content",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  upload.single("document"),
  createLessonContent,
);
router.patch(
  "/content/:contentId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateLessonContent,
);
router.delete(
  "/content/:contentId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  deleteLessonContent,
);

export default router;
