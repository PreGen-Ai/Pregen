import express from "express";
import {
  getAssignedQuizContent,
  getStudentAssignedQuizzes,
  saveQuizAttemptAnswers,
  startAssignedQuiz,
  submitQuizAttempt,
} from "../controllers/quiz.controller.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(auth);
router.use(authorizeRoles("STUDENT"));

router.get("/student/my", getStudentAssignedQuizzes);
router.get("/assignments/:assignmentId/content", getAssignedQuizContent);
router.post("/assignments/:assignmentId/start", startAssignedQuiz);
router.patch("/attempts/:attemptId/answers", saveQuizAttemptAnswers);
router.post("/attempts/:attemptId/submit", submitQuizAttempt);

export default router;
