// routes/teacherRoutes.js
import express from "express";
import {
  createAssignment,
  createQuiz,
  getCourseRoster,
  getAssignmentSubmissions,
  getQuizResults,
  getTeacherDashboard,
  getTeacherContent,
  listTeacherAssignments,
  listTeacherQuizzes,
  updateAssignment,
  updateQuiz,
} from "../controllers/teacherController.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication and teacher role
router.use(auth);
router.use(authorizeRoles("teacher", "admin", "super_admin"));


// Teacher dashboard
router.get("/dashboard", getTeacherDashboard);
router.get("/content", getTeacherContent);
router.get("/courses/:courseId/roster", getCourseRoster);
router.get("/assignments", listTeacherAssignments);
router.post("/assignments", createAssignment);
router.patch("/assignments/:assignmentId", updateAssignment);
router.get("/assignments/:assignmentId/submissions", getAssignmentSubmissions);

router.get("/quizzes", listTeacherQuizzes);
router.post("/quizzes", createQuiz);
router.patch("/quizzes/:quizId", updateQuiz);
router.get("/quizzes/:quizId/results", getQuizResults);

export default router;
