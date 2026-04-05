import express from "express";
import multer from "multer";

import {
  generateQuiz,
  gradeQuiz,
  gradeSingleQuestion,
  getGradingHealth,
  generateAssignment,
  validateAssignment,
  uploadAssignmentFile,
  saveAssignmentReport,
  gradeAssignment,
  getAssignmentById,
  listAssignments,
  getAssignmentsHealth,
  startTutorSession,
  uploadTutorMaterial,
  tutorChat,
  generateExplanation,
  generateBatchExplanations,
  downloadReportPdf,
  downloadReportJson,
  downloadReportZip,
  getReportStatus,
  getStudentReports,
  getStudentProgress,
  getReportDashboard,
  downloadLegacyReportPdf,
  downloadLegacyReportJson,
} from "../controllers/ai.controller.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const requireLmsAiAccess = [
  requireAuth,
  requireRole("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"),
];

function maybeSingle(fieldName) {
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) return next();
    return memoryUpload.single(fieldName)(req, res, next);
  };
}

router.use(...requireLmsAiAccess);

router.post("/quiz/generate", generateQuiz);
router.post("/grade-quiz", gradeQuiz);
router.post("/grade-question", gradeSingleQuestion);
router.get("/grade/health", getGradingHealth);

router.get("/assignments/health", getAssignmentsHealth);
router.get("/assignments", listAssignments);
router.get("/assignments/:assignmentId", getAssignmentById);
router.post("/assignments/generate", generateAssignment);
router.post("/assignments/validate", validateAssignment);
router.post(
  "/assignments/upload",
  memoryUpload.single("file"),
  uploadAssignmentFile,
);
router.post("/assignments/report", saveAssignmentReport);
router.post("/assignments/grade", gradeAssignment);

router.post("/tutor/session/:sessionId", startTutorSession);
router.post(
  "/tutor/material/:sessionId",
  memoryUpload.single("file"),
  uploadTutorMaterial,
);
router.post("/tutor/chat", maybeSingle("file"), tutorChat);

router.post("/learning/explanation", generateExplanation);
router.post("/learning/explanations/batch", generateBatchExplanations);

router.get("/reports/pdf/:reportId", downloadReportPdf);
router.get("/reports/json/:reportId", downloadReportJson);
router.get("/reports/download/:reportId", downloadReportZip);
router.get("/reports/status/:reportId", getReportStatus);
router.post("/reports/student", getStudentReports);
router.post("/reports/progress", getStudentProgress);
router.get("/reports/dashboard/:userIdentifier", getReportDashboard);

router.get("/download-report/:reportId", downloadLegacyReportPdf);
router.get("/report/:reportId", downloadLegacyReportJson);

export default router;
