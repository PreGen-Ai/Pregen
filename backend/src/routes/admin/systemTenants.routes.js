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

function sanitizeString(value, { max = 200, allowEmpty = true } = {}) {
  if (value === undefined) return undefined;
  const normalized = String(value || "").trim();
  if (!normalized) {
    if (!allowEmpty) {
      throw new Error("Value is required");
    }
    return "";
  }
  if (normalized.length > max) {
    throw new Error(`Value exceeds ${max} characters`);
  }
  return normalized;
}

function sanitizeNumber(value, { min = 0, max = 1_000_000_000 } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new Error(`Numeric value must be between ${min} and ${max}`);
  }
  return normalized;
}

function normalizeTenantPayload(body = {}, { requireIdentity = false } = {}) {
  const tenantId = sanitizeString(body.tenantId, { max: 80, allowEmpty: !requireIdentity });
  const name = sanitizeString(body.name, { max: 140, allowEmpty: !requireIdentity });
  const description = sanitizeString(body.description, { max: 500 });
  const plan = sanitizeString(body.plan, { max: 60 }) || undefined;
  const status = sanitizeString(body.status, { max: 40 }) || undefined;
  const logoUrl = sanitizeString(body.branding?.logoUrl, { max: 500 });
  const primaryColor = sanitizeString(body.branding?.primaryColor, { max: 32 });
  const subdomain = sanitizeString(body.branding?.subdomain, { max: 120 });
  const ticketLimit = sanitizeNumber(body.limits?.ticketLimit, { min: 0, max: 1_000_000 });
  const studentLimit = sanitizeNumber(body.limits?.studentLimit, { min: 0, max: 1_000_000 });
  const aiHardCapTokensPerMonth = sanitizeNumber(
    body.limits?.aiHardCapTokensPerMonth,
    { min: 0, max: 10_000_000_000 },
  );
  const aiSoftCapTokensPerMonth = sanitizeNumber(
    body.limits?.aiSoftCapTokensPerMonth,
    { min: 0, max: 10_000_000_000 },
  );
  const amount = sanitizeNumber(body.pricing?.amount, { min: 0, max: 1_000_000_000 });
  const currency = sanitizeString(body.pricing?.currency, { max: 12 }) || undefined;

  return {
    ...(tenantId !== undefined ? { tenantId } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status ? { status } : {}),
    ...(plan ? { plan } : {}),
    limits: {
      ...(studentLimit !== undefined ? { studentLimit } : {}),
      ...(ticketLimit !== undefined ? { ticketLimit } : {}),
      ...(aiHardCapTokensPerMonth !== undefined ? { aiHardCapTokensPerMonth } : {}),
      ...(aiSoftCapTokensPerMonth !== undefined ? { aiSoftCapTokensPerMonth } : {}),
    },
    branding: {
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(primaryColor !== undefined ? { primaryColor } : {}),
      ...(subdomain !== undefined ? { subdomain } : {}),
    },
    pricing: {
      ...(amount !== undefined ? { amount } : {}),
      ...(currency ? { currency: currency.toUpperCase() } : {}),
    },
    ...(body.members && typeof body.members === "object" ? { members: body.members } : {}),
  };
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
    const body = normalizeTenantPayload(req.body || {}, { requireIdentity: true });

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
      description: body.description || "",
      status: body.status || "trial",
      plan: body.plan || "basic",
      limits: body.limits || {},
      branding: body.branding || {},
      pricing: body.pricing || {},
      members: body.members || {},
    });

    res.status(201).json({ success: true, tenant: doc });
  } catch (err) {
    console.error("POST /system/super/tenants failed:", err);
    if (/required|exceeds|between/i.test(err?.message || "")) {
      return res
        .status(400)
        .json({ success: false, message: err.message });
    }
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
    const body = normalizeTenantPayload(req.body || {});

    const updates = pick(body, [
      "name",
      "description",
      "status",
      "plan",
      "limits",
      "branding",
      "pricing",
      "members",
    ]);

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
    if (/required|exceeds|between/i.test(err?.message || "")) {
      return res
        .status(400)
        .json({ success: false, message: err.message });
    }
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
