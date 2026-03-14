import Tenant from "../models/Tenant.js";
import User from "../models/userModel.js";
import AIUsageLog from "../models/aiUsage.js";
import AuditLog from "../models/AuditLog.js";
import FeatureFlag from "../models/FeatureFlag.js";
import { rangeToStart } from "../utils/timeRange.js";
import mongoose from "mongoose";




function parseRange(range) {
  const now = new Date();
  const m = String(range || "7d").match(/^(\d+)([hdwmy])$/i);
  if (!m) return { from: null, to: now };

  const n = Number(m[1]);
  const unit = m[2].toLowerCase();

  const ms =
    unit === "h"
      ? n * 60 * 60 * 1000
      : unit === "d"
        ? n * 24 * 60 * 60 * 1000
        : unit === "w"
          ? n * 7 * 24 * 60 * 60 * 1000
          : unit === "m"
            ? n * 30 * 24 * 60 * 60 * 1000
            : n * 365 * 24 * 60 * 60 * 1000;

  return { from: new Date(now.getTime() - ms), to: now };
}

export async function listAiRequests(req, res, next) {
  try {
    const col = mongoose.connection.db.collection("ai_requests");

    const limit = Math.min(Number(req.query.limit || 50), 200);
    const skip = Math.max(Number(req.query.skip || 0), 0);

    const range = req.query.range || "7d";
    const { from, to } = parseRange(range);

    const match = {
      updatedAt: { $gte: from, $lte: to },
    };

    if (req.query.status) match.lastStatus = String(req.query.status);
    if (req.query.provider) match.provider = String(req.query.provider);
    if (req.query.model) match.model = String(req.query.model);

    const items = await col
      .find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({
        provider: 1,
        model: 1,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 1,
        totalLatencyMs: 1,
        cacheHit: 1,
        lastStatus: 1,
        updatedAt: 1,
        requestId: 1,
        "payload.requestText": 1,
      })
      .toArray();

    const total = await col.countDocuments(match);

    res.json({ ok: true, items, total, limit, skip });
  } catch (e) {
    next(e);
  }
}

export async function aiRequestsSummary(req, res, next) {
  try {
    const col = mongoose.connection.db.collection("ai_requests");

    const range = req.query.range || "7d";
    const { from, to } = parseRange(range);

    const match = { updatedAt: { $gte: from, $lte: to } };

    const [out] = await col
      .aggregate([
        { $match: match },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  requests: { $sum: 1 },
                  totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
                  avgLatencyMs: { $avg: { $ifNull: ["$totalLatencyMs", 0] } },
                  cacheHits: {
                    $sum: { $cond: [{ $eq: ["$cacheHit", true] }, 1, 0] },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  requests: 1,
                  totalTokens: 1,
                  avgLatencyMs: 1,
                  cacheHitRate: {
                    $cond: [
                      { $gt: ["$requests", 0] },
                      { $divide: ["$cacheHits", "$requests"] },
                      0,
                    ],
                  },
                },
              },
            ],
            byModel: [
              {
                $group: {
                  _id: { provider: "$provider", model: "$model" },
                  requests: { $sum: 1 },
                  tokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
                },
              },
              {
                $project: {
                  _id: 0,
                  provider: "$_id.provider",
                  model: "$_id.model",
                  requests: 1,
                  tokens: 1,
                },
              },
              { $sort: { tokens: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ])
      .toArray();

    res.json({
      ok: true,
      from,
      to,
      totals: out?.totals?.[0] || {
        requests: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        cacheHitRate: 0,
      },
      byModel: out?.byModel || [],
    });
  } catch (e) {
    next(e);
  }
}


export async function getSuperOverview(req, res, next) {
  try {
    const now = new Date();
    const start24h = new Date(now);
    start24h.setHours(start24h.getHours() - 24);

    const [activeTenants, totalStudents, aiCalls24h, errorsToday] =
      await Promise.all([
        Tenant.countDocuments({ status: { $ne: "suspended" } }),
        User.countDocuments({ role: "STUDENT", disabled: false }),
        AIUsageLog.countDocuments({ timestamp: { $gte: start24h } }),
        AuditLog.countDocuments({
          level: { $in: ["error", "security"] },
          timestamp: { $gte: start24h },
        }),
      ]);

    // Cost today + MTD
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [costTodayAgg, costMTDAgg, p95Agg] = await Promise.all([
      AIUsageLog.aggregate([
        { $match: { timestamp: { $gte: startToday } } },
        {
          $group: {
            _id: null,
            costToday: { $sum: { $ifNull: ["$totalCost", 0] } },
          },
        },
      ]),
      AIUsageLog.aggregate([
        { $match: { timestamp: { $gte: startMonth } } },
        {
          $group: {
            _id: null,
            costMTD: { $sum: { $ifNull: ["$totalCost", 0] } },
          },
        },
      ]),
      AIUsageLog.aggregate([
        { $match: { timestamp: { $gte: start24h }, latencyMs: { $gt: 0 } } },
        { $sort: { latencyMs: 1 } },
        {
          $group: {
            _id: null,
            arr: { $push: "$latencyMs" },
          },
        },
      ]),
    ]);

    const p95LatencyMs = (() => {
      const arr = p95Agg?.[0]?.arr || [];
      if (!arr.length) return 0;
      const idx = Math.floor(arr.length * 0.95) - 1;
      return arr[Math.max(0, idx)] || 0;
    })();

    const costToday =
      Math.round((costTodayAgg?.[0]?.costToday || 0) * 100) / 100;
    const costMTD = Math.round((costMTDAgg?.[0]?.costMTD || 0) * 100) / 100;

    const healthStatus =
      errorsToday > 20 ? "degraded" : errorsToday > 0 ? "warning" : "healthy";

    // spikes (simple: top recent error/security logs)
    const spikes = await AuditLog.find({
      level: { $in: ["error", "security"] },
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .select({ timestamp: 1, type: 1, message: 1 })
      .lean();

    res.json({
      activeTenants,
      totalStudents,
      aiCalls24h,

      costToday,
      costMTD,
      p95LatencyMs,

      errorsToday,
      healthStatus,
      spikes,
    });
  } catch (e) {
    next(e);
  }
}

export async function listTenants(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);

    const tenants = await Tenant.find({})
      .select({
        tenantId: 1,
        name: 1,
        status: 1,
        plan: 1,
        createdAt: 1,
        members: 1,
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const tenantIds = tenants.map((t) => t.tenantId);

    // Keep your existing aggregations (optional)
    const [studentCounts, teacherCounts, aiCalls7dAgg, cost7dAgg] =
      await Promise.all([
        User.aggregate([
          {
            $match: {
              tenantId: { $in: tenantIds },
              role: "STUDENT",
              disabled: false,
            },
          },
          { $group: { _id: "$tenantId", count: { $sum: 1 } } },
        ]),
        User.aggregate([
          {
            $match: {
              tenantId: { $in: tenantIds },
              role: "TEACHER",
              disabled: false,
            },
          },
          { $group: { _id: "$tenantId", count: { $sum: 1 } } },
        ]),
        AIUsageLog.aggregate([
          {
            $match: {
              tenantId: { $in: tenantIds },
              timestamp: { $gte: rangeToStart("7d") },
            },
          },
          { $group: { _id: "$tenantId", count: { $sum: 1 } } },
        ]),
        AIUsageLog.aggregate([
          {
            $match: {
              tenantId: { $in: tenantIds },
              timestamp: { $gte: rangeToStart("7d") },
            },
          },
          { $group: { _id: "$tenantId", cost: { $sum: "$cost" } } },
        ]),
      ]);

    const toMap = (arr, keyField = "_id", valField = "count") =>
      new Map(arr.map((x) => [x[keyField], x[valField]]));

    const sMap = toMap(studentCounts);
    const tMap = toMap(teacherCounts);
    const callsMap = toMap(aiCalls7dAgg);
    const costMap = new Map(cost7dAgg.map((x) => [x._id, x.cost]));

    // ✅ Prefer members.* length when it exists
    const lenOrNull = (arr) => (Array.isArray(arr) ? arr.length : null);

    const out = tenants.map((t) => {
      const membersStudents = lenOrNull(t.members?.students);
      const membersTeachers = lenOrNull(t.members?.teachers);
      const membersAdmins = lenOrNull(t.members?.admins);

      return {
        tenantId: t.tenantId,
        name: t.name,
        status: t.status,
        plan: t.plan,

        admins: membersAdmins ?? 0,

        // prefer tenant.members, else fallback to User aggregation
        students: membersStudents ?? (sMap.get(t.tenantId) || 0),
        teachers: membersTeachers ?? (tMap.get(t.tenantId) || 0),

        aiCalls7d: callsMap.get(t.tenantId) || 0,
        cost7d: Math.round((costMap.get(t.tenantId) || 0) * 100) / 100,

        createdAt: t.createdAt,
      };
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
}

export async function getAICost(req, res, next) {
  try {
    const range = (req.query.range || "7d").toString();
    const start = rangeToStart(range);

    const byTenant = await AIUsageLog.aggregate([
      { $match: { timestamp: { $gte: start } } },
      {
        $group: {
          _id: "$tenantId",
          tokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          cost: { $sum: { $ifNull: ["$totalCost", 0] } },
          requests: { $sum: 1 },
        },
      },
      { $sort: { cost: -1 } },
      { $limit: 200 },
    ]);

    const byFeature = await AIUsageLog.aggregate([
      { $match: { timestamp: { $gte: start } } },
      {
        $group: {
          _id: "$feature",
          tokens: { $sum: { $add: ["$tokensInput", "$tokensOutput"] } },
          cost: { $sum: "$cost" },
          requests: { $sum: 1 },
        },
      },
      { $sort: { cost: -1 } },
    ]);

    // attach tenant names
    const tenantIds = byTenant.map((x) => x._id);
    const tenants = await Tenant.find({ tenantId: { $in: tenantIds } })
      .select({ tenantId: 1, name: 1 })
      .lean();
    const nameMap = new Map(tenants.map((t) => [t.tenantId, t.name]));

    res.json({
      byTenant: byTenant.map((t) => ({
        tenantId: t._id,
        name: nameMap.get(t._id) || t._id,
        tokens: t.tokens || 0,
        cost: Math.round((t.cost || 0) * 100) / 100,
        requests: t.requests || 0,
      })),
      byFeature: byFeature.map((f) => ({
        feature: f._id,
        tokens: f.tokens || 0,
        cost: Math.round((f.cost || 0) * 100) / 100,
        requests: f.requests || 0,
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function listFeatureFlags(req, res, next) {
  try {
    const flags = await FeatureFlag.find({}).sort({ updatedAt: -1 }).lean();

    res.json(
      flags.map((f) => ({
        key: f.key,
        description: f.description,
        scope: f.scope,
        defaultEnabled: !!f.defaultEnabled,
        tenantOverridesCount: Array.isArray(f.tenantOverrides)
          ? f.tenantOverrides.length
          : 0,
        updatedAt: f.updatedAt,
      })),
    );
  } catch (e) {
    next(e);
  }
}

export async function listAuditLogs(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);

    const logs = await AuditLog.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(
      logs.map((l) => ({
        id: l._id.toString(),
        timestamp: l.timestamp,
        level: l.level,
        type: l.type,
        actor: l.actor,
        tenantId: l.tenantId,
        message: l.message,
        meta: l.meta, // already sanitized by design
      })),
    );
  } catch (e) {
    next(e);
  }
}
