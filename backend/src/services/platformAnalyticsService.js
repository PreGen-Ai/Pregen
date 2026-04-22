import mongoose from "mongoose";

import {
  AI_SERVICE_URL,
  AI_SERVICE_URL_SOURCE,
} from "../config/env.js";
import AiUsage from "../models/aiUsage.js";
import AuditLog from "../models/AuditLog.js";
import FeatureFlag from "../models/FeatureFlag.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Submission from "../models/Submission.js";
import Tenant from "../models/Tenant.js";
import User from "../models/userModel.js";
import { estimateUsageCost } from "./ai/modelPricing.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function boolOrNull(value) {
  if (typeof value !== "boolean") return null;
  return value;
}

function resolveRecordedCost({
  totalCost,
  inputCost,
  outputCost,
} = {}) {
  const recordedInputCost = toNumber(inputCost);
  const recordedOutputCost = toNumber(outputCost);
  const recordedTotalCost =
    toNumber(totalCost) ??
    (
      recordedInputCost !== null || recordedOutputCost !== null
        ? Number(recordedInputCost || 0) + Number(recordedOutputCost || 0)
        : null
    );

  if (
    recordedTotalCost === null &&
    recordedInputCost === null &&
    recordedOutputCost === null
  ) {
    return null;
  }

  return {
    inputCost: recordedInputCost,
    outputCost: recordedOutputCost,
    totalCost: recordedTotalCost,
  };
}

function estimateRowCost(row) {
  const inputTokens = Math.max(0, Number(row.inputTokens || 0));
  const outputTokens = Math.max(0, Number(row.outputTokens || 0));
  if (inputTokens <= 0 && outputTokens <= 0) return null;

  const estimate = estimateUsageCost({
    provider: row.provider,
    model: row.model,
    inputTokens,
    outputTokens,
  });
  if (!estimate) return null;

  return {
    inputCost: Number(estimate.inputCost || 0),
    outputCost: Number(estimate.outputCost || 0),
    totalCost: Number(estimate.totalCost || 0),
    currency: estimate.currency || "USD",
  };
}

function pickLatest(...values) {
  const dates = values.map(asDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function pickEarliest(...values) {
  const dates = values.map(asDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clampLimit(value, fallback = 50, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseRange(range = "7d") {
  const normalized = String(range || "7d").trim().toLowerCase();
  if (normalized === "24h") {
    return {
      range: normalized,
      from: new Date(Date.now() - DAY_MS),
      to: new Date(),
      bucket: "hour",
    };
  }

  const match = normalized.match(/^(\d+)([dwm])$/);
  if (!match) {
    return {
      range: "7d",
      from: new Date(Date.now() - (7 * DAY_MS)),
      to: new Date(),
      bucket: "day",
    };
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "d" ? DAY_MS : unit === "w" ? 7 * DAY_MS : 30 * DAY_MS;
  const days = unit === "d" ? amount : unit === "w" ? amount * 7 : amount * 30;

  return {
    range: normalized,
    from: new Date(Date.now() - amount * multiplier),
    to: new Date(),
    bucket: days <= 2 ? "hour" : "day",
  };
}

function metric({
  value = null,
  state = "ok",
  label = "",
  meta = {},
  lastUpdated = null,
} = {}) {
  return {
    value,
    state,
    label,
    lastUpdated: lastUpdated || nowIso(),
    meta,
  };
}

function collectionState({
  state = "ok",
  label = "",
  items = [],
  meta = {},
  lastUpdated = null,
} = {}) {
  return {
    state,
    label,
    lastUpdated: lastUpdated || nowIso(),
    meta,
    items,
  };
}

function chartState({
  state = "ok",
  label = "",
  points = [],
  meta = {},
  lastUpdated = null,
} = {}) {
  return {
    state,
    label,
    lastUpdated: lastUpdated || nowIso(),
    meta,
    points,
  };
}

function sumMetric(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function average(values = []) {
  if (!values.length) return null;
  return sumMetric(values) / values.length;
}

function percentile(values = [], p = 0.95) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function buildBucketKey(date, bucket) {
  const safeDate = asDate(date);
  if (!safeDate) return null;

  if (bucket === "hour") {
    return new Date(
      safeDate.getFullYear(),
      safeDate.getMonth(),
      safeDate.getDate(),
      safeDate.getHours(),
      0,
      0,
      0,
    );
  }

  return new Date(
    safeDate.getFullYear(),
    safeDate.getMonth(),
    safeDate.getDate(),
    0,
    0,
    0,
    0,
  );
}

function buildTimeSeries(rows = [], {
  bucket = "day",
  field = "requestCount",
  aggregator = "sum",
  filter = null,
} = {}) {
  const map = new Map();

  for (const row of rows) {
    if (typeof filter === "function" && !filter(row)) continue;
    const bucketDate = buildBucketKey(row.createdAt || row.updatedAt, bucket);
    if (!bucketDate) continue;
    const key = bucketDate.toISOString();
    if (!map.has(key)) {
      map.set(key, { label: bucketDate.toISOString(), values: [] });
    }
    map.get(key).values.push(Number(row[field] || 0));
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, entry]) => {
      const value =
        aggregator === "avg"
          ? average(entry.values)
          : sumMetric(entry.values);
      return {
        bucket: key,
        label: key,
        value: value === null ? null : round(value, 2),
      };
    });
}

function buildUsageByTenant(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const tenantId = toNullableString(row.tenantId);
    if (!tenantId) continue;
    if (!map.has(tenantId)) {
      map.set(tenantId, {
        tenantId,
        requests: 0,
        totalTokens: 0,
        totalCost: 0,
        latencyValues: [],
      });
    }
    const target = map.get(tenantId);
    target.requests += Number(row.requestCount || 0);
    target.totalTokens += Number(row.totalTokens || 0);
    if (row.hasExplicitCost) {
      target.totalCost += Number(row.totalCost || 0);
    }
    if (Number(row.latencyMs || 0) > 0) {
      target.latencyValues.push(Number(row.latencyMs));
    }
  }

  return [...map.values()]
    .map((entry) => ({
      tenantId: entry.tenantId,
      requests: entry.requests,
      totalTokens: entry.totalTokens,
      totalCost: round(entry.totalCost, 4),
      avgLatencyMs: round(average(entry.latencyValues) || 0, 1),
    }))
    .sort((a, b) => b.requests - a.requests);
}

async function enrichUsageByTenant(rows = []) {
  if (!rows.length) return [];

  const tenantIds = [
    ...new Set(rows.map((row) => toNullableString(row.tenantId)).filter(Boolean)),
  ];
  const tenants = await Tenant.find({ tenantId: { $in: tenantIds } })
    .select({ tenantId: 1, name: 1, plan: 1, status: 1 })
    .lean();
  const tenantMap = new Map(
    tenants.map((tenant) => [tenant.tenantId, tenant]),
  );

  return rows.map((row) => {
    const tenant = tenantMap.get(row.tenantId) || {};
    return {
      ...row,
      name: tenant.name || row.tenantId,
      plan: tenant.plan || null,
      status: tenant.status || null,
    };
  });
}

function serializeAiRequestRow(row) {
  return {
    requestId: row.requestId,
    tenantId: row.tenantId || null,
    provider: row.provider || null,
    model: row.model || null,
    feature: row.feature || null,
    endpoint: row.endpoint || null,
    status: row.status || "ok",
    totalTokens: row.totalTokens ?? null,
    totalCost: row.hasExplicitCost ? row.totalCost ?? null : null,
    latencyMs: row.latencyMs ?? null,
    cacheHit: row.cacheHit,
    requestCount: row.requestCount || 1,
    callCount: row.callCount || row.requestCount || 1,
    createdAt: asDate(row.createdAt)?.toISOString() || null,
    updatedAt: asDate(row.updatedAt)?.toISOString() || null,
    sourceKinds: Array.isArray(row.sourceKinds) ? row.sourceKinds : [],
  };
}

async function fetchAiServiceHealth() {
  if (!AI_SERVICE_URL) {
    return {
      state: "misconfigured",
      label: "AI service URL not configured",
      raw: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(new URL("/health", AI_SERVICE_URL), {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        state: "degraded",
        label: `AI service health check failed (${response.status})`,
        raw: { status: response.status },
      };
    }

    const raw = await response.json();
    const hasProvider =
      !!raw?.openai_configured || !!raw?.gemini_configured ||
      raw?.primary_provider === "openai" || raw?.primary_provider === "gemini";

    return {
      state: hasProvider ? "ok" : "misconfigured",
      label: hasProvider ? "AI provider connected" : "AI provider not configured",
      raw,
    };
  } catch (error) {
    return {
      state:
        AI_SERVICE_URL_SOURCE === "default-development" ? "misconfigured" : "unavailable",
      label:
        AI_SERVICE_URL_SOURCE === "default-development"
          ? "AI service not configured for this environment"
          : "AI service unreachable",
      raw: {
        error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadMergedAiRequests({ from, to, tenantId = null }) {
  const db = mongoose.connection?.db;
  if (!db) {
    return {
      rows: [],
      lastUpdated: null,
      sourceMeta: {
        requestDocs: 0,
        nodeDocs: 0,
      },
    };
  }

  const nodeTimeMatch = {
    $or: [
      { createdAt: { $gte: from, $lte: to } },
      { timestamp: { $gte: from, $lte: to } },
    ],
  };
  if (tenantId) {
    nodeTimeMatch.tenantId = tenantId;
  }

  const nodeDocs = await AiUsage.find(nodeTimeMatch)
    .select({
      tenantId: 1,
      provider: 1,
      model: 1,
      feature: 1,
      endpoint: 1,
      requestId: 1,
      requests: 1,
      inputTokens: 1,
      outputTokens: 1,
      tokens: 1,
      totalTokens: 1,
      cost: 1,
      totalCost: 1,
      inputCost: 1,
      outputCost: 1,
      currency: 1,
      latencyMs: 1,
      cacheHit: 1,
      status: 1,
      success: 1,
      createdAt: 1,
      updatedAt: 1,
      timestamp: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const nodeRequestIds = [
    ...new Set(
      nodeDocs
        .map((doc) => toNullableString(doc.requestId))
        .filter(Boolean),
    ),
  ];

  const requestTimeMatch = {
    $or: [
      { createdAt: { $gte: from, $lte: to } },
      { updatedAt: { $gte: from, $lte: to } },
    ],
  };

  const requestDocsQuery = tenantId
    ? {
        $or: [
          { ...requestTimeMatch, tenantId },
          ...(nodeRequestIds.length
            ? [{ requestId: { $in: nodeRequestIds } }]
            : []),
        ],
      }
    : requestTimeMatch;

  const requestDocs = await db.collection("ai_requests")
    .find(requestDocsQuery)
    .project({
      tenantId: 1,
      provider: 1,
      model: 1,
      feature: 1,
      endpoint: 1,
      requestId: 1,
      calls: 1,
      okCalls: 1,
      errorCalls: 1,
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 1,
      totalCost: 1,
      inputCost: 1,
      outputCost: 1,
      currency: 1,
      totalLatencyMs: 1,
      cacheHit: 1,
      lastStatus: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  const merged = new Map();

  function ensureRow(key) {
    if (!merged.has(key)) {
      merged.set(key, {
        key,
        requestId: null,
        tenantId: null,
        provider: null,
        model: null,
        feature: null,
        endpoint: null,
        status: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        inputCost: null,
        outputCost: null,
        totalCost: null,
        currency: null,
        latencyMs: null,
        cacheHit: null,
        requestCount: 1,
        callCount: 1,
        createdAt: null,
        updatedAt: null,
        hasExplicitCost: false,
        sourceKinds: [],
      });
    }
    return merged.get(key);
  }

  for (const doc of requestDocs) {
    const key = toNullableString(doc.requestId) || `ai-request:${doc._id}`;
    const row = ensureRow(key);
    row.requestId = row.requestId || toNullableString(doc.requestId);
    row.tenantId = row.tenantId || toNullableString(doc.tenantId);
    row.provider = row.provider || toNullableString(doc.provider);
    row.model = row.model || toNullableString(doc.model);
    row.feature = row.feature || toNullableString(doc.feature);
    row.endpoint = row.endpoint || toNullableString(doc.endpoint);
    row.status =
      doc.lastStatus === "error" || row.status === "error"
        ? "error"
        : row.status || toNullableString(doc.lastStatus) || "ok";
    row.inputTokens =
      row.inputTokens ?? toNumber(doc.inputTokens) ?? null;
    row.outputTokens =
      row.outputTokens ?? toNumber(doc.outputTokens) ?? null;
    row.totalTokens =
      row.totalTokens ??
      toNumber(doc.totalTokens) ??
      (
        row.inputTokens !== null || row.outputTokens !== null
          ? Number(row.inputTokens || 0) + Number(row.outputTokens || 0)
          : null
      );
    row.latencyMs =
      row.latencyMs ?? toNumber(doc.totalLatencyMs) ?? null;
    row.cacheHit =
      row.cacheHit === null ? boolOrNull(doc.cacheHit) : row.cacheHit;
    row.currency = row.currency || toNullableString(doc.currency);
    row.callCount = Math.max(
      Number(row.callCount || 1),
      Number(doc.calls || 1),
    );
    row.createdAt = pickEarliest(row.createdAt, doc.createdAt, doc.updatedAt);
    row.updatedAt = pickLatest(row.updatedAt, doc.updatedAt, doc.createdAt);

    const recordedCost = resolveRecordedCost({
      totalCost: doc.totalCost,
      inputCost: doc.inputCost,
      outputCost: doc.outputCost,
    });
    if (recordedCost) {
      row.inputCost = row.inputCost ?? recordedCost.inputCost;
      row.outputCost = row.outputCost ?? recordedCost.outputCost;
      row.totalCost = row.totalCost ?? recordedCost.totalCost;
      row.hasExplicitCost = true;
    }

    if (!row.sourceKinds.includes("ai_requests")) {
      row.sourceKinds.push("ai_requests");
    }
  }

  for (const doc of nodeDocs) {
    const key = toNullableString(doc.requestId) || `node-ai:${doc._id}`;
    const row = ensureRow(key);
    row.requestId = row.requestId || toNullableString(doc.requestId);
    row.tenantId = row.tenantId || toNullableString(doc.tenantId);
    row.provider = row.provider || toNullableString(doc.provider);
    row.model = row.model || toNullableString(doc.model);
    row.feature = row.feature || toNullableString(doc.feature);
    row.endpoint = row.endpoint || toNullableString(doc.endpoint);
    row.status =
      doc.status === "error" || row.status === "error"
        ? "error"
        : row.status || toNullableString(doc.status) || (doc.success === false ? "error" : "ok");
    row.inputTokens =
      row.inputTokens ?? toNumber(doc.inputTokens) ?? null;
    row.outputTokens =
      row.outputTokens ?? toNumber(doc.outputTokens) ?? null;
    row.totalTokens =
      row.totalTokens ??
      toNumber(doc.totalTokens) ??
      (
        row.inputTokens !== null || row.outputTokens !== null
          ? Number(row.inputTokens || 0) + Number(row.outputTokens || 0)
          : null
      ) ??
      toNumber(doc.tokens) ??
      null;
    row.latencyMs =
      row.latencyMs ?? toNumber(doc.latencyMs) ?? null;
    row.cacheHit =
      row.cacheHit === null ? boolOrNull(doc.cacheHit) : row.cacheHit;
    row.currency = row.currency || toNullableString(doc.currency);
    row.callCount = Math.max(
      Number(row.callCount || 1),
      Number(doc.requests || 1),
    );
    row.createdAt = pickEarliest(row.createdAt, doc.createdAt, doc.timestamp);
    row.updatedAt = pickLatest(row.updatedAt, doc.updatedAt, doc.createdAt, doc.timestamp);

    const recordedCost =
      resolveRecordedCost({
        totalCost: doc.totalCost,
        inputCost: doc.inputCost,
        outputCost: doc.outputCost,
      }) ||
      resolveRecordedCost({ totalCost: doc.cost });
    if (recordedCost) {
      row.inputCost = row.inputCost ?? recordedCost.inputCost;
      row.outputCost = row.outputCost ?? recordedCost.outputCost;
      row.totalCost = row.totalCost ?? recordedCost.totalCost;
      row.hasExplicitCost = true;
    }

    if (!row.sourceKinds.includes("node_ai_usage")) {
      row.sourceKinds.push("node_ai_usage");
    }
  }

  for (const row of merged.values()) {
    if (row.hasExplicitCost) continue;

    const estimatedCost = estimateRowCost(row);
    if (!estimatedCost) continue;

    row.inputCost = row.inputCost ?? estimatedCost.inputCost;
    row.outputCost = row.outputCost ?? estimatedCost.outputCost;
    row.totalCost = row.totalCost ?? estimatedCost.totalCost;
    row.currency = row.currency || estimatedCost.currency;
    row.hasExplicitCost = true;
  }

  const rows = [...merged.values()]
    .filter((row) => !tenantId || row.tenantId === tenantId)
    .sort((a, b) => {
      const aTime = asDate(a.updatedAt || a.createdAt)?.getTime() || 0;
      const bTime = asDate(b.updatedAt || b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });

  return {
    rows,
    lastUpdated: pickLatest(
      ...rows.map((row) => row.updatedAt || row.createdAt),
    ),
    sourceMeta: {
      requestDocs: requestDocs.length,
      nodeDocs: nodeDocs.length,
    },
  };
}

function buildAiTelemetrySummary(rows = []) {
  const requestCount = rows.length;
  const callCount = rows.reduce(
    (sum, row) => sum + Number(row.callCount || row.requestCount || 1),
    0,
  );
  const tokenRows = rows
    .map((row) => toNumber(row.totalTokens))
    .filter((value) => value !== null);
  const latencyValues = rows
    .map((row) => toNumber(row.latencyMs))
    .filter((value) => value !== null && value > 0);
  const cacheRows = rows
    .map((row) => row.cacheHit)
    .filter((value) => value !== null);
  const explicitCostRows = rows.filter((row) => row.hasExplicitCost);
  const errorCount = rows.filter((row) => row.status === "error").length;

  return {
    requestCount,
    callCount,
    totalTokens: tokenRows.length ? sumMetric(tokenRows) : null,
    avgLatencyMs: latencyValues.length ? average(latencyValues) : null,
    p95LatencyMs: latencyValues.length ? percentile(latencyValues, 0.95) : null,
    cacheHitRate:
      cacheRows.length
        ? cacheRows.filter(Boolean).length / cacheRows.length
        : null,
    totalCost:
      explicitCostRows.length
        ? sumMetric(explicitCostRows.map((row) => Number(row.totalCost || 0)))
        : null,
    explicitCostSamples: explicitCostRows.length,
    errorCount,
    tenantCoverage: rows.filter((row) => !!row.tenantId).length,
  };
}

function buildSourceStatuses({
  aiService,
  aiTelemetrySummary,
  auditLogCount,
  auditRecentCount,
}) {
  const aiLoggingState =
    aiTelemetrySummary.requestCount === 0
      ? (aiService.state === "ok" ? "logging_inactive" : "unavailable")
      : aiTelemetrySummary.tenantCoverage === 0 || aiTelemetrySummary.explicitCostSamples === 0
        ? "partial"
        : "ok";

  const aiLoggingLabel =
    aiLoggingState === "ok"
      ? "Usage logging active"
      : aiLoggingState === "partial"
        ? "Usage logging partial"
        : aiLoggingState === "logging_inactive"
          ? "No AI telemetry observed yet"
          : "Usage logging unavailable";

  const auditLoggingState =
    auditLogCount > 0 ? "ok" : auditRecentCount > 0 ? "ok" : "logging_inactive";

  const auditLoggingLabel =
    auditLoggingState === "ok"
      ? "Audit logging active"
      : "No audit events observed yet";

  return {
    aiProvider: {
      state: aiService.state,
      label: aiService.label,
      meta: aiService.raw || {},
    },
    aiLogging: {
      state: aiLoggingState,
      label: aiLoggingLabel,
      meta: {
        requestsObserved: aiTelemetrySummary.requestCount,
        tenantCoverage: aiTelemetrySummary.tenantCoverage,
        explicitCostSamples: aiTelemetrySummary.explicitCostSamples,
      },
    },
    auditLogging: {
      state: auditLoggingState,
      label: auditLoggingLabel,
      meta: {
        totalAuditEvents: auditLogCount,
        recentAuditEvents: auditRecentCount,
      },
    },
  };
}

function buildHealthSummary({
  dbReachable,
  aiService,
  sourceStatuses,
  recentErrorCount,
}) {
  let state = "healthy";
  let label = "All core platform checks are healthy";

  if (!dbReachable || aiService.state === "misconfigured") {
    state = "misconfigured";
    label = "Core platform configuration is incomplete";
  } else if (aiService.state === "degraded" || aiService.state === "unavailable") {
    state = "degraded";
    label = "Core services are reachable with issues";
  } else if (
    sourceStatuses.aiLogging.state !== "ok" ||
    sourceStatuses.auditLogging.state !== "ok"
  ) {
    state = "partial_telemetry";
    label = "Platform is up, but telemetry is only partially available";
  } else if (recentErrorCount > 20) {
    state = "degraded";
    label = "Recent error volume is elevated";
  }

  return {
    state,
    label,
    lastUpdated: nowIso(),
    checks: {
      backendReachable: { state: "ok", label: "Backend reachable" },
      databaseReachable: {
        state: dbReachable ? "ok" : "unavailable",
        label: dbReachable ? "Database reachable" : "Database unavailable",
      },
      aiProvider: sourceStatuses.aiProvider,
      aiLogging: sourceStatuses.aiLogging,
      auditLogging: sourceStatuses.auditLogging,
    },
  };
}

async function loadRecentAuditAlerts({ since, limit = 20 }) {
  const auditItems = await AuditLog.find({
    timestamp: { $gte: since },
    level: { $in: ["error", "security", "warn"] },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  return auditItems.map((item) => ({
    id: String(item._id),
    timestamp: asDate(item.timestamp)?.toISOString() || null,
    level: item.level,
    type: item.type,
    tenantId: item.tenantId || null,
    message: item.message,
    meta: item.meta || {},
    source: "audit_log",
  }));
}

function buildAlertsState({ auditAlerts, aiRows, lastUpdated }) {
  const aiAlerts = aiRows
    .filter((row) => row.status === "error" || Number(row.latencyMs || 0) >= 10000)
    .slice(0, 20)
    .map((row) => ({
      id: row.requestId || row.key,
      timestamp: asDate(row.updatedAt || row.createdAt)?.toISOString() || null,
      level: row.status === "error" ? "error" : "warn",
      type: row.status === "error" ? "AI_REQUEST_ERROR" : "AI_LATENCY_SPIKE",
      tenantId: row.tenantId || null,
      message:
        row.status === "error"
          ? `AI request failed for ${row.feature || row.endpoint || "unknown feature"}`
          : `AI latency spike detected (${Math.round(Number(row.latencyMs || 0))} ms)`,
      meta: serializeAiRequestRow(row),
      source: "ai_telemetry",
    }));

  const items = [...auditAlerts, ...aiAlerts]
    .sort((a, b) => {
      const aTime = asDate(a.timestamp)?.getTime() || 0;
      const bTime = asDate(b.timestamp)?.getTime() || 0;
      return bTime - aTime;
    })
    .slice(0, 20);

  return items.length
    ? collectionState({
        state: "ok",
        label: "Recent alerts available",
        items,
        lastUpdated,
      })
    : collectionState({
        state: "no_data",
        label: "No recent spikes detected",
        items: [],
        lastUpdated,
      });
}

function buildMetricFromValue({
  value,
  hasData,
  zeroLabel,
  noDataLabel,
  unavailableLabel,
  meta = {},
  lastUpdated = null,
}) {
  if (!hasData) {
    return metric({
      value: null,
      state: meta.reason || "no_data",
      label: noDataLabel,
      meta,
      lastUpdated,
    });
  }

  if (value === 0) {
    return metric({
      value: 0,
      state: "zero",
      label: zeroLabel,
      meta,
      lastUpdated,
    });
  }

  return metric({
    value,
    state: "ok",
    label: unavailableLabel || "",
    meta,
    lastUpdated,
  });
}

export async function getSuperadminOverviewPayload() {
  const currentTime = new Date();
  const start24h = new Date(currentTime.getTime() - DAY_MS);
  const startToday = new Date(
    currentTime.getFullYear(),
    currentTime.getMonth(),
    currentTime.getDate(),
  );
  const startMonth = new Date(
    currentTime.getFullYear(),
    currentTime.getMonth(),
    1,
  );
  const start7d = new Date(currentTime.getTime() - (7 * DAY_MS));

  const [
    activeTenants,
    totalStudents,
    auditLogCount,
    auditRecentCount,
    recentErrorCount,
    aiService,
    aiTelemetry24h,
    aiTelemetryMtd,
    recentAuditAlerts,
  ] = await Promise.all([
    Tenant.countDocuments({ status: { $ne: "suspended" } }),
    User.countDocuments({
      role: "STUDENT",
      disabled: { $ne: true },
      deleted: { $ne: true },
    }),
    AuditLog.countDocuments({}),
    AuditLog.countDocuments({ timestamp: { $gte: start7d } }),
    AuditLog.countDocuments({
      timestamp: { $gte: start24h },
      level: { $in: ["error", "security"] },
    }),
    fetchAiServiceHealth(),
    loadMergedAiRequests({ from: start24h, to: currentTime }),
    loadMergedAiRequests({ from: startMonth, to: currentTime }),
    loadRecentAuditAlerts({ since: start7d }),
  ]);

  const rows24h = aiTelemetry24h.rows;
  const rowsMonth = aiTelemetryMtd.rows;
  const rowsToday = rowsMonth.filter((row) => {
    const date = asDate(row.createdAt || row.updatedAt);
    return date && date >= startToday;
  });
  const rows7d = rowsMonth.filter((row) => {
    const date = asDate(row.createdAt || row.updatedAt);
    return date && date >= start7d;
  });

  const telemetry24h = buildAiTelemetrySummary(rows24h);
  const telemetryToday = buildAiTelemetrySummary(rowsToday);
  const telemetryMonth = buildAiTelemetrySummary(rowsMonth);
  const sourceStatuses = buildSourceStatuses({
    aiService,
    aiTelemetrySummary: telemetryMonth,
    auditLogCount,
    auditRecentCount,
  });
  const lastUpdated = pickLatest(
    aiTelemetry24h.lastUpdated,
    aiTelemetryMtd.lastUpdated,
    currentTime,
  );
  const health = buildHealthSummary({
    dbReachable: mongoose.connection.readyState === 1,
    aiService,
    sourceStatuses,
    recentErrorCount,
  });
  const alerts = buildAlertsState({
    auditAlerts: recentAuditAlerts,
    aiRows: rows24h,
    lastUpdated,
  });

  const metrics = {
    activeTenants: metric({
      value: activeTenants,
      state: "ok",
      label: activeTenants === 0 ? "No active tenants" : "Active tenants available",
      lastUpdated,
      meta: { source: "tenants" },
    }),
    totalStudents: metric({
      value: totalStudents,
      state: "ok",
      label: totalStudents === 0 ? "No student records found" : "Student totals available",
      lastUpdated,
      meta: { source: "users" },
    }),
    aiCalls24h:
      telemetry24h.callCount > 0
        ? metric({
            value: telemetry24h.callCount,
            state: "ok",
            label: "AI activity available",
            lastUpdated,
            meta: {
              requestsObserved: telemetry24h.requestCount,
              sourceMeta: aiTelemetry24h.sourceMeta,
            },
          })
        : metric({
            value: null,
            state:
              sourceStatuses.aiLogging.state === "logging_inactive"
                ? "logging_inactive"
                : sourceStatuses.aiLogging.state === "unavailable"
                  ? "unavailable"
                  : "no_data",
            label: "No AI activity yet",
            lastUpdated,
            meta: {
              sourceMeta: aiTelemetry24h.sourceMeta,
            },
          }),
    costToday:
      telemetryToday.totalCost !== null
        ? metric({
            value: round(telemetryToday.totalCost, 4),
            state: "ok",
            label: "Cost data available",
            lastUpdated,
            meta: { explicitCostSamples: telemetryToday.explicitCostSamples },
          })
        : metric({
            value: null,
            state:
              telemetryToday.requestCount > 0 ? "logging_inactive" : "no_data",
            label:
              telemetryToday.requestCount > 0
                ? "Cost data not available yet"
                : "No AI cost data yet",
            lastUpdated,
            meta: {
              requestsObserved: telemetryToday.requestCount,
              explicitCostSamples: telemetryToday.explicitCostSamples,
            },
          }),
    costMTD:
      telemetryMonth.totalCost !== null
        ? metric({
            value: round(telemetryMonth.totalCost, 4),
            state: "ok",
            label: "Month-to-date cost available",
            lastUpdated,
            meta: { explicitCostSamples: telemetryMonth.explicitCostSamples },
          })
        : metric({
            value: null,
            state:
              telemetryMonth.requestCount > 0 ? "logging_inactive" : "no_data",
            label:
              telemetryMonth.requestCount > 0
                ? "Cost data not available yet"
                : "No MTD cost data yet",
            lastUpdated,
            meta: {
              requestsObserved: telemetryMonth.requestCount,
              explicitCostSamples: telemetryMonth.explicitCostSamples,
            },
          }),
    p95LatencyMs:
      telemetry24h.p95LatencyMs !== null
        ? metric({
            value: round(telemetry24h.p95LatencyMs, 1),
            state: "ok",
            label: "Latency data available",
            lastUpdated,
            meta: { samples: rows24h.length },
          })
        : metric({
            value: null,
            state: rows24h.length ? "no_data" : "logging_inactive",
            label: "No latency data yet",
            lastUpdated,
            meta: { samples: rows24h.length },
          }),
    errors24h:
      recentErrorCount > 0
        ? metric({
            value: recentErrorCount,
            state: "ok",
            label: "Recent platform errors available",
            lastUpdated,
            meta: { source: "audit_logs" },
          })
        : metric({
            value: auditLogCount > 0 ? 0 : null,
            state: auditLogCount > 0 ? "zero" : "logging_inactive",
            label:
              auditLogCount > 0
                ? "No error events in the last 24 hours"
                : "Audit logging has no events yet",
            lastUpdated,
            meta: { source: "audit_logs" },
          }),
    health: metric({
      value: health.state,
      state: health.state,
      label: health.label,
      lastUpdated,
      meta: health.checks,
    }),
  };

  const usageByTenant = await enrichUsageByTenant(buildUsageByTenant(rows7d));
  const charts = {
    requestsOverTime: rows7d.length
      ? chartState({
          state: "ok",
          label: "Requests over time",
          points: buildTimeSeries(rows7d, {
            bucket: "day",
            field: "requestCount",
          }),
          lastUpdated,
        })
      : chartState({
          state: "no_data",
          label: "No request chart data yet",
          points: [],
          lastUpdated,
        }),
    costOverTime:
      telemetryMonth.totalCost !== null
        ? chartState({
            state: "ok",
            label: "Cost over time",
            points: buildTimeSeries(rows7d, {
              bucket: "day",
              field: "totalCost",
              filter: (row) => row.hasExplicitCost,
            }),
            lastUpdated,
          })
        : chartState({
            state:
              telemetryMonth.requestCount > 0 ? "logging_inactive" : "no_data",
            label:
              telemetryMonth.requestCount > 0
                ? "Cost data not available yet"
                : "No cost chart data yet",
            points: [],
            lastUpdated,
          }),
    latencyOverTime: telemetry24h.p95LatencyMs !== null
      ? chartState({
          state: "ok",
          label: "Latency over time",
          points: buildTimeSeries(rows7d, {
            bucket: "day",
            field: "latencyMs",
            aggregator: "avg",
            filter: (row) => Number(row.latencyMs || 0) > 0,
          }),
          lastUpdated,
        })
      : chartState({
          state: rows7d.length ? "no_data" : "logging_inactive",
          label: "No latency chart data yet",
          points: [],
          lastUpdated,
        }),
    usageByTenant: usageByTenant.length
      ? chartState({
          state: "ok",
          label: "Usage by tenant",
          points: usageByTenant.map((row) => ({
            bucket: row.tenantId,
            label: row.name || row.tenantId,
            value: row.requests,
          })),
          lastUpdated,
        })
      : chartState({
          state: rows7d.length ? "partial" : "no_data",
          label:
            rows7d.length
              ? "Tenant attribution is incomplete"
              : "No tenant usage chart data yet",
          points: [],
          lastUpdated,
        }),
  };

  return {
    generatedAt: nowIso(),
    scope: { mode: "all_tenants", tenantId: null },
    health,
    sourceStatus: sourceStatuses,
    metrics,
    alerts,
    charts,

    // Backward-compatible flat fields for older UI code paths.
    activeTenants: metrics.activeTenants.value,
    totalStudents: metrics.totalStudents.value,
    aiCalls24h: metrics.aiCalls24h.value,
    costToday: metrics.costToday.value,
    costMTD: metrics.costMTD.value,
    p95LatencyMs: metrics.p95LatencyMs.value,
    errorsToday: metrics.errors24h.value,
    healthStatus: health.state,
    spikes: alerts.items,
  };
}

export async function getSuperadminAiCostPayload({
  range = "7d",
  tenantId = null,
  limit = 50,
  skip = 0,
  q = "",
  status = "",
  provider = "",
  model = "",
  cacheHit = "",
} = {}) {
  const { from, to, bucket } = parseRange(range);
  const aiService = await fetchAiServiceHealth();
  const telemetry = await loadMergedAiRequests({ from, to, tenantId });
  const filteredRows = telemetry.rows.filter((row) => {
    const matchesStatus =
      !status || String(row.status || "").toLowerCase() === String(status).toLowerCase();
    const matchesProvider =
      !provider || String(row.provider || "").toLowerCase().includes(String(provider).toLowerCase());
    const matchesModel =
      !model || String(row.model || "").toLowerCase().includes(String(model).toLowerCase());
    const matchesCache =
      cacheHit === ""
        ? true
        : String(Boolean(row.cacheHit)) === String(cacheHit).toLowerCase();
    const query = String(q || "").trim().toLowerCase();
    const haystack = [
      row.requestId,
      row.tenantId,
      row.provider,
      row.model,
      row.feature,
      row.endpoint,
      row.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);

    return matchesStatus && matchesProvider && matchesModel && matchesCache && matchesQuery;
  });
  const rows = filteredRows;
  const summary = buildAiTelemetrySummary(rows);
  const totalAuditLogs = await AuditLog.countDocuments({});
  const sourceStatus = buildSourceStatuses({
    aiService,
    aiTelemetrySummary: summary,
    auditLogCount: totalAuditLogs,
    auditRecentCount: await AuditLog.countDocuments({ timestamp: { $gte: from } }),
  });

  const usageByTenant = await enrichUsageByTenant(buildUsageByTenant(rows));
  const byFeature = [...rows.reduce((map, row) => {
    const key = row.feature || row.endpoint || "unknown";
    if (!map.has(key)) {
      map.set(key, {
        feature: key,
        requests: 0,
        tokens: 0,
        cost: 0,
      });
    }
    const target = map.get(key);
    target.requests += Number(row.requestCount || 1);
    target.tokens += Number(row.totalTokens || 0);
    if (row.hasExplicitCost) target.cost += Number(row.totalCost || 0);
    return map;
  }, new Map()).values()]
    .map((entry) => ({
      feature: entry.feature,
      requests: entry.requests,
      tokens: entry.tokens,
      cost: round(entry.cost, 4),
    }))
    .sort((a, b) => b.requests - a.requests);

  const pagedRows = rows.slice(skip, skip + limit).map(serializeAiRequestRow);
  const lastUpdated = telemetry.lastUpdated || nowIso();
  const charts = {
    requestsOverTime: rows.length
      ? chartState({
          state: "ok",
          label: "Requests over time",
          points: buildTimeSeries(rows, {
            bucket,
            field: "requestCount",
          }),
          lastUpdated,
        })
      : chartState({
          state: "no_data",
          label: "No AI activity yet",
          points: [],
          lastUpdated,
        }),
    costOverTime:
      summary.totalCost !== null
        ? chartState({
            state: "ok",
            label: "Cost over time",
            points: buildTimeSeries(rows, {
              bucket,
              field: "totalCost",
              filter: (row) => row.hasExplicitCost,
            }),
            lastUpdated,
          })
        : chartState({
            state: rows.length ? "logging_inactive" : "no_data",
            label:
              rows.length
                ? "Cost data not available yet"
                : "No cost data for this range",
            points: [],
            lastUpdated,
          }),
    latencyOverTime:
      summary.avgLatencyMs !== null
        ? chartState({
            state: "ok",
            label: "Latency over time",
            points: buildTimeSeries(rows, {
              bucket,
              field: "latencyMs",
              aggregator: "avg",
              filter: (row) => Number(row.latencyMs || 0) > 0,
            }),
            lastUpdated,
          })
        : chartState({
            state: rows.length ? "no_data" : "logging_inactive",
            label: "No latency data for this range",
            points: [],
            lastUpdated,
          }),
    usageByTenant: usageByTenant.length
      ? chartState({
          state: "ok",
          label: "Usage by tenant",
          points: usageByTenant.map((row) => ({
            bucket: row.tenantId,
            label: row.name || row.tenantId,
            value: row.requests,
          })),
          lastUpdated,
        })
      : chartState({
          state: rows.length ? "partial" : "no_data",
          label:
            rows.length
              ? "Tenant attribution is incomplete"
              : "No tenant usage data yet",
          points: [],
          lastUpdated,
        }),
  };

  return {
    generatedAt: nowIso(),
    range,
    scope: { mode: tenantId ? "single_tenant" : "all_tenants", tenantId },
    sourceStatus,
    summary: {
      requests:
        rows.length
          ? metric({
              value: summary.requestCount,
              state: "ok",
              label: "AI request data available",
              lastUpdated,
              meta: { callCount: summary.callCount },
            })
          : metric({
              value: null,
              state:
                sourceStatus.aiLogging.state === "logging_inactive"
                  ? "logging_inactive"
                  : "no_data",
              label: "No AI activity yet",
              lastUpdated,
            }),
      totalTokens:
        summary.totalTokens !== null
          ? metric({
              value: summary.totalTokens,
              state: "ok",
              label: "Token usage available",
              lastUpdated,
            })
          : metric({
              value: null,
              state: rows.length ? "partial" : "no_data",
              label: "No token data yet",
              lastUpdated,
            }),
      avgLatencyMs:
        summary.avgLatencyMs !== null
          ? metric({
              value: round(summary.avgLatencyMs, 1),
              state: "ok",
              label: "Latency data available",
              lastUpdated,
            })
          : metric({
              value: null,
              state: rows.length ? "no_data" : "logging_inactive",
              label: "No latency data yet",
              lastUpdated,
            }),
      cacheHitRate:
        summary.cacheHitRate !== null
          ? metric({
              value: round(summary.cacheHitRate, 4),
              state: "ok",
              label: "Cache data available",
              lastUpdated,
            })
          : metric({
              value: null,
              state: rows.length ? "no_data" : "logging_inactive",
              label: "No cache data",
              lastUpdated,
            }),
      estimatedCost:
        summary.totalCost !== null
          ? metric({
              value: round(summary.totalCost, 4),
              state: "ok",
              label: "Cost data available",
              lastUpdated,
              meta: { explicitCostSamples: summary.explicitCostSamples },
            })
          : metric({
              value: null,
              state: rows.length ? "logging_inactive" : "no_data",
              label:
                rows.length
                  ? "Cost data not available yet"
                  : "No cost data for this range",
              lastUpdated,
              meta: { explicitCostSamples: summary.explicitCostSamples },
            }),
    },
    recentRequests: collectionState({
      state: pagedRows.length ? "ok" : (rows.length ? "no_data" : "logging_inactive"),
      label:
        pagedRows.length
          ? "Recent AI requests available"
          : rows.length
            ? "No requests match the current filters"
            : "No AI activity yet",
      items: pagedRows,
      lastUpdated,
      meta: {
        total: rows.length,
        limit,
        skip,
        filters: {
          q,
          status,
          provider,
          model,
          cacheHit,
        },
      },
    }),
    charts,
    byTenant: usageByTenant.map((row) => ({
      tenantId: row.tenantId,
      name: row.name || row.tenantId,
      plan: row.plan || null,
      status: row.status || null,
      requests: row.requests,
      tokens: row.totalTokens,
      cost: row.totalCost,
      avgLatencyMs: row.avgLatencyMs,
    })),
    byFeature,
    items: usageByTenant,
  };
}

export async function getSuperadminAuditLogsPayload({ limit = 200 } = {}) {
  const safeLimit = clampLimit(limit, 200, 500);
  const totalAuditLogs = await AuditLog.countDocuments({});
  const logs = await AuditLog.find({})
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(safeLimit)
    .lean();

  const lastUpdated = pickLatest(...logs.map((log) => log.timestamp || log.createdAt));

  return {
    generatedAt: nowIso(),
    state: logs.length ? "ok" : "logging_inactive",
    label:
      logs.length
        ? "System audit logs available"
        : "No audit logs recorded yet",
    items: logs.map((log) => ({
      id: String(log._id),
      timestamp: asDate(log.timestamp || log.createdAt)?.toISOString() || null,
      level: log.level,
      type: log.type,
      actor: log.actor,
      tenantId: log.tenantId || null,
      message: log.message,
      meta: log.meta || {},
    })),
    meta: {
      totalAuditLogs,
      readOnly: true,
    },
    lastUpdated: lastUpdated || nowIso(),
  };
}

export async function getSuperadminFeatureFlagsPayload() {
  const flags = await FeatureFlag.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  const lastUpdated = pickLatest(...flags.map((flag) => flag.updatedAt || flag.createdAt));

  return {
    generatedAt: nowIso(),
    state: flags.length ? "ok" : "no_data",
    label:
      flags.length
        ? "Feature flags available"
        : "No feature flags have been created yet",
    items: flags.map((flag) => ({
      key: flag.key,
      description: flag.description,
      scope: flag.scope,
      defaultEnabled: !!flag.defaultEnabled,
      tenantOverridesCount: Array.isArray(flag.tenantOverrides)
        ? flag.tenantOverrides.length
        : 0,
      updatedAt: asDate(flag.updatedAt || flag.createdAt)?.toISOString() || null,
    })),
    meta: {
      readOnly: true,
      updatesSupported: false,
    },
    lastUpdated: lastUpdated || nowIso(),
  };
}

async function aggregateScoredAssessments(Model, { since, tenantId }) {
  const match = {
    deleted: { $ne: true },
    gradedAt: { $gte: since },
  };
  if (tenantId) match.tenantId = tenantId;

  const [result] = await Model.aggregate([
    { $match: match },
    {
      $project: {
        effectiveScore: {
          $ifNull: ["$finalScore", "$score"],
        },
        aiGradedAt: 1,
      },
    },
    {
      $match: {
        effectiveScore: { $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        sumScore: { $sum: "$effectiveScore" },
        aiGraded: {
          $sum: {
            $cond: [{ $ne: ["$aiGradedAt", null] }, 1, 0],
          },
        },
      },
    },
  ]);

  return {
    count: Number(result?.count || 0),
    sumScore: Number(result?.sumScore || 0),
    aiGraded: Number(result?.aiGraded || 0),
  };
}

export async function getAdminAnalyticsSummaryPayload({
  range = "7d",
  tenantId = null,
} = {}) {
  const { from, to } = parseRange(range);
  const [submissionStats, quizStats, activeTeachers, aiTelemetry] = await Promise.all([
    aggregateScoredAssessments(Submission, { since: from, tenantId }),
    aggregateScoredAssessments(QuizAttempt, { since: from, tenantId }),
    User.countDocuments({
      ...(tenantId ? { tenantId } : {}),
      role: "TEACHER",
      disabled: { $ne: true },
      deleted: { $ne: true },
      $or: [
        { lastActiveAt: { $gte: from } },
        { lastLogin: { $gte: from } },
      ],
    }),
    loadMergedAiRequests({ from, to, tenantId }),
  ]);

  const scoredCount = submissionStats.count + quizStats.count;
  const avgScore =
    scoredCount > 0
      ? (submissionStats.sumScore + quizStats.sumScore) / scoredCount
      : null;
  const aiGraded = submissionStats.aiGraded + quizStats.aiGraded;
  const aiSummary = buildAiTelemetrySummary(aiTelemetry.rows);
  const lastUpdated = pickLatest(
    aiTelemetry.lastUpdated,
    new Date(),
  );

  return {
    generatedAt: nowIso(),
    range,
    scope: { mode: tenantId ? "tenant" : "all_tenants", tenantId },
    summary: {
      // Use lastActiveAt/lastLogin rather than raw teacher counts so the metric
      // reflects recently active teacher accounts, which is less misleading for admins.
      activeTeachers:
        activeTeachers > 0
          ? metric({
              value: activeTeachers,
              state: "ok",
              label: "Active teacher accounts available",
              lastUpdated,
              meta: {
                derivedFrom: ["users.lastActiveAt", "users.lastLogin"],
              },
            })
          : metric({
              value: null,
              state: "no_data",
              label: "No teacher activity in this range",
              lastUpdated,
              meta: {
                derivedFrom: ["users.lastActiveAt", "users.lastLogin"],
              },
            }),
      avgScore:
        avgScore !== null
          ? metric({
              value: round(avgScore, 1),
              state: "ok",
              label: "Average score available",
              lastUpdated,
              meta: {
                assessedItems: scoredCount,
                sources: ["submissions", "quiz_attempts"],
              },
            })
          : metric({
              value: null,
              state: "no_data",
              label: "No grading data yet",
              lastUpdated,
              meta: {
                assessedItems: scoredCount,
                sources: ["submissions", "quiz_attempts"],
              },
            }),
      aiGraded:
        aiGraded > 0
          ? metric({
              value: aiGraded,
              state: "ok",
              label: "AI-graded assessments available",
              lastUpdated,
              meta: {
                sources: ["submissions.aiGradedAt", "quizAttempts.aiGradedAt"],
              },
            })
          : metric({
              value: null,
              state: "no_data",
              label: "No AI grading activity yet",
              lastUpdated,
              meta: {
                sources: ["submissions.aiGradedAt", "quizAttempts.aiGradedAt"],
              },
            }),
      aiRequests:
        aiSummary.requestCount > 0
          ? metric({
              value: aiSummary.requestCount,
              state: "ok",
              label: "AI request activity available",
              lastUpdated,
              meta: {
                callCount: aiSummary.callCount,
              },
            })
          : metric({
              value: null,
              state: "no_data",
              label: "No AI activity yet",
              lastUpdated,
            }),
    },
  };
}
