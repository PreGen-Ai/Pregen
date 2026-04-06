// routes/teacherRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import {
  getTeacherContent,
} from "../controllers/teacherController.js";
import { auth, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest =
      file.fieldname === "quizFile"
        ? "uploads/quizzes/"
        : "uploads/assignments/";
    cb(null, dest);
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
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

// All routes require authentication and teacher role
router.use(auth);
router.use(authorizeRoles("teacher", "admin", "super_admin"));


// Teacher dashboard
router.get("/content", getTeacherContent);

export default router;
