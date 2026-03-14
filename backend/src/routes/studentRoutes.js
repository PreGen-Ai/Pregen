// routes/studentRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import {
  getAssignments,
  submitAssignment,
  getQuizzes,
  startQuiz,
  submitQuiz,
  getWorkspaces,
  getResults,
  getLeaderboard,
} from "../controllers/studentController.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/assignments/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// All routes require authentication and student role
router.use(auth);
router.use(authorizeRoles("student"));

// Assignment routes
router.get("/assignments", getAssignments);
router.post("/assignments/submit", upload.array("files", 5), submitAssignment);

// Quiz routes
router.get("/quizzes", getQuizzes);
router.post("/quizzes/:quizId/start", startQuiz);
router.post(
  "/quizzes/:quizId/attempt/:attemptId/submit",
  upload.array("files", 3),
  submitQuiz
);

// Workspace and results
router.get("/workspaces", getWorkspaces);
router.get("/results", getResults);
router.get("/leaderboard", getLeaderboard);

export default router;
