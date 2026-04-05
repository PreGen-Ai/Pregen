import { randomUUID } from "crypto";

import { getTenantId, normalizeRole } from "../middleware/authMiddleware.js";
import { logAiBridgeUsage } from "../services/ai/aiUsageLogger.js";
import {
  AiUpstreamError,
  callAiService,
} from "../services/ai/fastapiClient.js";

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

function buildBridgeError(error, requestId) {
  const upstreamDetail = error?.data?.detail;
  const message =
    error?.message ||
    error?.data?.message ||
    error?.data?.error ||
    "AI request failed";

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

  try {
    requireRoleSet(req, options.allowedRoles || LMS_AI_ROLES);

    const payload = options.buildPayload ? options.buildPayload(req) : req.body;
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
    buildPayload: (request) => {
      const payload = {
        ...request.body,
        student_id: resolveScopedUserIdentifier(
          request,
          request.body?.student_id,
        ),
      };

      ensureObject(payload.assignment_data, "assignment_data");
      ensureArray(payload.assignment_data.questions, "assignment_data.questions", {
        min: 1,
        max: 100,
      });
      ensureObject(payload.student_answers, "student_answers");

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
  return respondWithJsonProxy(req, res, {
    feature: "assignment-list",
    endpoint: "GET /api/ai/assignments",
    path: "/api/assignments",
    method: "GET",
    query: (request) => ({
      limit:
        request.query?.limit !== undefined
          ? ensureInteger(request.query.limit, "limit", {
              min: 1,
              max: 100,
            })
          : undefined,
      offset:
        request.query?.offset !== undefined
          ? ensureInteger(request.query.offset, "offset", {
              min: 0,
              max: 10000,
            })
          : undefined,
    }),
  });
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
      message: error?.message || "Assignments AI health unavailable",
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
