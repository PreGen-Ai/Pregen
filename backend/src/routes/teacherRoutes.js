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
import {
  approveQuizAttempt,
  approveSubmission,
  getQuizAttemptDetail,
  getSubmissionDetail,
  reviewQuizAttempt,
  reviewSubmission,
  updateQuizAttemptGrade,
  updateSubmissionGrade,
} from "../controllers/gradebook.controller.js";
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
router.get("/assignments/submissions/:submissionId", getSubmissionDetail);
router.patch("/assignments/submissions/:submissionId/review", reviewSubmission);
router.patch("/assignments/submissions/:submissionId", updateSubmissionGrade);
router.post("/assignments/submissions/:submissionId/approve", approveSubmission);

router.get("/quizzes", listTeacherQuizzes);
router.post("/quizzes", createQuiz);
router.patch("/quizzes/:quizId", updateQuiz);
router.get("/quizzes/:quizId/results", getQuizResults);
router.get("/quizzes/attempts/:attemptId", getQuizAttemptDetail);
router.patch("/quizzes/attempts/:attemptId/review", reviewQuizAttempt);
router.patch("/quizzes/attempts/:attemptId", updateQuizAttemptGrade);
router.post("/quizzes/attempts/:attemptId/approve", approveQuizAttempt);

export default router;
