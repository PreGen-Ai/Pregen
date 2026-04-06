// backend/src/routes/admin/systemTenants.routes.js
import express from "express";
import Tenant from "../../models/Tenant.js";
import { requireSuperAdmin } from "../../middleware/authMiddleware.js";

const router = express.Router();

/**
 * Helpers
 */
function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function clampLimit(v, def = 200, max = 500) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

/**
 * ✅ LIST tenants
 * GET /api/admin/system/super/tenants?limit=200&q=abc&status=active&plan=pro
 */
router.get("/tenants", ...requireSuperAdmin, async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit, 200, 500);
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const plan = String(req.query.plan || "").trim();

    const filter = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;

    if (q) {
      filter.$or = [
        { tenantId: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { "branding.subdomain": { $regex: q, $options: "i" } },
      ];
    }

    const items = await Tenant.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, items, count: items.length });
  } catch (err) {
    console.error("GET /system/super/tenants failed:", err);
    res.status(500).json({ success: false, message: "Failed to load tenants" });
  }
});

/**
 * ✅ CREATE tenant
 * POST /api/admin/system/super/tenants
 */
router.post("/tenants", ...requireSuperAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    const tenantId = String(body.tenantId || "").trim();
    const name = String(body.name || "").trim();

    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "name is required" });
    }

    const exists = await Tenant.findOne({ tenantId }).lean();
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "tenantId already exists" });
    }

    const doc = await Tenant.create({
      tenantId,
      name,
      status: body.status || "trial",
      plan: body.plan || "basic",
      limits: body.limits || {},
      branding: body.branding || {},
      members: body.members || {},
    });

    res.status(201).json({ success: true, tenant: doc });
  } catch (err) {
    console.error("POST /system/super/tenants failed:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to create tenant" });
  }
});

/**
 * ✅ GET single tenant
 * GET /api/admin/system/super/tenants/:tenantId
 */
router.get("/tenants/:tenantId", ...requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId || "").trim();

    const doc = await Tenant.findOne({ tenantId }).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    res.json({ success: true, tenant: doc });
  } catch (err) {
    console.error("GET /system/super/tenants/:tenantId failed:", err);
    res.status(500).json({ success: false, message: "Failed to load tenant" });
  }
});

/**
 * ✅ UPDATE tenant
 * PATCH /api/admin/system/super/tenants/:tenantId
 *
 * Allowed fields: name, status, plan, limits, branding, members
 * tenantId itself is immutable (unique key)
 */
router.patch("/tenants/:tenantId", ...requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId || "").trim();
    const body = req.body || {};

    const updates = pick(body, [
      "name",
      "status",
      "plan",
      "limits",
      "branding",
      "members",
    ]);

    if (updates.name !== undefined)
      updates.name = String(updates.name || "").trim();

    const doc = await Tenant.findOneAndUpdate(
      { tenantId },
      { $set: updates },
      { new: true },
    ).lean();

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    res.json({ success: true, tenant: doc });
  } catch (err) {
    console.error("PATCH /system/super/tenants/:tenantId failed:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update tenant" });
  }
});

/**
 * ✅ DELETE tenant
 * DELETE /api/admin/system/super/tenants/:tenantId
 */
router.delete("/tenants/:tenantId", ...requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId || "").trim();

    const out = await Tenant.findOneAndDelete({ tenantId }).lean();
    if (!out) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    res.json({ success: true, deleted: true, tenantId });
  } catch (err) {
    console.error("DELETE /system/super/tenants/:tenantId failed:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete tenant" });
  }
});

export default router;
