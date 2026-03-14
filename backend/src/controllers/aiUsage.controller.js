import mongoose from "mongoose";
import AiUsage from "../models/aiUsage.js";

/**
 * Helpers
 */

function getRole(req) {
  return String(req.userRole || req.user?.role || "").toUpperCase();
}

function enforceTenantScope(match, req) {
  const role = getRole(req);

  // SUPERADMIN can view global or filter by tenantId
  if (role === "SUPERADMIN") return match;

  // ADMIN must be tenant-scoped always
  const tenantId = req.user?.tenantId;
  if (tenantId) match.tenantId = tenantId;

  return match;
}

function toInt(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function toFloat(v, def = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

function buildMatchFromQuery(q) {
  const match = {};

  // Tenant scoping
  if (q.tenantId) match.tenantId = q.tenantId;

  // Provider/model/feature/endpoint
  if (q.provider) match.provider = q.provider;
  if (q.model) match.model = q.model;
  if (q.feature) match.feature = q.feature;
  if (q.endpoint) match.endpoint = q.endpoint;

  // User/session/request correlation
  if (q.userId && mongoose.Types.ObjectId.isValid(q.userId)) {
    match.userId = new mongoose.Types.ObjectId(q.userId);
  }
  if (q.sessionId) match.sessionId = q.sessionId;
  if (q.requestId) match.requestId = q.requestId;

  // Status/success
  if (q.status) match.status = q.status; // ok|error
  if (typeof q.success !== "undefined") {
    // allow ?success=true/false
    const s = String(q.success).toLowerCase();
    if (s === "true") match.success = true;
    if (s === "false") match.success = false;
  }

  // Date range: support both createdAt and timestamp
  if (q.from || q.to) {
    const range = {};
    if (q.from) range.$gte = new Date(q.from);
    if (q.to) range.$lte = new Date(q.to);

    match.$or = [{ createdAt: range }, { timestamp: range }];
  }

  return match;
}

/**
 * POST /api/ai-usage
 * Create a usage log entry
 */
export async function createAiUsage(req, res) {
  try {
    const {
      tenantId,
      provider,
      model,
      feature,
      endpoint,
      userId,
      sessionId,
      requestId,

      inputTokens,
      outputTokens,
      totalTokens,

      inputCost,
      outputCost,
      totalCost,
      currency,

      latencyMs,
      status,
      success,
      error,

      promptChars,
      completionChars,

      timestamp,
    } = req.body || {};

    if (!feature) {
      return res.status(400).json({ message: "feature is required" });
    }

    const doc = await AiUsage.create({
      tenantId: tenantId ?? req.user?.tenantId, // optional if you store tenant on user
      provider,
      model,
      feature,
      endpoint,

      userId: userId ?? req.user?._id, // optional
      sessionId,
      requestId,

      inputTokens,
      outputTokens,
      totalTokens,

      inputCost,
      outputCost,
      totalCost,
      currency,

      latencyMs,
      status,
      success,
      error,

      promptChars,
      completionChars,

      timestamp: timestamp ? new Date(timestamp) : undefined,
    });

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to create AI usage log",
      error: err?.message,
    });
  }
}

/**
 * GET /api/ai-usage
 * List usage logs with filters, pagination, and sorting
 *
 * Query:
 * - page, limit
 * - sortBy=timestamp|createdAt|totalCost|totalTokens|latencyMs
 * - sortDir=asc|desc
 * - filters: tenantId, provider, model, feature, endpoint, userId, sessionId, requestId, status, success, from, to
 */
export async function listAiUsage(req, res) {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 25)));
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || "timestamp";
    const sortDir =
      String(req.query.sortDir || "desc").toLowerCase() === "asc" ? 1 : -1;

    const allowedSort = new Set([
      "timestamp",
      "createdAt",
      "totalCost",
      "totalTokens",
      "latencyMs",
    ]);
    const sortField = allowedSort.has(sortBy) ? sortBy : "timestamp";
    const sort = { [sortField]: sortDir };

    const match = buildMatchFromQuery(req.query);

    enforceTenantScope(match, req);
    // If you want strict tenant isolation, uncomment:
    // if (req.user?.tenantId) match.tenantId = req.user.tenantId;

    const [items, total] = await Promise.all([
      AiUsage.find(match).sort(sort).skip(skip).limit(limit).lean(),
      AiUsage.countDocuments(match),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to list AI usage logs",
      error: err?.message,
    });
  }
}

/**
 * GET /api/ai-usage/:id
 */
export async function getAiUsageById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const doc = await AiUsage.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });

    // Optional tenant isolation:
    if (req.user?.tenantId && doc.tenantId !== req.user.tenantId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const match = buildMatchFromQuery(req.query);
    enforceTenantScope(match, req);

    return res.json(doc);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to get AI usage log",
      error: err?.message,
    });
  }
}

/**
 * GET /api/ai-usage/summary
 * Aggregated totals for a given filter set
 *
 * Query supports same filters as list + optional:
 * - groupBy=feature|model|provider|day
 */
// backend/src/controllers/aiUsage.controller.js
export async function getAiUsageSummary(req, res) {
  try {
    const match = buildMatchFromQuery(req.query);

    const groupBy = String(req.query.groupBy || "").toLowerCase();
    let groupId = null;

    if (groupBy === "feature") groupId = "$feature";
    else if (groupBy === "model") groupId = "$model";
    else if (groupBy === "provider") groupId = "$provider";
    else if (groupBy === "tenant") groupId = "$tenantId";
    else if (groupBy === "day") {
      groupId = {
        $dateToString: {
          format: "%Y-%m-%d",
          date: { $ifNull: ["$timestamp", "$createdAt"] },
        },
      };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: groupId,

          count: { $sum: 1 },

          totalInputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
          totalOutputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
          totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },

          totalInputCost: { $sum: { $ifNull: ["$inputCost", 0] } },
          totalOutputCost: { $sum: { $ifNull: ["$outputCost", 0] } },
          totalCost: { $sum: { $ifNull: ["$totalCost", 0] } },

          avgLatencyMs: {
            $avg: {
              $cond: [
                { $gt: [{ $ifNull: ["$latencyMs", 0] }, 0] },
                "$latencyMs",
                null,
              ],
            },
          },

          okCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "ok"] }, 1, 0],
            },
          },
          errorCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "error"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const rows = await AiUsage.aggregate(pipeline);

    return res.json({
      groupBy: groupId ? groupBy : null,
      rows,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to summarize AI usage logs",
      error: err?.message,
    });
  }
}
/**
 * DELETE /api/ai-usage/:id
 */
export async function deleteAiUsageById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const doc = await AiUsage.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    // Optional tenant isolation:
    // if (req.user?.tenantId && doc.tenantId !== req.user.tenantId) {
    //   return res.status(403).json({ message: "Forbidden" });
    // }

    await doc.deleteOne();
    return res.json({ message: "Deleted" });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to delete AI usage log",
      error: err?.message,
    });
  }
}

/**
 * DELETE /api/ai-usage
 * Bulk delete by filters (dangerous, but useful for admin)
 * Same filters as list, plus: ?max=10000 safety cap
 */
export async function bulkDeleteAiUsage(req, res) {
  try {
    const match = buildMatchFromQuery(req.query);
    const max = Math.min(50000, Math.max(1, toInt(req.query.max, 10000)));

    // Safety: prevent deleting everything accidentally unless explicitly intended
    const hasSomeFilter =
      Object.keys(match).length > 0 &&
      !(
        Object.keys(match).length === 1 &&
        match.timestamp &&
        Object.keys(match.timestamp).length === 0
      );

    if (!hasSomeFilter) {
      return res.status(400).json({
        message:
          "Refusing bulk delete without filters. Provide at least one filter (tenantId/feature/from/to/etc).",
      });
    }

    const ids = await AiUsage.find(match).select("_id").limit(max).lean();
    const idList = ids.map((d) => d._id);

    const result = await AiUsage.deleteMany({ _id: { $in: idList } });

    return res.json({
      message: "Bulk delete completed",
      deletedCount: result.deletedCount ?? 0,
      cap: max,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to bulk delete AI usage logs",
      error: err?.message,
    });
  }
}
