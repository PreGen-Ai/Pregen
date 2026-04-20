// backend/src/routes/courseRoutes.js
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import {
  getCourseById,
  createCourse,
  assignToCourse,
  addActivityToSection,
  searchCourses,
  getCourseActivity,
  setCourseArchived,
  getCoursesByUser,
  deleteCourse,
  getAllCourses,

  // List endpoints
  getMyCoursesList,
  searchCoursesList,
  getPublicCoursesList,

  // Assignments
  submitAssignmentById,
  getSubmissionsForCourse,
} from "../controllers/CourseController.js";

import {
  requireAuth,
  requireAdmin,
  requireTeacher,
  requireStudent,
  authorizeRoles,
  courseOwnerAuth,
  courseAdminAuth,
} from "../middleware/authMiddleware.js";

const router = express.Router();
const assignmentUploadDir = "uploads/assignments";

const assignmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(path.resolve(assignmentUploadDir), { recursive: true });
      cb(null, assignmentUploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,
        `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`,
      );
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

/* =========================
   LIST ENDPOINTS
========================= */
router.get("/my-courses/list", requireAuth, getMyCoursesList);
router.get("/search/list", requireAuth, searchCoursesList);
router.get("/public/list", getPublicCoursesList);

/* =========================
   SEARCH (legacy)
========================= */
router.get("/search", requireAuth, searchCourses);

/* =========================
   COURSES BY USER (must be before :courseId)
========================= */
router.get("/user/:userId", requireAuth, getCoursesByUser);

/* =========================
   SUBMIT ASSIGNMENT (NEW)
   POST /api/courses/:assignmentId/submit
   Student only
========================= */
router.post(
  "/:assignmentId/submit",
  ...requireStudent,
  assignmentUpload.any(),
  submitAssignmentById,
);

/* =========================
   SUBMISSIONS LIST (NEW)
   Teacher/Admin/SuperAdmin
========================= */
router.get(
  "/:courseId/assignments/submissions",
  ...requireTeacher,
  getSubmissionsForCourse,
);

/* =========================
   CREATE COURSE
   Admin/SuperAdmin
========================= */
router.post("/", ...requireAdmin, createCourse);

/* =========================
   ASSIGNMENT WORKFLOW
   Teacher/Admin/SuperAdmin
========================= */
router.post("/:courseId/assignments", ...requireTeacher, assignToCourse);

/* =========================
   SUBMIT ASSIGNMENT (legacy alias)
   Old: /:courseId/assignments/:assignmentId/submit
   Student only
========================= */
router.post(
  "/:courseId/assignments/:assignmentId/submit",
  ...requireStudent,
  assignmentUpload.any(),
  (req, res, next) => submitAssignmentById(req, res, next),
);

/* =========================
   ADD ACTIVITY TO SECTION
   Admin/Teacher/SuperAdmin (courseAdminAuth already enforces this)
========================= */
router.post(
  "/:courseId/sections/:sectionId/activities",
  ...courseAdminAuth,
  addActivityToSection,
);

/* =========================
   COURSE ACTIVITY
   Any authenticated
========================= */
router.get("/:courseId/activity", requireAuth, getCourseActivity);

/* =========================
   ARCHIVE COURSE
   Owner OR Admin/SuperAdmin (courseOwnerAuth handles this)
========================= */
router.patch(
  "/:courseId/archive",
  requireAuth,
  courseOwnerAuth,
  setCourseArchived,
);

/* =========================
   DELETE COURSE
   Admin/SuperAdmin
========================= */
router.delete("/:id", ...requireAdmin, deleteCourse);

/* =========================
   GET ALL COURSES
   Any authenticated
========================= */
router.get("/", requireAuth, getAllCourses);

/* =========================
   GET COURSE BY ID (keep last)
========================= */
router.get("/:courseId", requireAuth, getCourseById);

export default router;
