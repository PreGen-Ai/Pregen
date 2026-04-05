import express from "express";
import {
  listGradebook,
  updateQuizAttemptGrade,
  updateSubmissionGrade,
} from "../controllers/gradebook.controller.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(auth);

router.get(
  "/",
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"),
  listGradebook,
);
router.patch(
  "/submissions/:submissionId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateSubmissionGrade,
);
router.patch(
  "/quiz-attempts/:attemptId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateQuizAttemptGrade,
);

export default router;
