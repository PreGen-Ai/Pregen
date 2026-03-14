// backend/src/routes/analyticRoutes.js
import express from "express";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

import {
  requireAuth,
  requireAdmin,
  requireTeacher,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getStudentAnalytics,
  getStudentPerformance,
  getWeakAreas,
  getTimeline,
  getRecommendations,
  getSessions,
  getCategoryPerformance,
  getWorkspaceAnalytics,
  getUserStatistics,
} from "../controllers/analyticsController.js";

const router = express.Router();

/* =======================================================
    DB READY GUARD
   - Uses the single connection established in server.js
   - Prevents crashes / undefined db usage
   ======================================================= */
function requireDb(req, res, next) {
  // 1 = connected
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({
      ok: false,
      message: "Database not connected",
    });
  }
  return next();
}

/* =======================================================
    STREAM PDF REPORT (GridFS)
   - Allow: STUDENT, TEACHER, ADMIN, SUPERADMIN, PARENT
   ======================================================= */
router.get(
  "/reports/:id",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  async (req, res) => {
    try {
      const db = mongoose.connection.db;

      if (!ObjectId.isValid(req.params.id)) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid report id" });
      }

      const fileId = new ObjectId(req.params.id);
      const bucket = new GridFSBucket(db, { bucketName: "reports_fs" });

      const fileDoc = await db
        .collection("reports_fs.files")
        .findOne({ _id: fileId });

      if (!fileDoc) {
        return res.status(404).json({ ok: false, message: "Report not found" });
      }

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileDoc.filename}"`,
        "Cache-Control": "no-store",
      });

      const stream = bucket.openDownloadStream(fileId);

      stream.on("error", (err) => {
        console.error("❌ GridFS stream error:", err);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ ok: false, message: "Failed to stream report" });
        }
      });

      stream.pipe(res);
    } catch (err) {
      console.error("❌ Error retrieving report:", err);
      res.status(500).json({ ok: false, message: "Error retrieving report" });
    }
  },
);

/* =======================================================
    CORE ANALYTICS ROUTES (MATCHING analyticsApi.js)
   ======================================================= */

// Student analytics root
router.get(
  "/students/:studentId",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getStudentAnalytics,
);

// Student performance
router.get(
  "/students/:studentId/performance",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getStudentPerformance,
);

// Weak areas
router.get(
  "/students/:studentId/weak-areas",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getWeakAreas,
);

// Timeline
router.get(
  "/students/:studentId/timeline",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getTimeline,
);

// Recommendations
router.get(
  "/students/:studentId/recommendations",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getRecommendations,
);

// Study sessions
router.get(
  "/students/:studentId/sessions",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getSessions,
);

// Category performance
router.get(
  "/students/:studentId/categories/:category",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  getCategoryPerformance,
);

// Workspace analytics (teacher/admin/superadmin)
router.get("/workspaces", ...requireTeacher, requireDb, getWorkspaceAnalytics);

// Platform user stats (admin/superadmin)
router.get("/users/stats", ...requireAdmin, requireDb, getUserStatistics);

/* =======================================================
    PROGRESS GRAPH (Used by analyticsApi.getProgress)
   - Allow: STUDENT, TEACHER, ADMIN, SUPERADMIN, PARENT
   ======================================================= */
router.post(
  "/reports/progress",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  async (req, res) => {
    try {
      const db = mongoose.connection.db;
      const { student_id, days = 30 } = req.body;

      if (!student_id) {
        return res
          .status(400)
          .json({ ok: false, message: "Missing student_id" });
      }

      const limitDays = Math.max(1, Math.min(Number(days) || 30, 365));

      const progress = await db
        .collection("student_progress")
        .find({ student_id })
        .sort({ date: 1 })
        .limit(limitDays)
        .toArray();

      res.json({ ok: true, progress_data: progress });
    } catch (err) {
      console.error("❌ /reports/progress error:", err);
      res
        .status(500)
        .json({ ok: false, message: "Failed to fetch student progress" });
    }
  },
);

/* =======================================================
   DASHBOARD OVERVIEW
   - Allow: STUDENT, TEACHER, ADMIN, SUPERADMIN, PARENT
   ======================================================= */
router.get(
  "/reports/dashboard/:studentId",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  requireDb,
  async (req, res) => {
    try {
      const db = mongoose.connection.db;
      const { studentId } = req.params;

      const student = await db.collection("users").findOne({
        $or: [{ user_code: studentId }, { username: studentId }],
      });

      if (!student) {
        return res
          .status(404)
          .json({ ok: false, message: "Student not found" });
      }

      const progressDocs = await db
        .collection("student_progress")
        .find({ student_id: studentId })
        .sort({ date: -1 })
        .limit(30)
        .toArray();

      const analyticsDocs = await db
        .collection("report_analytics")
        .find({ student_id: studentId })
        .toArray();

      const avgScore =
        analyticsDocs.reduce((sum, d) => sum + (d.overall_score || 0), 0) /
        (analyticsDocs.length || 1);

      const totalReports = await db
        .collection("reports_fs.files")
        .countDocuments({ "metadata.student_id": studentId });

      const dashboard = {
        student_id: studentId,
        name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        role: student.role,
        total_reports: totalReports,
        avg_score: Math.round(avgScore),
        performance_trend: progressDocs.map((p) => ({
          date: p.date,
          score: p.average_score,
        })),
      };

      res.json({ ok: true, dashboard });
    } catch (err) {
      console.error("❌ /reports/dashboard error:", err);
      res
        .status(500)
        .json({ ok: false, message: "Failed to generate student dashboard" });
    }
  },
);

export default router;
