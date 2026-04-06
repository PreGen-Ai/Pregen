import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import axios from "axios";

import Document from "../models/DocumentModel.js";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";
import DocumentACL from "../models/DocumentACL.js";
import DocumentVersion from "../models/DocumentVersion.js";

import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../middleware/documentMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDirectory = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

/**
 * ============================================================
 * Helpers
 * ============================================================
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isAdminLike = (req) =>
  ["admin", "superadmin"].includes((req.user?.role || "").toLowerCase());

const getUserId = (req) => req.user?._id || req.user?.id;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyCursorCreatedAt = (filter, cursor) => {
  if (!cursor) return;
  const [createdAtStr, id] = cursor.split("|");
  const createdAt = new Date(createdAtStr);
  filter.$or = [
    { createdAt: { $lt: createdAt } },
    { createdAt, _id: { $lt: id } },
  ];
};

const nextCursorCreatedAt = (docs, limit) => {
  if (!docs || docs.length < limit) return null;
  const last = docs[docs.length - 1];
  return `${last.createdAt.toISOString()}|${last._id}`;
};

const getMembership = async (userId, courseId) => {
  return CourseMember.findOne({ userId, courseId, status: "active" }).lean();
};

// Permission resolution: owner => admin, else ACL
const getDocPermission = async (userId, doc) => {
  if (!doc) return null;
  if (doc.ownerId.toString() === userId.toString()) return "admin";
  const acl = await DocumentACL.findOne({ documentId: doc._id, userId }).lean();
  return acl?.permissions || null; // "read" | "write" | "admin"
};

const canRead = (p) => ["read", "write", "admin"].includes(p);
const canWrite = (p) => ["write", "admin"].includes(p);
const canAdmin = (p) => ["admin"].includes(p);

/**
 * ============================================================
 * Upload Document
 * - Requires course membership OR platform admin/superadmin
 * - Saves local path unless USE_CLOUDINARY=true
 * - Creates DocumentVersion v1
 * - Creates ACL: owner "admin"
 * ============================================================
 */
export const uploadDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { courseId, description = "", tags = [] } = req.body;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated." });
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file provided." });
    if (!courseId)
      return res
        .status(400)
        .json({ success: false, message: "Course ID is required." });
    if (!isValidObjectId(courseId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid courseId." });

    const membership = await getMembership(userId, courseId);
    if (!membership && !isAdminLike(req)) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course." });
    }

    let url = req.file.path; // local fallback
    let cloudinary_id = null;

    const useCloud = process.env.USE_CLOUDINARY === "true";
    if (useCloud) {
      const uploaded = await uploadToCloudinary(req.file);
      url = uploaded.secure_url;
      cloudinary_id = uploaded.public_id;
    }

    const safeTags = Array.isArray(tags)
      ? tags
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 30)
      : String(tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 30);

    const doc = await Document.create({
      name: req.file.originalname,
      type: req.file.mimetype,
      url,
      size: req.file.size || 0,
      cloudinary_id,
      description: String(description || "").slice(0, 5000),
      ownerId: userId,
      courseId,
      tags: safeTags,
      deleted: false,
      deletedAt: null,
      restoredAt: null,
      version: 1,
    });

    // initial version row
    await DocumentVersion.create({
      documentId: doc._id,
      versionNumber: 1,
      url: doc.url,
      modifiedBy: userId,
      metadata: doc.metadata || {},
      timestamp: new Date(),
    });

    // ACL: owner admin
    await DocumentACL.create({
      documentId: doc._id,
      userId,
      permissions: "admin",
    });

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      document: doc,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Upload failed", error: error.message });
  }
};

/**
 * ============================================================
 * Soft Delete Document
 * - Requires document admin permission OR platform admin/superadmin
 * ============================================================
 */
export const softDeleteDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.id;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    if (!isValidObjectId(docId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid document id" });

    const doc = await Document.findById(docId);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canAdmin(perm) && !isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    doc.deleted = true;
    doc.deletedAt = new Date();
    await doc.save();

    return res.status(200).json({
      success: true,
      message: "Document moved to recycle bin",
      document: doc,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Delete failed", error: error.message });
  }
};

/**
 * ============================================================
 * Restore Document
 * - Requires document admin permission OR platform admin/superadmin
 * ============================================================
 */
export const restoreDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.documentId;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    if (!isValidObjectId(docId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid document id" });

    const doc = await Document.findById(docId);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canAdmin(perm) && !isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    doc.deleted = false;
    doc.deletedAt = null;
    doc.restoredAt = new Date();
    await doc.save();

    return res
      .status(200)
      .json({ success: true, message: "Document restored", document: doc });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Restore failed",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * List Documents in Course (PAGINATED)
 * Query:
 *  /documents/course/:courseId?limit=20&cursor=...&q=...&tag=...
 * ============================================================
 */
export const listDocumentsInCourse = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { courseId } = req.params;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    if (!isValidObjectId(courseId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid course ID" });

    const membership = await getMembership(userId, courseId);
    if (!membership && !isAdminLike(req)) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course." });
    }

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;
    const q = (req.query.q || "").toString().trim();
    const tag = (req.query.tag || "").toString().trim();

    const filter = { courseId, deleted: false };

    if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };
    if (tag) filter.tags = tag;

    applyCursorCreatedAt(filter, cursor);

    const docs = await Document.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: docs,
      cursor: { next: nextCursorCreatedAt(docs, limit) },
      count: docs.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error listing documents",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * Download Document (read permission)
 * ============================================================
 */
export const downloadDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.id;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const doc = await Document.findById(docId);
    if (!doc || doc.deleted)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canRead(perm) && !isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (doc.cloudinary_id) return res.redirect(doc.url);

    if (!fs.existsSync(doc.url)) {
      return res
        .status(404)
        .json({ success: false, message: "File not found on server" });
    }

    return res.download(doc.url, doc.name);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Download failed",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * Preview Document (read permission)
 * ============================================================
 */
export const previewDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.id;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const doc = await Document.findById(docId);
    if (!doc || doc.deleted)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canRead(perm) && !isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (doc.cloudinary_id) {
      return res.status(200).json({
        success: true,
        url: doc.url,
        fileType: doc.type,
        previewSupported: true,
      });
    }

    if (!fs.existsSync(doc.url)) {
      return res
        .status(404)
        .json({ success: false, message: "File not found on server" });
    }

    const supportedPreviewTypes = [
      "image/",
      "application/pdf",
      "video/",
      "audio/",
      "text/",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const ok = supportedPreviewTypes.some((t) => doc.type.startsWith(t));
    if (!ok) {
      return res.status(200).json({
        success: true,
        previewSupported: false,
        message: "Preview not supported. Use download.",
        downloadUrl: `/api/documents/download/${docId}`,
      });
    }

    const base64Data = fs.readFileSync(doc.url, { encoding: "base64" });
    return res.status(200).json({
      success: true,
      fileType: doc.type,
      base64: base64Data,
      fileName: doc.name,
      previewSupported: true,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Preview failed",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * Update Document Metadata/Tags (write permission)
 * - Allowed fields only (prevents overwriting ownerId/courseId/etc)
 * ============================================================
 */
export const updateDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.id;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const doc = await Document.findById(docId);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canWrite(perm) && !isAdminLike(req)) {
      return res
        .status(403)
        .json({ success: false, message: "Not allowed to update document" });
    }

    const { name, description, tags, metadata, classification } = req.body;

    if (name !== undefined) doc.name = String(name).trim().slice(0, 255);
    if (description !== undefined)
      doc.description = String(description).slice(0, 5000);
    if (classification !== undefined) doc.classification = classification;

    if (tags !== undefined) {
      doc.tags = Array.isArray(tags)
        ? tags
            .map((t) => String(t).trim())
            .filter(Boolean)
            .slice(0, 30)
        : String(tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 30);
    }

    if (
      metadata !== undefined &&
      typeof metadata === "object" &&
      metadata !== null
    ) {
      doc.metadata = metadata;
    }

    await doc.save();
    return res
      .status(200)
      .json({ success: true, message: "Document updated", document: doc });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Update failed", error: error.message });
  }
};

/**
 * ============================================================
 * Search Documents (scoped to user's courses, PAGINATED)
 * Query:
 *  /documents/search?q=report&tag=math&limit=20&cursor=...
 * ============================================================
 */
export const searchDocuments = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;

    const q = (req.query.q || "").toString().trim();
    const tag = (req.query.tag || "").toString().trim();

    const memberships = await CourseMember.find({
      userId,
      status: "active",
    }).select("courseId");
    const courseIds = memberships.map((m) => m.courseId);

    const filter = { deleted: false, courseId: { $in: courseIds } };
    if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };
    if (tag) filter.tags = tag;

    applyCursorCreatedAt(filter, cursor);

    const docs = await Document.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    return res.json({
      success: true,
      data: docs,
      cursor: { next: nextCursorCreatedAt(docs, limit) },
      count: docs.length,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Search failed", error: error.message });
  }
};

/**
 * ============================================================
 * Permanently Delete Document (admin permission)
 * - also clears ACL + versions
 * ============================================================
 */
export const permanentlyDeleteDocument = async (req, res) => {
  try {
    const userId = getUserId(req);
    const docId = req.params.id;

    if (!userId)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const doc = await Document.findById(docId);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });

    const perm = await getDocPermission(userId, doc);
    if (!canAdmin(perm) && !isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (doc.cloudinary_id) {
      await cloudinary.uploader.destroy(doc.cloudinary_id, {
        resource_type: "auto",
      });
    }

    await Promise.all([
      Document.deleteOne({ _id: docId }),
      DocumentACL.deleteMany({ documentId: docId }),
      DocumentVersion.deleteMany({ documentId: docId }),
    ]);

    return res.json({ success: true, message: "Document permanently deleted" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Delete failed", error: error.message });
  }
};

/**
 * ============================================================
 * Bulk Restore (admin only)
 * ============================================================
 */
export const bulkRestoreDocuments = async (req, res) => {
  try {
    const { ids = [] } = req.body;

    if (!isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const validIds = ids.filter(isValidObjectId);
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: "No valid ids" });
    }

    const result = await Document.updateMany(
      { _id: { $in: validIds } },
      { $set: { deleted: false, deletedAt: null, restoredAt: new Date() } },
    );

    return res.json({ success: true, restored: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Bulk restore failed",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * Bulk Delete (admin only)
 * ============================================================
 */
export const bulkDeleteDocuments = async (req, res) => {
  try {
    const { ids = [] } = req.body;

    if (!isAdminLike(req)) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const validIds = ids.filter(isValidObjectId);
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: "No valid ids" });
    }

    const docs = await Document.find({ _id: { $in: validIds } }).select(
      "cloudinary_id",
    );
    for (const d of docs) {
      if (d.cloudinary_id) {
        await cloudinary.uploader.destroy(d.cloudinary_id, {
          resource_type: "auto",
        });
      }
    }

    await Promise.all([
      Document.deleteMany({ _id: { $in: validIds } }),
      DocumentACL.deleteMany({ documentId: { $in: validIds } }),
      DocumentVersion.deleteMany({ documentId: { $in: validIds } }),
    ]);

    return res.json({ success: true, deleted: validIds.length });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Bulk delete failed",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * Export PDF (API2PDF)
 * ============================================================
 */
export const exportPDF = async (req, res) => {
  try {
    const { html, filename } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: "HTML content is required to generate PDF",
      });
    }

    const result = await axios.post(
      "https://v2.api2pdf.com/pdf/wkhtmltopdf",
      { html, inlinePdf: false, fileName: filename },
      {
        headers: {
          Authorization: `Bearer ${process.env.API2PDF_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const pdfBase64 = result.data.pdf;
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename || "document.pdf"}"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Export Error:", error.response?.data || error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to generate PDF" });
  }
};
