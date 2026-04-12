export const GRADING_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  AI_GRADED: "ai_graded",
  PENDING_TEACHER_REVIEW: "pending_teacher_review",
  GRADING_DELAYED: "grading_delayed",
  FINAL: "final",
  FAILED: "failed",
});

export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  AI_GRADED: "ai_graded",
  PENDING_TEACHER_REVIEW: "pending_teacher_review",
  GRADING_DELAYED: "grading_delayed",
  FINAL: "final",
  FAILED: "failed",
});

const LEGACY_STATUS_MAP = {
  pending: GRADING_STATUS.SUBMITTED,
  submitted: GRADING_STATUS.SUBMITTED,
  grading: GRADING_STATUS.PENDING_TEACHER_REVIEW,
  graded: GRADING_STATUS.FINAL,
  ai_graded: GRADING_STATUS.AI_GRADED,
  pending_teacher_review: GRADING_STATUS.PENDING_TEACHER_REVIEW,
  grading_delayed: GRADING_STATUS.GRADING_DELAYED,
  final: GRADING_STATUS.FINAL,
  failed: GRADING_STATUS.FAILED,
  in_progress: ATTEMPT_STATUS.IN_PROGRESS,
};

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function normalizeReviewStatus(
  value,
  fallback = GRADING_STATUS.SUBMITTED,
) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[normalized] || fallback;
}

export function getCurrentScore(record = {}) {
  const candidates = [
    record.finalScore,
    record.teacherAdjustedScore,
    record.aiScore,
    record.grade,
    record.score,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function getCurrentFeedback(record = {}) {
  const candidates = [
    record.finalFeedback,
    record.teacherAdjustedFeedback,
    record.aiFeedback,
    record.feedback,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }

  return "";
}

export function isFinalized(record = {}, statusField = "gradingStatus") {
  return (
    normalizeReviewStatus(record?.[statusField], GRADING_STATUS.SUBMITTED) ===
      GRADING_STATUS.FINAL ||
    record?.teacherApprovedAt ||
    record?.finalScore !== null && record?.finalScore !== undefined
  );
}

export function appendReviewAudit(record, entry) {
  const nextEntry = {
    action: normalizeText(entry?.action, "updated"),
    actorId: entry?.actorId ? String(entry.actorId) : null,
    actorRole: entry?.actorRole ? String(entry.actorRole).toUpperCase() : null,
    source: normalizeText(entry?.source, "teacher"),
    statusFrom: normalizeReviewStatus(entry?.statusFrom, GRADING_STATUS.SUBMITTED),
    statusTo: normalizeReviewStatus(entry?.statusTo, GRADING_STATUS.SUBMITTED),
    score:
      entry?.score === null || entry?.score === undefined || entry?.score === ""
        ? null
        : Number(entry.score),
    feedback: normalizeText(entry?.feedback),
    error: normalizeText(entry?.error),
    metadata:
      entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
    at: entry?.at instanceof Date ? entry.at : new Date(),
  };

  const history = Array.isArray(record.gradingAudit)
    ? record.gradingAudit.slice(-49)
    : [];
  history.push(nextEntry);
  record.gradingAudit = history;
  return nextEntry;
}

export function applyAiReviewState(
  record,
  {
    statusField = "gradingStatus",
    score = null,
    feedback = "",
    metadata = {},
    reportId = null,
    fallbackStatus = GRADING_STATUS.PENDING_TEACHER_REVIEW,
  } = {},
) {
  const previousStatus = normalizeReviewStatus(
    record[statusField],
    GRADING_STATUS.SUBMITTED,
  );
  const normalizedScore =
    score === null || score === undefined || score === ""
      ? null
      : Number(score);

  if (normalizedScore !== null && Number.isFinite(normalizedScore)) {
    record.aiScore = normalizedScore;
    record.score = normalizedScore;
    if (record.grade === undefined) record.grade = null;
  }

  record.aiFeedback = normalizeText(feedback);
  record.feedback = record.aiFeedback || record.feedback || "";
  record.aiGradedAt = new Date();
  record.aiReportId = reportId || record.aiReportId || null;
  record.latestGradingError = "";
  record[statusField] = fallbackStatus;

  if (record.gradedBy !== undefined) {
    record.gradedBy = "AI";
  }

  appendReviewAudit(record, {
    action: "ai_scored",
    actorId: null,
    actorRole: null,
    source: "ai",
    statusFrom: previousStatus,
    statusTo: fallbackStatus,
    score: normalizedScore,
    feedback: record.aiFeedback,
    metadata,
  });
}

export function applyGradingDelayState(
  record,
  {
    statusField = "gradingStatus",
    error = "AI grading delayed",
    metadata = {},
  } = {},
) {
  const previousStatus = normalizeReviewStatus(
    record[statusField],
    GRADING_STATUS.SUBMITTED,
  );

  record[statusField] = GRADING_STATUS.GRADING_DELAYED;
  record.latestGradingError = normalizeText(error, "AI grading delayed");

  appendReviewAudit(record, {
    action: "ai_failed",
    actorId: null,
    actorRole: null,
    source: "ai",
    statusFrom: previousStatus,
    statusTo: GRADING_STATUS.GRADING_DELAYED,
    score: null,
    feedback: "",
    error: record.latestGradingError,
    metadata,
  });
}

export function applyTeacherReviewState(
  record,
  {
    actorId,
    actorRole = "TEACHER",
    statusField = "gradingStatus",
    score,
    feedback,
    metadata = {},
  } = {},
) {
  const previousStatus = normalizeReviewStatus(
    record[statusField],
    GRADING_STATUS.SUBMITTED,
  );
  const baselineScore = getCurrentScore(record);
  const baselineFeedback = getCurrentFeedback(record);

  const nextScore =
    score === undefined || score === null || score === ""
      ? baselineScore
      : Number(score);

  if (nextScore === null || !Number.isFinite(nextScore)) {
    throw new Error("A numeric score is required for teacher review");
  }

  const nextFeedback =
    feedback === undefined ? baselineFeedback : normalizeText(feedback);

  record.teacherAdjustedScore = nextScore;
  record.teacherAdjustedFeedback = nextFeedback;
  record.adjustedByTeacher =
    record.aiScore !== null && record.aiScore !== undefined
      ? Number(record.aiScore) !== nextScore ||
        normalizeText(record.aiFeedback) !== nextFeedback
      : true;
  record.teacherAdjustedAt = new Date();
  record.feedback = nextFeedback;
  record.score = nextScore;
  record[statusField] = GRADING_STATUS.PENDING_TEACHER_REVIEW;

  appendReviewAudit(record, {
    action: "teacher_reviewed",
    actorId,
    actorRole,
    source: "teacher",
    statusFrom: previousStatus,
    statusTo: GRADING_STATUS.PENDING_TEACHER_REVIEW,
    score: nextScore,
    feedback: nextFeedback,
    metadata,
  });

  return {
    score: nextScore,
    feedback: nextFeedback,
  };
}

export function applyFinalApprovalState(
  record,
  {
    actorId,
    actorRole = "TEACHER",
    statusField = "gradingStatus",
    score,
    feedback,
    metadata = {},
    source = "teacher",
  } = {},
) {
  const previousStatus = normalizeReviewStatus(
    record[statusField],
    GRADING_STATUS.SUBMITTED,
  );

  const nextScore =
    score === undefined || score === null || score === ""
      ? record.teacherAdjustedScore ?? record.aiScore ?? record.finalScore
      : Number(score);
  if (nextScore === null || !Number.isFinite(nextScore)) {
    throw new Error("A numeric score is required before final approval");
  }

  const nextFeedback =
    feedback === undefined
      ? record.teacherAdjustedFeedback ??
        record.aiFeedback ??
        record.finalFeedback ??
        ""
      : normalizeText(feedback);

  record.finalScore = nextScore;
  record.finalFeedback = nextFeedback;
  record.grade = nextScore;
  record.score = nextScore;
  record.feedback = nextFeedback;
  record.teacherApprovedAt = new Date();
  record.teacherApprovedBy = actorId || record.teacherApprovedBy || null;
  record.gradedAt = record.teacherApprovedAt;
  record[statusField] = GRADING_STATUS.FINAL;
  record.latestGradingError = "";

  if (record.gradedBy !== undefined) {
    record.gradedBy =
      source === "system" && !actorId ? "AI" : "TEACHER";
  }

  appendReviewAudit(record, {
    action: source === "system" ? "system_finalized" : "teacher_approved",
    actorId,
    actorRole,
    source,
    statusFrom: previousStatus,
    statusTo: GRADING_STATUS.FINAL,
    score: nextScore,
    feedback: nextFeedback,
    metadata,
  });

  return {
    score: nextScore,
    feedback: nextFeedback,
  };
}
