// backend/src/routes/adminRoutes.js
import express from "express";
import mongoose from "mongoose";
import { Parser } from "json2csv";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";

import {
  requireAdmin,
  requireSuperAdmin,
} from "../middleware/authMiddleware.js";
import { requireTenant } from "../middleware/tenant.js";
import {
  getSuperadminAiCostPayload,
  getSuperadminAuditLogsPayload,
  getSuperadminFeatureFlagsPayload,
  getSuperadminOverviewPayload,
} from "../services/platformAnalyticsService.js";

// ✅ Tenants CRUD router (you already have it)
import systemTenantsRoutes from "./admin/systemTenants.routes.js";

/**
 * Export:
 * - adminRouter -> mount at /api/admin
 * - adminSystemRouter -> mount at /api/admin/system
 *
 * IMPORTANT: server.js error earlier expected a DEFAULT export from this file
 * so we export default = adminSystemRouter at the bottom.
 */

const adminRouter = express.Router();
const adminSystemRouter = express.Router();

/* ======================================================
   DB guard
====================================================== */
function requireDb(req, res, next) {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({
      success: false,
      message: "Database not connected",
    });
  }
  return next();
}

/* ======================================================
   Time range helpers (7d, 30d, 90d)
====================================================== */
function parseRangeToMs(range) {
  const r = String(range || "7d")
    .toLowerCase()
    .trim();
  if (r === "24h") return 24 * 60 * 60 * 1000;
  if (r.endsWith("d")) {
    const n = Number(r.slice(0, -1));
    if (Number.isFinite(n) && n > 0) return n * 24 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;
}
function sinceDate(range) {
  const ms = parseRangeToMs(range);
  return new Date(Date.now() - ms);
}

/* ======================================================
   Tenant resolver for admin routes
   - Admin routes are tenant-scoped
   - Superadmin can operate on a tenant by passing:
     x-tenant-id header OR ?tenantId=...
====================================================== */
function resolveTenantId(req) {
  const header = req.get("x-tenant-id");
  const query = req.query?.tenantId;
  const body = req.body?.tenantId;
  return (
    (header && String(header).trim()) ||
    (query && String(query).trim()) ||
    (body && String(body).trim()) ||
    (req.tenantId && String(req.tenantId).trim()) ||
    null
  );
}
function requireTenantForAdmin(req, res, next) {
  // requireTenant middleware already allows SUPERADMIN without tenant scope
  // but admin module endpoints should still be tenant-scoped
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      message: "Missing tenantId",
      hint: "Send x-tenant-id header or ?tenantId=... for superadmin admin-module actions",
    });
  }
  req.tenantId = tenantId;
  return next();
}

/* ======================================================
   Upload for branding/logo
====================================================== */
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

/* ======================================================
   Collections
====================================================== */
function col(name) {
  return mongoose.connection.db.collection(name);
}
function safeInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function upper(v) {
  return v === undefined || v === null ? v : String(v).trim().toUpperCase();
}
function lower(v) {
  return v === undefined || v === null ? v : String(v).trim().toLowerCase();
}
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function applyUserStatusFilter(filter, statusValue) {
  const status = lower(statusValue) || "";
  if (status === "active" || status === "enabled") {
    filter.enabled = { $ne: false };
    filter.blocked = { $ne: true };
  }
  if (status === "disabled") filter.enabled = false;
  if (status === "blocked") filter.blocked = true;
  return filter;
}
function pickUser(u) {
  if (!u) return u;
  return {
    _id: u._id,
    username: u.username,
    name: u.name,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    enabled: u.enabled !== false,
    blocked: !!u.blocked,
    status: u.blocked ? "blocked" : u.enabled === false ? "disabled" : "enabled",
    tenantId: u.tenantId || u.orgId || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/* ======================================================
   /api/admin (Admin module) - TENANT SCOPED
====================================================== */
adminRouter.use(
  ...requireAdmin,
  requireDb,
  requireTenant,
  requireTenantForAdmin,
);

/**
 * GET /api/admin/dashboard/metrics?range=7d
 * Used by your Admin Analytics & dashboard KPI cards
 */
adminRouter.get("/dashboard/metrics", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { range = "7d" } = req.query;
    const since = sinceDate(range);

    const usersQ = { tenantId };
    const activeQ = { tenantId, enabled: { $ne: false } };

    const totalUsers = await col("users").countDocuments(usersQ);
    const teachers = await col("users").countDocuments({
      ...usersQ,
      role: { $in: ["TEACHER", "teacher"] },
    });
    const students = await col("users").countDocuments({
      ...usersQ,
      role: { $in: ["STUDENT", "student"] },
    });

    const aiRequests = await col("ai_usages").countDocuments({
      tenantId,
      createdAt: { $gte: since },
    });

    const reports = await col("report_analytics").countDocuments({
      tenantId,
      createdAt: { $gte: since },
    });

    const activeTeachers = await col("users").countDocuments({
      ...activeQ,
      role: { $in: ["TEACHER", "teacher"] },
    });

    // avg score over report_analytics (if field exists)
    const avgAgg = await col("report_analytics")
      .aggregate([
        { $match: { tenantId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: "$overall_score" },
            graded: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const avgScore = avgAgg?.[0]?.avgScore ?? 0;

    return res.json({
      success: true,
      range,
      metrics: {
        avgScore: Math.round(avgScore || 0),
        aiGraded: safeInt(avgAgg?.[0]?.graded, 0),
        aiRequests,
        activeTeachers,
        totalUsers,
        teachers,
        students,
        reports,
      },
    });
  } catch (e) {
    console.error("dashboard/metrics error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load metrics" });
  }
});

/* =========================
   USERS
========================= */

/**
 * GET /api/admin/users?limit=50&page=1&q=&role=&status=
 * status: active | disabled | blocked | all
 */
adminRouter.get("/users", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const limit = Math.min(200, Math.max(1, safeInt(req.query.limit, 50)));
    const page = Math.max(1, safeInt(req.query.page, 1));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();
    const status = String(req.query.status || "")
      .trim()
      .toLowerCase();

    const filter = { tenantId };

    if (role) filter.role = { $regex: `^${escapeRegex(role)}$`, $options: "i" };

    applyUserStatusFilter(filter, status);

    if (q) {
      const qRegex = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [
        { email: qRegex },
        { username: qRegex },
        { name: qRegex },
        { firstName: qRegex },
        { lastName: qRegex },
      ];
    }

    const [itemsRaw, total] = await Promise.all([
      col("users")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col("users").countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      items: itemsRaw.map(pickUser),
    });
  } catch (e) {
    console.error("GET /admin/users error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list users" });
  }
});

/**
 * POST /api/admin/users/invite
 * body: { email, role, username?, name?, tenantId? }
 *
 * Creates a user with a temporary password and returns it.
 * If you already have an email service, wire it in later.
 */
adminRouter.post("/users/invite", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const role = upper(req.body.role || "STUDENT");
    const username =
      String(req.body.username || "").trim() || email.split("@")[0];
    const name = String(req.body.name || "").trim() || username;

    if (!email) {
      return res.status(400).json({ success: false, message: "Missing email" });
    }

    const exists = await col("users").findOne({ tenantId, email });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "User already exists" });
    }

    const tempPassword = crypto.randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const doc = {
      tenantId,
      email,
      username,
      name,
      role,
      enabled: true,
      blocked: false,
      password: passwordHash,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ins = await col("users").insertOne(doc);

    return res.status(201).json({
      success: true,
      user: pickUser({ ...doc, _id: ins.insertedId }),
      tempPassword, // show once in UI
    });
  } catch (e) {
    console.error("POST /admin/users/invite error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to invite user" });
  }
});

/**
 * PATCH /api/admin/users/:userId/status
 * body: { enabled: boolean }
 */
adminRouter.patch("/users/:userId/status", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.userId;

    const enabled = req.body.enabled;
    if (typeof enabled !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "enabled must be boolean" });
    }

    const r = await col("users").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId), tenantId },
      { $set: { enabled, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    return res.json({ success: true, user: pickUser(r) });
  } catch (e) {
    console.error("PATCH /admin/users/:id/status error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update status" });
  }
});

/**
 * PATCH /api/admin/users/:userId/role
 * body: { role }
 *
 * Fixes your "Missing tenantId" issue by requiring tenantId scope.
 * If superadmin is acting, send x-tenant-id.
 */
adminRouter.patch("/users/:userId/role", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.userId;
    const role = upper(req.body.role);

    if (!role)
      return res.status(400).json({ success: false, message: "Missing role" });

    const allowed = [
      "STUDENT",
      "TEACHER",
      "ADMIN",
      "PARENT",
      "SUPERADMIN",
      "SUPER_ADMIN",
    ];
    if (!allowed.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const normalizedRole = role === "SUPER_ADMIN" ? "SUPERADMIN" : role;

    const r = await col("users").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId), tenantId },
      { $set: { role: normalizedRole, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    return res.json({ success: true, user: pickUser(r) });
  } catch (e) {
    console.error("PATCH /admin/users/:id/role error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update role" });
  }
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Returns a new temp password
 */
adminRouter.post("/users/:userId/reset-password", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.userId;

    const tempPassword = crypto.randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const r = await col("users").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId), tenantId },
      {
        $set: {
          password: passwordHash,
          mustChangePassword: true,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.json({
      success: true,
      user: pickUser(r),
      tempPassword,
    });
  } catch (e) {
    console.error("POST /admin/users/:id/reset-password error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reset password" });
  }
});

/* =========================
   CLASSES
   - Uses collection "classes"
   - If your app uses a different collection name, change it here only
========================= */

/**
 * GET /api/admin/classes
 */
adminRouter.get("/classes", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const limit = Math.min(200, Math.max(1, safeInt(req.query.limit, 50)));
    const page = Math.max(1, safeInt(req.query.page, 1));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();

    const filter = { tenantId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      col("classes")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col("classes").countDocuments(filter),
    ]);

    return res.json({ success: true, page, limit, total, items });
  } catch (e) {
    console.error("GET /admin/classes error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list classes" });
  }
});

/**
 * POST /api/admin/classes
 * body: { name, code?, grade?, teacherId? }
 */
adminRouter.post("/classes", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const name = String(req.body.name || "").trim();
    if (!name)
      return res.status(400).json({ success: false, message: "Missing name" });

    const doc = {
      tenantId,
      name,
      code: String(req.body.code || "").trim() || `CLS-${Date.now()}`,
      grade: req.body.grade ?? null,
      teacherId: req.body.teacherId
        ? new mongoose.Types.ObjectId(req.body.teacherId)
        : null,
      studentIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ins = await col("classes").insertOne(doc);
    return res
      .status(201)
      .json({ success: true, item: { ...doc, _id: ins.insertedId } });
  } catch (e) {
    console.error("POST /admin/classes error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create class" });
  }
});

/**
 * POST /api/admin/classes/:classId/assign-teacher
 * body: { teacherId }
 */
adminRouter.post("/classes/:classId/assign-teacher", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const classId = req.params.classId;
    const teacherId = String(req.body.teacherId || "").trim();
    if (!teacherId)
      return res
        .status(400)
        .json({ success: false, message: "Missing teacherId" });

    const r = await col("classes").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(classId), tenantId },
      {
        $set: {
          teacherId: new mongoose.Types.ObjectId(teacherId),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "Class not found" });
    return res.json({ success: true, item: r });
  } catch (e) {
    console.error("POST /admin/classes/:id/assign-teacher error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to assign teacher" });
  }
});

/**
 * POST /api/admin/classes/:classId/enroll
 * body: { studentIds: [] }
 */
adminRouter.post("/classes/:classId/enroll", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const classId = req.params.classId;
    const studentIds = Array.isArray(req.body.studentIds)
      ? req.body.studentIds
      : [];

    if (!studentIds.length) {
      return res
        .status(400)
        .json({
          success: false,
          message: "studentIds must be a non-empty array",
        });
    }

    const ids = studentIds.map((id) => new mongoose.Types.ObjectId(id));

    const r = await col("classes").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(classId), tenantId },
      {
        $addToSet: { studentIds: { $each: ids } },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );

    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "Class not found" });
    return res.json({ success: true, item: r });
  } catch (e) {
    console.error("POST /admin/classes/:id/enroll error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to enroll students" });
  }
});

/* =========================
   BRANDING (stored in tenants.branding)
========================= */

/**
 * GET /api/admin/branding
 */
adminRouter.get("/branding", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const t = await col("tenants").findOne({ tenantId });
    if (!t)
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });

    return res.json({ success: true, branding: t.branding || {} });
  } catch (e) {
    console.error("GET /admin/branding error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load branding" });
  }
});

/**
 * PUT /api/admin/branding
 * body: { logoUrl?, primaryColor?, subdomain? }
 */
adminRouter.put("/branding", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const patch = {};
    if (req.body.logoUrl !== undefined)
      patch["branding.logoUrl"] = String(req.body.logoUrl || "").trim();
    if (req.body.primaryColor !== undefined)
      patch["branding.primaryColor"] = String(
        req.body.primaryColor || "",
      ).trim();
    if (req.body.subdomain !== undefined)
      patch["branding.subdomain"] = String(req.body.subdomain || "").trim();

    const r = await col("tenants").findOneAndUpdate(
      { tenantId },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!r.value)
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    return res.json({ success: true, branding: r.value.branding || {} });
  } catch (e) {
    console.error("PUT /admin/branding error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update branding" });
  }
});

/**
 * POST /api/admin/branding/logo
 * multipart form-data: logo (file)
 */
adminRouter.post("/branding/logo", upload.single("logo"), async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "Missing logo file" });

    const publicUrl = `/uploads/${req.file.filename}`;

    const r = await col("tenants").findOneAndUpdate(
      { tenantId },
      { $set: { "branding.logoUrl": publicUrl, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!r.value)
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    return res.json({
      success: true,
      logoUrl: publicUrl,
      branding: r.value.branding || {},
    });
  } catch (e) {
    console.error("POST /admin/branding/logo error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to upload logo" });
  }
});

/* =========================
   AI SETTINGS (stored in tenantsettings)
   - collection name in your screenshot: tenantsettings
========================= */

/**
 * GET /api/admin/ai/settings
 */
adminRouter.get("/ai/settings", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const doc = await col("tenantsettings").findOne({ tenantId });

    if (!doc) {
      const fresh = {
        tenantId,
        ai: {
          enabled: true,
          model: "default",
          temperature: 0.4,
          maxTokens: 1024,
          hardCapTokensPerMonth: 0,
          softCapTokensPerMonth: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await col("tenantsettings").insertOne(fresh);
      return res.json({ success: true, settings: fresh.ai });
    }

    return res.json({ success: true, settings: doc.ai || {} });
  } catch (e) {
    console.error("GET /admin/ai/settings error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load AI settings" });
  }
});

/**
 * PUT /api/admin/ai/settings
 * body: any subset of ai settings
 */
adminRouter.put("/ai/settings", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const allowed = [
      "enabled",
      "model",
      "temperature",
      "maxTokens",
      "hardCapTokensPerMonth",
      "softCapTokensPerMonth",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[`ai.${k}`] = req.body[k];
    }

    const r = await col("tenantsettings").findOneAndUpdate(
      { tenantId },
      {
        $set: { ...patch, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date(), tenantId },
      },
      { upsert: true, returnDocument: "after" },
    );

    return res.json({ success: true, settings: r.value?.ai || {} });
  } catch (e) {
    console.error("PUT /admin/ai/settings error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update AI settings" });
  }
});

/* =========================
   ANALYTICS SUMMARY + EXPORT
========================= */

/**
 * GET /api/admin/analytics/summary?range=7d
 * Matches your frontend usage
 */
adminRouter.get("/analytics/summary", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { range = "7d" } = req.query;
    const since = sinceDate(range);

    const [aiRequests, activeTeachers] = await Promise.all([
      col("ai_usages").countDocuments({ tenantId, createdAt: { $gte: since } }),
      col("users").countDocuments({
        tenantId,
        role: { $in: ["TEACHER", "teacher"] },
        enabled: { $ne: false },
      }),
    ]);

    const perfAgg = await col("report_analytics")
      .aggregate([
        { $match: { tenantId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: "$overall_score" },
            aiGraded: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const avgScore = perfAgg?.[0]?.avgScore ?? 0;
    const aiGraded = safeInt(perfAgg?.[0]?.aiGraded, 0);

    return res.json({
      success: true,
      range,
      summary: {
        avgScore: Math.round(avgScore || 0),
        aiGraded,
        aiRequests,
        activeTeachers,
      },
    });
  } catch (e) {
    console.error("GET /admin/analytics/summary error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load analytics summary" });
  }
});

/**
 * GET /api/admin/analytics/export/:type?range=7d
 * type: performance | ai-usage
 */
adminRouter.get("/analytics/export/:type", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { type } = req.params;
    const { range = "7d" } = req.query;

    let collectionName;
    if (type === "performance") collectionName = "report_analytics";
    else if (type === "ai-usage") collectionName = "ai_usages";
    else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid export type" });
    }

    const data = await col(collectionName)
      .find({ tenantId })
      .limit(5000)
      .toArray();

    if (!data.length) {
      return res
        .status(200)
        .json({ success: true, message: "No data to export" });
    }

    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment(`${type}-export-${range}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
});

/* ======================================================
   /api/admin/system (System) - SUPERADMIN / ADMIN
====================================================== */
adminSystemRouter.use(requireDb);

/**
 * GET /api/admin/system/overview (ADMIN or SUPERADMIN)
 */
adminSystemRouter.get("/overview", ...requireAdmin, async (req, res) => {
  try {
    const [tenants, users] = await Promise.all([
      col("tenants").countDocuments({}),
      col("users").countDocuments({}),
    ]);
    return res.json({ success: true, overview: { tenants, users } });
  } catch (e) {
    console.error("system overview error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load system overview" });
  }
});

/**
 * GET /api/admin/system/logs/recent (ADMIN or SUPERADMIN)
 * If you have a logs collection, switch name here.
 */
adminSystemRouter.get("/logs/recent", ...requireAdmin, async (req, res) => {
  try {
    const items = await col("system_logs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.json({
      success: true,
      items: Array.isArray(items) ? items : [],
    });
  } catch {
    // If collection does not exist, return empty
    return res.json({ success: true, items: [] });
  }
});

/**
 * GET /api/admin/system/super/overview (SUPERADMIN)
 * Returns flat fields matching the SuperDashboardPage KPI cards.
 */
adminSystemRouter.get(
  "/super/overview",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const payload = await getSuperadminOverviewPayload();
      return res.json({ success: true, ...payload });
    } catch (e) {
      console.error("super overview error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to load super overview" });
    }
  },
);

/**
 * ✅ Tenants CRUD router under:
 * /api/admin/system/super/tenants...
 */
adminSystemRouter.use("/super", ...requireSuperAdmin, systemTenantsRoutes);

/**
 * GET /api/admin/system/super/ai-cost?range=7d&limit=200
 * Aggregates ai_usages by tenantId
 */
adminSystemRouter.get(
  "/super/ai-cost",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const payload = await getSuperadminAiCostPayload({
        range: req.query.range || "7d",
        tenantId: req.query.tenantId || null,
        limit: req.query.limit || 50,
        skip: req.query.skip || 0,
        q: req.query.q || "",
        status: req.query.status || "",
        provider: req.query.provider || "",
        model: req.query.model || "",
        cacheHit: req.query.cacheHit ?? "",
      });
      return res.json({ success: true, ...payload });

      // join tenant names
      const tenantIds = tenantRows.map((r) => r._id).filter(Boolean);
      const tenants = await col("tenants")
        .find({ tenantId: { $in: tenantIds } })
        .project({ tenantId: 1, name: 1, plan: 1, status: 1 })
        .toArray();

      const nameMap = new Map(tenants.map((t) => [t.tenantId, t]));

      const byTenant = tenantRows.map((r) => {
        const t = nameMap.get(r._id) || {};
        return {
          tenantId: r._id,
          name: t.name || r._id || "—",
          plan: t.plan || "—",
          status: t.status || "—",
          requests: safeInt(r.requests, 0),
          tokens: safeInt(r.tokens, 0),
          cost: Math.round(Number(r.cost || 0) * 100) / 100,
        };
      });

      const byFeature = featureRows.map((r) => ({
        feature: r._id || "unknown",
        requests: safeInt(r.requests, 0),
        tokens: safeInt(r.tokens, 0),
        cost: Math.round(Number(r.cost || 0) * 100) / 100,
      }));

      return res.json({ success: true, range, byTenant, byFeature, items: byTenant });
    } catch (e) {
      console.error("ai-cost error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to load AI cost" });
    }
  },
);

/**
 * GET /api/admin/system/super/feature-flags
 * Stored in "feature_flags" collection
 */
adminSystemRouter.get(
  "/super/feature-flags",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const payload = await getSuperadminFeatureFlagsPayload();
      return res.json({ success: true, ...payload });
    } catch (error) {
      console.error("feature-flags error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to load feature flags",
      });
    }
  },
);

/**
 * GET /api/admin/system/super/logs
 * Stored in "system_audit_logs" collection
 */
adminSystemRouter.get("/super/logs", ...requireSuperAdmin, async (req, res) => {
  try {
    const payload = await getSuperadminAuditLogsPayload({
      limit: req.query.limit || 200,
    });
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error("super-logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load platform logs",
    });
  }
});

/**
 * GET /api/admin/system/super/ai-requests?range=7d&limit=200
 */
adminSystemRouter.get(
  "/super/ai-requests",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const payload = await getSuperadminAiCostPayload({
        range: req.query.range || "7d",
        tenantId: req.query.tenantId || null,
        limit: req.query.limit || 50,
        skip: req.query.skip || 0,
        q: req.query.q || "",
        status: req.query.status || "",
        provider: req.query.provider || "",
        model: req.query.model || "",
        cacheHit: req.query.cacheHit ?? "",
      });

      return res.json({
        success: true,
        range: payload.range,
        state: payload.recentRequests.state,
        label: payload.recentRequests.label,
        lastUpdated: payload.recentRequests.lastUpdated,
        meta: payload.recentRequests.meta,
        items: payload.recentRequests.items,
      });
    } catch (e) {
      console.error("ai-requests error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to load AI requests" });
    }
  },
);

/**
 * GET /api/admin/system/super/ai-requests/summary?range=7d
 */
adminSystemRouter.get(
  "/super/ai-requests/summary",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const payload = await getSuperadminAiCostPayload({
        range: req.query.range || "7d",
        tenantId: req.query.tenantId || null,
        limit: req.query.limit || 50,
        skip: req.query.skip || 0,
      });
      return res.json({ success: true, ...payload });
    } catch (e) {
      console.error("ai-requests/summary error:", e);
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to load AI requests summary",
        });
    }
  },
);

/**
 * GET /api/admin/system/users (SUPERADMIN)
 * Lists users across all tenants
 */
adminSystemRouter.get("/users", ...requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, safeInt(req.query.limit, 50)));
    const page = Math.max(1, safeInt(req.query.page, 1));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();
    const status = String(req.query.status || "").trim();
    const tenantId = String(req.query.tenantId || "").trim();

    const filter = {};
    if (role) filter.role = { $regex: `^${escapeRegex(role)}$`, $options: "i" };
    if (tenantId) filter.tenantId = tenantId;

    applyUserStatusFilter(filter, status);

    if (q) {
      const qRegex = { $regex: escapeRegex(q), $options: "i" };
      const matchingTenants = await col("tenants")
        .find({
          $or: [{ name: qRegex }, { tenantId: qRegex }],
        })
        .project({ tenantId: 1 })
        .limit(50)
        .toArray();
      const matchingTenantIds = matchingTenants
        .map((item) => item?.tenantId)
        .filter(Boolean);

      filter.$or = [
        { email: qRegex },
        { username: qRegex },
        { name: qRegex },
        { firstName: qRegex },
        { lastName: qRegex },
        { tenantId: qRegex },
        { orgId: qRegex },
        ...(matchingTenantIds.length
          ? [{ tenantId: { $in: matchingTenantIds } }]
          : []),
      ];
    }

    const [itemsRaw, total] = await Promise.all([
      col("users")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col("users").countDocuments(filter),
    ]);

    const tenantIds = Array.from(
      new Set(itemsRaw.map((item) => item?.tenantId).filter(Boolean)),
    );
    const tenants = tenantIds.length
      ? await col("tenants")
          .find({ tenantId: { $in: tenantIds } })
          .project({ tenantId: 1, name: 1 })
          .toArray()
      : [];
    const tenantNameMap = new Map(
      tenants.map((tenant) => [tenant.tenantId, tenant.name || tenant.tenantId]),
    );

    return res.json({
      success: true,
      page,
      limit,
      total,
      items: itemsRaw.map((item) => ({
        ...pickUser(item),
        tenantName: tenantNameMap.get(item.tenantId) || null,
      })),
    });
  } catch (e) {
    console.error("system users error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list system users" });
  }
});

/**
 * POST /api/admin/system/createAdmin (SUPERADMIN)
 * body: { tenantId, email, username?, name? }
 */
adminSystemRouter.post(
  "/createAdmin",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const tenantId = String(req.body.tenantId || "").trim();
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();

      if (!tenantId)
        return res
          .status(400)
          .json({ success: false, message: "Missing tenantId" });
      if (!email)
        return res
          .status(400)
          .json({ success: false, message: "Missing email" });

      const exists = await col("users").findOne({ tenantId, email });
      if (exists)
        return res
          .status(409)
          .json({ success: false, message: "User already exists" });

      const username =
        String(req.body.username || "").trim() || email.split("@")[0];
      const name = String(req.body.name || "").trim() || username;

      // Accept explicit password or generate a temp one
      const explicitPassword = String(req.body.password || "").trim();
      const plainPassword = explicitPassword || crypto.randomBytes(6).toString("base64url");
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      const doc = {
        tenantId,
        tenantIds: [tenantId],
        email,
        username,
        name,
        role: "ADMIN",
        enabled: true,
        blocked: false,
        password: passwordHash,
        mustChangePassword: !explicitPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ins = await col("users").insertOne(doc);

      const responsePayload = {
        success: true,
        user: pickUser({ ...doc, _id: ins.insertedId }),
      };
      // Only reveal tempPassword if no explicit password was provided
      if (!explicitPassword) responsePayload.tempPassword = plainPassword;

      return res.status(201).json(responsePayload);
    } catch (e) {
      console.error("createAdmin error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to create admin" });
    }
  },
);

/**
 * PUT /api/admin/system/promote/:userId (SUPERADMIN)
 * Promotes user to ADMIN (system-wide)
 */
adminSystemRouter.put(
  "/promote/:userId",
  ...requireSuperAdmin,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const r = await col("users").findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { role: "ADMIN", updatedAt: new Date() } },
        { returnDocument: "after" },
      );

      if (!r)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      return res.json({ success: true, user: pickUser(r) });
    } catch (e) {
      console.error("promote error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to promote user" });
    }
  },
);

/* ======================================================
   Exports
====================================================== */
export { adminRouter, adminSystemRouter };

// ✅ default export fixes: "does not provide an export named default"
export default adminSystemRouter;
