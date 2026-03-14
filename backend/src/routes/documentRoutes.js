// backend/src/routes/documentRoutes.js
import express from "express";
import {
  uploadDocument,
  downloadDocument,
  softDeleteDocument,
  previewDocument,
  listDocumentsInCourse,
  restoreDocument,
  searchDocuments,
  updateDocument,
  permanentlyDeleteDocument,
  bulkRestoreDocuments,
  bulkDeleteDocuments,
  exportPDF,
} from "../controllers/documentController.js";

import { upload } from "../middleware/documentMiddleware.js";

import {
  requireAuth,
  requireAdmin,
  requireTeacher,
  requireStudent,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   UPLOAD
   Teacher/Admin/SuperAdmin
====================================================== */
router.post(
  "/upload",
  ...requireTeacher,
  upload.single("document"),
  uploadDocument,
);

/* ======================================================
   SEARCH DOCUMENTS
   Any authenticated role (student, teacher, admin, superadmin, parent)
====================================================== */
router.get(
  "/search",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  searchDocuments,
);

/* ======================================================
   BULK OPERATIONS (Restore, Delete)
   Admin/SuperAdmin
====================================================== */
router.put("/bulk-restore", ...requireAdmin, bulkRestoreDocuments);

router.delete("/bulk-delete", ...requireAdmin, bulkDeleteDocuments);

/* ======================================================
   STATIC ROUTES — Avoid conflicts with dynamic IDs
====================================================== */

// Download document file
router.get(
  "/download/:id",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  downloadDocument,
);

// Preview document
router.get(
  "/preview/:id",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  previewDocument,
);

/* ======================================================
   DOCUMENT LIFECYCLE (Recycle bin)
====================================================== */

// Soft delete document (move to recycle bin)
router.put("/:id/soft-delete", ...requireTeacher, softDeleteDocument);

// Restore soft-deleted document
router.put("/:documentId/restore", ...requireTeacher, restoreDocument);

// Update document details (e.g., rename, metadata)
router.put("/:id", ...requireTeacher, updateDocument);

// Permanently delete document
router.delete(
  "/:id/permanent-delete",
  ...requireAdmin,
  permanentlyDeleteDocument,
);

/* ======================================================
   COURSE DOCUMENTS LIST
   Any authenticated role
====================================================== */
router.get(
  "/course/:courseId",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  listDocumentsInCourse,
);

/* ======================================================
   PDF export
   Any authenticated role (recommended)
====================================================== */
router.post(
  "/export-pdf",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  exportPDF,
);

export default router;
