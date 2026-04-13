import express from "express";
import {
  listGradebook,
  reviewSubmission,
  approveSubmission,
  reviewQuizAttempt,
  approveQuizAttempt,
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

// Draft a teacher review (sets score/feedback, status = teacher_reviewed — not yet final)
router.patch(
  "/submissions/:submissionId/review",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  reviewSubmission,
);

// Approve and finalise a submission grade (status = final, released to student)
router.patch(
  "/submissions/:submissionId/approve",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  approveSubmission,
);

// Legacy alias — behaves as approve for backwards compatibility
router.patch(
  "/submissions/:submissionId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateSubmissionGrade,
);

// Draft a teacher review for a quiz attempt
router.patch(
  "/quiz-attempts/:attemptId/review",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  reviewQuizAttempt,
);

// Approve and finalise a quiz attempt grade
router.patch(
  "/quiz-attempts/:attemptId/approve",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  approveQuizAttempt,
);

// Legacy alias — behaves as approve for backwards compatibility
router.patch(
  "/quiz-attempts/:attemptId",
  authorizeRoles("TEACHER", "ADMIN", "SUPERADMIN"),
  updateQuizAttemptGrade,
);

export default router;
