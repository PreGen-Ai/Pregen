import { randomUUID } from "crypto";

import { getTenantId, normalizeRole } from "../middleware/authMiddleware.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import { logAiBridgeUsage } from "../services/ai/aiUsageLogger.js";
import {
  AiUpstreamError,
  callAiService,
} from "../services/ai/fastapiClient.js";
import Assignment from "../models/Assignment.js";

const LMS_AI_ROLES = new Set(["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"]);

function getRole(req) {
  return normalizeRole(req.user?.role);
}

function getRequestId(req, upstreamData = null) {
  return (
    upstreamData?.request_id ||
    req.get?.("x-request-id") ||
    req.headers?.["x-request-id"] ||
    randomUUID()
  );
}

function buildForwardHeaders(req, requestId, extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    "x-request-id": requestId,
    ...extraHeaders,
  };

  const tenantId = getTenantId(req);
  if (tenantId) headers["x-tenant-id"] = String(tenantId);
  if (req.user?._id) headers["x-user-id"] = String(req.user._id);

  const sessionId =
    req.params?.sessionId ||
    req.body?.session_id ||
    req.body?.sessionId ||
    req.get?.("x-session-id");

  if (sessionId) headers["x-session-id"] = String(sessionId);

  return headers;
}

function looksLikeHtml(s) {
  const t = String(s || "").trimStart();
  return t.startsWith("<!") || /^<html[\s>]/i.test(t);
}

function sanitizeMessage(raw, fallback = "AI request failed") {
  if (!raw) return fallback;
  const s = String(raw);
  return looksLikeHtml(s) ? fallback : s;
}

function buildBridgeError(error, requestId) {
  const upstreamDetail = error?.data?.detail;
  const message = sanitizeMessage(
    error?.message ||
    error?.data?.message ||
    error?.data?.error,
  );

  return {
    status:
      error?.status || (error instanceof AiUpstreamError ? 502 : 500),
    body: {
      success: false,
      message,
      requestId,
      ...(error?.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
      ...(upstreamDetail ? { detail: upstreamDetail } : {}),
    },
  };
}

function buildRequestTargets(req) {
  const userId = req.user?._id ? String(req.user._id) : null;
  const role = getRole(req);

  return {
    userIds: userId ? [userId] : [],
    teacherIds: role === "TEACHER" ? [userId] : [],
    studentIds: role === "STUDENT" ? [userId] : [],
  };
}

function emitAiWorkflowEvent({
  req,
  workflow,
  status,
  requestId,
  message,
  payload,
  upstream = null,
  error = null,
  entityType = "ai_request",
}) {
  if (!workflow) return null;

  return emitRealtimeEvent({
    type: workflow.type,
    status,
    requestId,
    entityType,
    entityId: workflow.entityId ? workflow.entityId({ req, payload, upstream }) : null,
    message:
      typeof message === "function"
        ? message({ req, payload, upstream, error })
        : message,
    actor: buildActorFromRequest(req),
    targets: buildRequestTargets(req),
    meta: {
      feature: workflow.type,
      topic: payload?.topic || null,
      subject: payload?.subject || null,
      difficulty: payload?.difficulty || null,
      gradeLevel: payload?.grade_level || null,
      numQuestions: payload?.num_questions || null,
      assignmentName: payload?.assignment_name || null,
      studentId: payload?.student_id || null,
      upstreamRequestId: upstream?.data?.request_id || null,
      statusCode: upstream?.status || error?.status || null,
      upstreamStatus: error?.upstreamStatus || null,
      ...(typeof workflow.meta === "function"
        ? workflow.meta({ req, payload, upstream, error })
        : workflow.meta || {}),
    },
  });
}

function createValidationError(message, detail = undefined) {
  const error = new Error(message);
  error.status = 400;
  error.data = detail ? { detail } : undefined;
  return error;
}

function requireRoleSet(req, allowedRoles = LMS_AI_ROLES) {
  const role = getRole(req);

  if (!allowedRoles.has(role)) {
    throw createValidationError("You do not have access to this AI feature");
  }

  return role;
}

function ensureString(value, field, { required = true, max = 500 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (!required) return "";
    throw createValidationError(`${field} is required`);
  }

  const text = String(value).trim();
  if (!text && required) throw createValidationError(`${field} is required`);
  if (text.length > max) {
    throw createValidationError(`${field} is too long`);
  }

  return text;
}

function ensureInteger(
  value,
  field,
  { required = true, min = 1, max = 100, fallback = undefined } = {},
) {
  if (value === undefined || value === null || value === "") {
    if (required && fallback === undefined) {
      throw createValidationError(`${field} is required`);
    }
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw createValidationError(`${field} must be an integer`);
  }
  if (parsed < min || parsed > max) {
    throw createValidationError(`${field} must be between ${min} and ${max}`);
  }
  return parsed;
}

function ensureObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createValidationError(`${field} must be an object`);
  }
  return value;
}

function ensureArray(value, field, { min = 1, max = 50 } = {}) {
  if (!Array.isArray(value)) {
    throw createValidationError(`${field} must be an array`);
  }
  if (value.length < min || value.length > max) {
    throw createValidationError(
      `${field} must contain between ${min} and ${max} items`,
    );
  }
  return value;
}

function resolveScopedUserIdentifier(req, providedValue) {
  const role = getRole(req);
  const provided = providedValue ? String(providedValue) : "";

  if (role === "STUDENT") {
    return String(req.user?._id || req.user?.id || "");
  }

  return provided || String(req.user?._id || req.user?.id || "");
}

function buildMultipartForm(file, fields = {}) {
  const form = new FormData();

  if (file) {
    form.append(
      "file",
      new Blob([file.buffer], {
        type: file.mimetype || "application/octet-stream",
      }),
      file.originalname || "upload.bin",
    );
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    form.append(key, String(value));
  }

  return form;
}

async function respondWithJsonProxy(req, res, options) {
  const startedAt = Date.now();
  let requestId = getRequestId(req);
  let payload;

  try {
    requireRoleSet(req, options.allowedRoles || LMS_AI_ROLES);

    payload = options.buildPayload ? options.buildPayload(req) : req.body;

    if (options.realtime) {
      emitAiWorkflowEvent({
        req,
        workflow: options.realtime,
        status: "started",
        requestId,
        message: options.realtime.startedMessage,
        payload,
        entityType: options.realtime.entityType,
      });
    }

    const upstream = await callAiService({
      method: options.method || "POST",
      path: options.path,
      body: payload,
      query: options.query ? options.query(req) : undefined,
      headers: buildForwardHeaders(req, requestId, options.headers || {}),
      timeoutMs: options.timeoutMs,
    });

    requestId = getRequestId(req, upstream.data);

    await logAiBridgeUsage({
      req,
      feature: options.feature,
      endpoint: options.endpoint,
      requestId,
      startedAt,
      success: true,
      responseData: upstream.data,
    });

    if (options.realtime) {
      emitAiWorkflowEvent({
        req,
        workflow: options.realtime,
        status: "success",
        requestId,
        message: options.realtime.successMessage,
        payload,
        upstream,
        entityType: options.realtime.entityType,
      });
    }

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    await logAiBridgeUsage({
      req,
      feature: options.feature,
      endpoint: options.endpoint,
      requestId,
      startedAt,
      success: false,
      error,
    });

    const normalized = buildBridgeError(error, requestId);

    if (options.realtime) {
      emitAiWorkflowEvent({
        req,
        workflow: options.realtime,
        status: "failed",
        requestId,
        message:
          options.realtime.failureMessage ||
          (() => normalized.body.message || "AI request failed"),
        payload,
        error,
        entityType: options.realtime.entityType,
      });
    }

    return res.status(normalized.status).json(normalized.body);
  }
}

async function respondWithBinaryProxy(req, res, options) {
  const startedAt = Date.now();
  let requestId = getRequestId(req);

  try {
    requireRoleSet(req, options.allowedRoles || LMS_AI_ROLES);

    const upstream = await callAiService({
      method: options.method || "GET",
      path: options.path,
      query: options.query ? options.query(req) : undefined,
      headers: buildForwardHeaders(req, requestId, options.headers || {}),
      responseType: "binary",
      timeoutMs: options.timeoutMs,
    });

    requestId = getRequestId(req);

    await logAiBridgeUsage({
      req,
      feature: options.feature,
      endpoint: options.endpoint,
      requestId,
      startedAt,
      success: true,
    });

    res.setHeader(
      "Content-Type",
      upstream.headers["content-type"] || options.contentType || "*/*",
    );

    if (upstream.headers["content-disposition"]) {
      res.setHeader(
        "Content-Disposition",
        upstream.headers["content-disposition"],
      );
    }

    return res.status(upstream.status).send(upstream.data);
  } catch (error) {
    await logAiBridgeUsage({
      req,
      feature: options.feature,
      endpoint: options.endpoint,
      requestId,
      startedAt,
      success: false,
      error,
    });

    const normalized = buildBridgeError(error, requestId);
    return res.status(normalized.status).json(normalized.body);
  }
}

export async function generateQuiz(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "quiz-generate",
    endpoint: "POST /api/ai/quiz/generate",
    path: "/api/quiz/generate",
    timeoutMs: 90000,
    realtime: {
      type: "quiz_generation",
      entityType: "quiz",
      startedMessage: ({ payload }) =>
        `Quiz generation started${payload?.topic ? ` for ${payload.topic}` : ""}`,
      successMessage: ({ payload }) =>
        `Quiz generated successfully${payload?.topic ? ` for ${payload.topic}` : ""}`,
      failureMessage: ({ payload, error }) =>
        `Quiz generation failed${payload?.topic ? ` for ${payload.topic}` : ""}: ${sanitizeMessage(error?.message, "Please try again")}`,
    },
    buildPayload: (request) => ({
      ...request.body,
      topic: ensureString(request.body?.topic, "topic", { max: 200 }),
      question_type: request.body?.question_type
        ? String(request.body.question_type)
        : "multiple_choice",
      difficulty: request.body?.difficulty
        ? String(request.body.difficulty)
        : "medium",
      grade_level: request.body?.grade_level
        ? String(request.body.grade_level)
        : "High School",
      language: request.body?.language
        ? String(request.body.language)
        : "English",
      curriculum: request.body?.curriculum
        ? String(request.body.curriculum)
        : "General",
      num_questions: ensureInteger(request.body?.num_questions, "num_questions", {
        min: 1,
        max: 50,
        fallback: 5,
      }),
    }),
  });
}

export async function gradeQuiz(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "quiz-grade",
    endpoint: "POST /api/ai/grade-quiz",
    path: "/api/grade-quiz",
    realtime: {
      type: "grading",
      entityType: "quiz_submission",
      startedMessage: () => "AI quiz grading started",
      successMessage: () => "AI quiz grading completed successfully",
      failureMessage: ({ error }) =>
        `AI quiz grading failed: ${sanitizeMessage(error?.message, "Please retry")}`,
      meta: ({ payload }) => ({
        questionCount: Array.isArray(payload?.assignment_data?.questions)
          ? payload.assignment_data.questions.length
          : Array.isArray(payload?.quiz_questions)
            ? payload.quiz_questions.length
            : null,
      }),
    },
    buildPayload: (request) => {
      const assignmentData = ensureObject(
        request.body?.assignment_data || {},
        "assignment_data",
      );
      const resolvedQuestions = Array.isArray(request.body?.quiz_questions)
        ? request.body.quiz_questions
        : assignmentData.questions;

      ensureArray(resolvedQuestions, "quiz_questions", {
        min: 1,
        max: 100,
      });
      ensureObject(request.body?.student_answers, "student_answers");

      const payload = {
        ...request.body,
        assignment_data: {
          ...assignmentData,
          questions: resolvedQuestions,
        },
        quiz_questions: resolvedQuestions,
        student_id: resolveScopedUserIdentifier(
          request,
          request.body?.student_id,
        ),
      };

      return payload;
    },
  });
}

export async function gradeSingleQuestion(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "quiz-grade-question",
    endpoint: "POST /api/ai/grade-question",
    path: "/api/grade-question",
    buildPayload: (request) => {
      ensureObject(request.body?.question_data, "question_data");
      ensureString(request.body?.student_answer, "student_answer", {
        required: false,
        max: 20000,
      });

      return {
        ...request.body,
        student_id: resolveScopedUserIdentifier(
          request,
          request.body?.student_id,
        ),
      };
    },
  });
}

export async function getGradingHealth(req, res) {
  try {
    requireRoleSet(req, LMS_AI_ROLES);

    const upstream = await callAiService({
      method: "GET",
      path: "/api/grade/health",
      headers: buildForwardHeaders(req, getRequestId(req)),
      timeoutMs: 15000,
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return res.status(200).json({
      status: "unavailable",
      message: error?.message || "AI grading health unavailable",
    });
  }
}

export async function generateAssignment(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "assignment-generate",
    endpoint: "POST /api/ai/assignments/generate",
    path: "/api/assignments/generate",
    realtime: {
      type: "assignment_generation",
      entityType: "assignment",
      startedMessage: ({ payload }) =>
        `Assignment generation started${payload?.topic ? ` for ${payload.topic}` : ""}`,
      successMessage: ({ payload }) =>
        `Assignment generated successfully${payload?.topic ? ` for ${payload.topic}` : ""}`,
      failureMessage: ({ payload, error }) =>
        `Assignment generation failed${payload?.topic ? ` for ${payload.topic}` : ""}: ${sanitizeMessage(error?.message, "Please try again")}`,
    },
    buildPayload: (request) => ({
      ...request.body,
      topic: ensureString(request.body?.topic, "topic", { max: 200 }),
      grade_level: request.body?.grade_level
        ? String(request.body.grade_level)
        : "High School",
      subject: request.body?.subject ? String(request.body.subject) : "General",
      language: request.body?.language
        ? String(request.body.language)
        : "English",
      question_type: request.body?.question_type
        ? String(request.body.question_type)
        : "mixed",
      difficulty: request.body?.difficulty
        ? String(request.body.difficulty)
        : "medium",
      assignment_type: request.body?.assignment_type
        ? String(request.body.assignment_type)
        : "homework",
      curriculum: request.body?.curriculum
        ? String(request.body.curriculum)
        : "American",
      num_questions: ensureInteger(request.body?.num_questions, "num_questions", {
        min: 1,
        max: 30,
        fallback: 5,
      }),
    }),
  });
}

export async function validateAssignment(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "assignment-validate",
    endpoint: "POST /api/ai/assignments/validate",
    path: "/api/assignments/validate",
    buildPayload: (request) => {
      ensureObject(request.body?.assignment, "assignment");
      return request.body;
    },
  });
}

export async function uploadAssignmentFile(req, res) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  try {
    requireRoleSet(req, LMS_AI_ROLES);

    if (!req.file) {
      throw createValidationError("file is required");
    }

    const upstream = await callAiService({
      method: "POST",
      path: "/api/assignments/upload",
      body: buildMultipartForm(req.file, {
        workspace_id: req.body?.workspace_id,
        assignment_id: req.body?.assignment_id,
        purpose: req.body?.purpose,
      }),
      headers: buildForwardHeaders(req, requestId),
    });

    await logAiBridgeUsage({
      req,
      feature: "assignment-upload",
      endpoint: "POST /api/ai/assignments/upload",
      requestId,
      startedAt,
      success: true,
      responseData: upstream.data,
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    await logAiBridgeUsage({
      req,
      feature: "assignment-upload",
      endpoint: "POST /api/ai/assignments/upload",
      requestId,
      startedAt,
      success: false,
      error,
    });

    const normalized = buildBridgeError(error, requestId);
    return res.status(normalized.status).json(normalized.body);
  }
}

export async function saveAssignmentReport(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "assignment-report",
    endpoint: "POST /api/ai/assignments/report",
    path: "/api/assignments/report",
    buildPayload: (request) => {
      ensureObject(request.body?.assignment, "assignment");
      return {
        ...request.body,
        student_id: resolveScopedUserIdentifier(
          request,
          request.body?.student_id,
        ),
      };
    },
  });
}

export async function gradeAssignment(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "assignment-grade",
    endpoint: "POST /api/ai/assignments/grade",
    path: "/api/assignments/grade",
    realtime: {
      type: "grading",
      entityType: "assignment_submission",
      startedMessage: () => "AI assignment grading started",
      successMessage: () => "AI assignment grading completed successfully",
      failureMessage: ({ error }) =>
        `AI assignment grading failed: ${sanitizeMessage(error?.message, "Please retry")}`,
      meta: ({ payload }) => ({
        questionCount: Array.isArray(payload?.assignment?.questions)
          ? payload.assignment.questions.length
          : Array.isArray(payload?.assignment_data?.questions)
            ? payload.assignment_data.questions.length
            : null,
      }),
    },
    buildPayload: (request) => {
      ensureObject(request.body?.assignment, "assignment");
      ensureObject(request.body?.student_answers, "student_answers");
      return request.body;
    },
  });
}

export async function getAssignmentById(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "assignment-get",
    endpoint: "GET /api/ai/assignments/:assignmentId",
    path: `/api/assignments/${encodeURIComponent(
      ensureString(req.params?.assignmentId, "assignmentId"),
    )}`,
    method: "GET",
  });
}

export async function listAssignments(req, res) {
  try {
    requireRoleSet(req, LMS_AI_ROLES);

    const tenantId = getTenantId(req);
    const role = getRole(req);
    const userId = req.user?._id;

    const limit = req.query?.limit !== undefined
      ? ensureInteger(req.query.limit, "limit", { min: 1, max: 100 })
      : 20;
    const offset = req.query?.offset !== undefined
      ? ensureInteger(req.query.offset, "offset", { min: 0, max: 10000 })
      : 0;

    const filter = {};
    if (tenantId) filter.tenantId = String(tenantId);

    // Students only see published assignments for their courses
    if (role === "STUDENT") {
      filter.status = "published";
    } else if (role === "TEACHER") {
      // Teachers see assignments they created or all in the tenant
      filter.$or = [{ createdBy: userId }, { tenantId: String(tenantId) }];
    }

    const [assignments, total] = await Promise.all([
      Assignment.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(filter),
    ]);

    return res.status(200).json({
      assignments,
      total,
      limit,
      offset,
    });
  } catch (error) {
    const requestId = getRequestId(req);
    return res.status(error.status || 500).json(
      buildBridgeError(error, requestId),
    );
  }
}

export async function getAssignmentsHealth(req, res) {
  try {
    requireRoleSet(req, LMS_AI_ROLES);

    const upstream = await callAiService({
      method: "GET",
      path: "/api/assignments/health",
      headers: buildForwardHeaders(req, getRequestId(req)),
      timeoutMs: 15000,
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return res.status(200).json({
      status: "unavailable",
      message: sanitizeMessage(
        error?.message,
        "Assignments AI health unavailable",
      ),
    });
  }
}

export async function startTutorSession(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "tutor-session",
    endpoint: "POST /api/ai/tutor/session/:sessionId",
    path: `/api/tutor/session/${encodeURIComponent(
      ensureString(req.params?.sessionId, "sessionId"),
    )}`,
    buildPayload: (request) => request.body || {},
  });
}

export async function uploadTutorMaterial(req, res) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  try {
    requireRoleSet(req, LMS_AI_ROLES);

    if (!req.file) {
      throw createValidationError("file is required");
    }

    const sessionId = ensureString(req.params?.sessionId, "sessionId");
    const upstream = await callAiService({
      method: "POST",
      path: `/api/tutor/material/${encodeURIComponent(sessionId)}`,
      body: buildMultipartForm(req.file),
      headers: buildForwardHeaders(req, requestId),
    });

    await logAiBridgeUsage({
      req,
      feature: "tutor-material",
      endpoint: "POST /api/ai/tutor/material/:sessionId",
      requestId,
      startedAt,
      success: true,
      responseData: upstream.data,
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    await logAiBridgeUsage({
      req,
      feature: "tutor-material",
      endpoint: "POST /api/ai/tutor/material/:sessionId",
      requestId,
      startedAt,
      success: false,
      error,
    });

    const normalized = buildBridgeError(error, requestId);
    return res.status(normalized.status).json(normalized.body);
  }
}

export async function tutorChat(req, res) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  try {
    requireRoleSet(req, LMS_AI_ROLES);

    const sessionId = ensureString(
      req.body?.session_id || req.body?.sessionId,
      "session_id",
    );
    const message = ensureString(req.body?.message, "message", {
      max: 10000,
    });

    if (req.file) {
      await callAiService({
        method: "POST",
        path: `/api/tutor/material/${encodeURIComponent(sessionId)}`,
        body: buildMultipartForm(req.file),
        headers: buildForwardHeaders(req, requestId),
      });
    }

    const payload = {
      session_id: sessionId,
      message,
      ...(req.body?.subject ? { subject: String(req.body.subject) } : {}),
      ...(req.body?.tone ? { tone: String(req.body.tone) } : {}),
      ...(req.body?.language ? { language: String(req.body.language) } : {}),
      ...(req.body?.curriculum
        ? { curriculum: String(req.body.curriculum) }
        : {}),
      user_profile: req.user?._id ? { _id: String(req.user._id) } : undefined,
    };

    const upstream = await callAiService({
      method: "POST",
      path: "/api/tutor/chat",
      body: payload,
      headers: buildForwardHeaders(req, requestId),
    });

    await logAiBridgeUsage({
      req,
      feature: "tutor-chat",
      endpoint: "POST /api/ai/tutor/chat",
      requestId,
      startedAt,
      success: true,
      responseData: upstream.data,
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    await logAiBridgeUsage({
      req,
      feature: "tutor-chat",
      endpoint: "POST /api/ai/tutor/chat",
      requestId,
      startedAt,
      success: false,
      error,
    });

    const normalized = buildBridgeError(error, requestId);
    return res.status(normalized.status).json(normalized.body);
  }
}

export async function generateExplanation(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "explanation-generate",
    endpoint: "POST /api/ai/learning/explanation",
    path: "/api/learning/explanation",
    buildPayload: (request) => {
      ensureObject(request.body?.question_data, "question_data");
      return request.body;
    },
  });
}

export async function generateBatchExplanations(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "explanation-batch",
    endpoint: "POST /api/ai/learning/explanations/batch",
    path: "/api/learning/explanations/batch",
    buildPayload: (request) => {
      ensureArray(request.body?.requests, "requests", { min: 1, max: 20 });
      return request.body;
    },
  });
}

export async function downloadReportPdf(req, res) {
  return respondWithBinaryProxy(req, res, {
    feature: "report-pdf",
    endpoint: "GET /api/ai/reports/pdf/:reportId",
    path: `/api/reports/pdf/${encodeURIComponent(
      ensureString(req.params?.reportId, "reportId"),
    )}`,
    contentType: "application/pdf",
  });
}

export async function downloadReportJson(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "report-json",
    endpoint: "GET /api/ai/reports/json/:reportId",
    path: `/api/reports/json/${encodeURIComponent(
      ensureString(req.params?.reportId, "reportId"),
    )}`,
    method: "GET",
  });
}

export async function downloadReportZip(req, res) {
  return respondWithBinaryProxy(req, res, {
    feature: "report-download",
    endpoint: "GET /api/ai/reports/download/:reportId",
    path: `/api/reports/download/${encodeURIComponent(
      ensureString(req.params?.reportId, "reportId"),
    )}`,
    contentType: "application/zip",
  });
}

export async function getReportStatus(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "report-status",
    endpoint: "GET /api/ai/reports/status/:reportId",
    path: `/api/reports/status/${encodeURIComponent(
      ensureString(req.params?.reportId, "reportId"),
    )}`,
    method: "GET",
  });
}

export async function getStudentReports(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "report-student-list",
    endpoint: "POST /api/ai/reports/student",
    path: "/api/reports/student",
    buildPayload: (request) => ({
      ...request.body,
      student_id: resolveScopedUserIdentifier(
        request,
        request.body?.student_id,
      ),
      ...(request.body?.limit !== undefined
        ? {
            limit: ensureInteger(request.body.limit, "limit", {
              min: 1,
              max: 100,
            }),
          }
        : {}),
    }),
  });
}

export async function getStudentProgress(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "report-progress",
    endpoint: "POST /api/ai/reports/progress",
    path: "/api/reports/progress",
    buildPayload: (request) => ({
      ...request.body,
      student_id: resolveScopedUserIdentifier(
        request,
        request.body?.student_id,
      ),
      ...(request.body?.days !== undefined
        ? {
            days: ensureInteger(request.body.days, "days", {
              min: 1,
              max: 365,
            }),
          }
        : {}),
    }),
  });
}

export async function getReportDashboard(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "report-dashboard",
    endpoint: "GET /api/ai/reports/dashboard/:userIdentifier",
    path: `/api/reports/dashboard/${encodeURIComponent(
      resolveScopedUserIdentifier(req, req.params?.userIdentifier),
    )}`,
    method: "GET",
  });
}

export async function downloadLegacyReportPdf(req, res) {
  return downloadReportPdf(req, res);
}

export async function downloadLegacyReportJson(req, res) {
  return downloadReportJson(req, res);
}

// ============================================================
// COMMIT 20 — TEACHER TOOLS
// All teacher-tool endpoints require TEACHER, ADMIN, or SUPERADMIN.
// explain-mistake is also available to students.
// ============================================================

const TEACHER_ROLES = new Set(["TEACHER", "ADMIN", "SUPERADMIN"]);
const STUDENT_PLUS_ROLES = new Set(["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN"]);

export async function rewriteQuestion(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "teacher-rewrite-question",
    endpoint: "POST /api/ai/teacher/rewrite-question",
    path: "/api/teacher/rewrite-question",
    allowedRoles: TEACHER_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        question_text: ensureString(body.question_text, "question_text", { max: 2000 }),
        action: ensureString(body.action, "action"),
        subject: body.subject ? String(body.subject) : "General",
        grade_level: body.grade_level ? String(body.grade_level) : "High School",
        language: body.language ? String(body.language) : "English",
        options: Array.isArray(body.options) ? body.options.slice(0, 4).map(String) : [],
        correct_answer: body.correct_answer ? String(body.correct_answer) : "",
      };
    },
  });
}

export async function generateDistractors(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "teacher-distractors",
    endpoint: "POST /api/ai/teacher/distractors",
    path: "/api/teacher/distractors",
    allowedRoles: TEACHER_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        question_text: ensureString(body.question_text, "question_text", { max: 2000 }),
        correct_answer: ensureString(body.correct_answer, "correct_answer"),
        subject: body.subject ? String(body.subject) : "General",
        grade_level: body.grade_level ? String(body.grade_level) : "High School",
        existing_distractors: Array.isArray(body.existing_distractors)
          ? body.existing_distractors.slice(0, 4).map(String)
          : [],
      };
    },
  });
}

export async function draftFeedback(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "teacher-draft-feedback",
    endpoint: "POST /api/ai/teacher/draft-feedback",
    path: "/api/teacher/draft-feedback",
    allowedRoles: TEACHER_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        question_text: ensureString(body.question_text, "question_text", { max: 2000 }),
        student_answer: ensureString(body.student_answer, "student_answer", { max: 10000 }),
        rubric: body.rubric ? String(body.rubric) : "",
        score: body.score !== undefined ? Number(body.score) : 0,
        max_score: body.max_score !== undefined ? Number(body.max_score) : 10,
        subject: body.subject ? String(body.subject) : "General",
        grade_level: body.grade_level ? String(body.grade_level) : "High School",
        assignment_name: body.assignment_name ? String(body.assignment_name) : "Assignment",
      };
    },
  });
}

export async function draftAnnouncement(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "teacher-announcement-draft",
    endpoint: "POST /api/ai/teacher/announcement-draft",
    path: "/api/teacher/announcement-draft",
    allowedRoles: TEACHER_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        action: ensureString(body.action, "action"),
        context: body.context ? String(body.context).slice(0, 800) : "",
        current_text: body.current_text ? String(body.current_text).slice(0, 800) : "",
        language: body.language ? String(body.language) : "English",
      };
    },
  });
}

export async function lessonSummary(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "teacher-lesson-summary",
    endpoint: "POST /api/ai/teacher/lesson-summary",
    path: "/api/teacher/lesson-summary",
    allowedRoles: TEACHER_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        lesson_text: ensureString(body.lesson_text, "lesson_text", { max: 8000 }),
        output_type: body.output_type ? String(body.output_type) : "summary",
        subject: body.subject ? String(body.subject) : "General",
        grade_level: body.grade_level ? String(body.grade_level) : "High School",
        language: body.language ? String(body.language) : "English",
      };
    },
  });
}

export async function explainMistake(req, res) {
  return respondWithJsonProxy(req, res, {
    feature: "student-explain-mistake",
    endpoint: "POST /api/ai/teacher/explain-mistake",
    path: "/api/teacher/explain-mistake",
    allowedRoles: STUDENT_PLUS_ROLES,
    buildPayload: (request) => {
      const body = request.body || {};
      return {
        question_text: ensureString(body.question_text, "question_text", { max: 2000 }),
        correct_answer: ensureString(body.correct_answer, "correct_answer", { required: false, max: 2000 }),
        student_answer: ensureString(body.student_answer, "student_answer", { required: false, max: 5000 }),
        question_type: body.question_type ? String(body.question_type) : "multiple_choice",
        subject: body.subject ? String(body.subject) : "General",
        grade_level: body.grade_level ? String(body.grade_level) : "High School",
        explanation: body.explanation ? String(body.explanation).slice(0, 500) : "",
      };
    },
  });
}
