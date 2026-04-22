import TenantSettings from "../../models/TenantSettings.js";

export const AI_FEATURE_KEYS = Object.freeze([
  "aiGrading",
  "aiQuizGen",
  "aiTutor",
  "aiSummaries",
]);

export const AI_FEATURE_LABELS = Object.freeze({
  aiGrading: "AI Grading",
  aiQuizGen: "AI Quiz Generation",
  aiTutor: "AI Tutor",
  aiSummaries: "AI Summaries",
});

export const AI_FEEDBACK_TONES = Object.freeze([
  "strict",
  "neutral",
  "encouraging",
]);

export const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: true,
  feedbackTone: "neutral",
  minTokens: 256,
  maxTokens: 4096,
  softCapDaily: 50000,
  softCapWeekly: 250000,
  features: Object.freeze({
    aiGrading: true,
    aiQuizGen: true,
    aiTutor: true,
    aiSummaries: true,
  }),
});

const AI_ROUTE_FEATURE_MAP = Object.freeze({
  "quiz-generate": "aiQuizGen",
  "assignment-generate": "aiQuizGen",
  "assignment-validate": "aiQuizGen",
  "teacher-rewrite-question": "aiQuizGen",
  "teacher-distractors": "aiQuizGen",
  "quiz-grade": "aiGrading",
  "quiz-grade-question": "aiGrading",
  "assignment-grade": "aiGrading",
  "teacher-draft-feedback": "aiGrading",
  "tutor-session": "aiTutor",
  "tutor-material": "aiTutor",
  "tutor-chat": "aiTutor",
  "explanation-generate": "aiTutor",
  "explanation-batch": "aiTutor",
  "student-explain-mistake": "aiTutor",
  "teacher-lesson-summary": "aiSummaries",
  "teacher-announcement-draft": "aiSummaries",
});

function cloneDefaults() {
  return {
    enabled: DEFAULT_AI_SETTINGS.enabled,
    feedbackTone: DEFAULT_AI_SETTINGS.feedbackTone,
    minTokens: DEFAULT_AI_SETTINGS.minTokens,
    maxTokens: DEFAULT_AI_SETTINGS.maxTokens,
    softCapDaily: DEFAULT_AI_SETTINGS.softCapDaily,
    softCapWeekly: DEFAULT_AI_SETTINGS.softCapWeekly,
    features: {
      ...DEFAULT_AI_SETTINGS.features,
    },
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInteger(value, fallback, { min = 0, max = 1_000_000_000 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toOptionalInteger(value, opts = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  return toInteger(value, undefined, opts);
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeFeedbackTone(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return AI_FEEDBACK_TONES.includes(normalized) ? normalized : fallback;
}

export function normalizeAiSettings(raw = {}, { partial = false } = {}) {
  const source = isPlainObject(raw) ? raw : {};
  const base = partial ? {} : cloneDefaults();
  const output = { ...base };

  const enabled = toBoolean(source.enabled, partial ? undefined : base.enabled);
  if (enabled !== undefined) output.enabled = enabled;

  const feedbackTone = normalizeFeedbackTone(
    source.feedbackTone,
    partial ? undefined : base.feedbackTone,
  );
  if (feedbackTone !== undefined) output.feedbackTone = feedbackTone;

  const minTokens = partial
    ? toOptionalInteger(source.minTokens, { min: 0, max: 1_000_000 })
    : toInteger(source.minTokens, base.minTokens, { min: 0, max: 1_000_000 });
  if (minTokens !== undefined) output.minTokens = minTokens;

  const maxTokens = partial
    ? toOptionalInteger(source.maxTokens, { min: 0, max: 1_000_000 })
    : toInteger(source.maxTokens, base.maxTokens, { min: 0, max: 1_000_000 });
  if (maxTokens !== undefined) output.maxTokens = maxTokens;

  const softCapDaily = partial
    ? toOptionalInteger(source.softCapDaily, { min: 0, max: 10_000_000_000 })
    : toInteger(source.softCapDaily, base.softCapDaily, {
        min: 0,
        max: 10_000_000_000,
      });
  if (softCapDaily !== undefined) output.softCapDaily = softCapDaily;

  const softCapWeekly = partial
    ? toOptionalInteger(source.softCapWeekly, { min: 0, max: 10_000_000_000 })
    : toInteger(source.softCapWeekly, base.softCapWeekly, {
        min: 0,
        max: 10_000_000_000,
      });
  if (softCapWeekly !== undefined) output.softCapWeekly = softCapWeekly;

  const featuresSource = isPlainObject(source.features) ? source.features : {};
  const features = partial ? {} : { ...base.features };
  for (const key of AI_FEATURE_KEYS) {
    const nextValue = toBoolean(
      featuresSource[key],
      partial ? undefined : features[key],
    );
    if (nextValue !== undefined) {
      features[key] = nextValue;
    }
  }
  if (partial) {
    if (Object.keys(features).length > 0) {
      output.features = features;
    }
  } else {
    output.features = features;
  }

  return output;
}

export function validateAiSettings(settings, { partial = false } = {}) {
  const normalized = normalizeAiSettings(settings, { partial });

  const minTokens = normalized.minTokens;
  const maxTokens = normalized.maxTokens;
  const softCapDaily = normalized.softCapDaily;
  const softCapWeekly = normalized.softCapWeekly;

  if (
    minTokens !== undefined &&
    maxTokens !== undefined &&
    maxTokens > 0 &&
    minTokens > maxTokens
  ) {
    const error = new Error(
      "Maximum token threshold must be greater than or equal to the minimum token threshold.",
    );
    error.status = 400;
    throw error;
  }

  if (
    softCapDaily !== undefined &&
    softCapWeekly !== undefined &&
    softCapDaily > 0 &&
    softCapWeekly > 0 &&
    softCapWeekly < softCapDaily
  ) {
    const error = new Error(
      "Weekly token soft cap must be greater than or equal to the daily soft cap.",
    );
    error.status = 400;
    throw error;
  }

  return normalized;
}

export function mergeAiSettings(baseSettings = {}, overrideSettings = {}) {
  return {
    ...normalizeAiSettings(baseSettings),
    ...normalizeAiSettings(overrideSettings, { partial: true }),
    features: {
      ...normalizeAiSettings(baseSettings).features,
      ...(normalizeAiSettings(overrideSettings, { partial: true }).features || {}),
    },
  };
}

function isEmptyOverride(value) {
  if (!isPlainObject(value)) return true;
  const scalarKeys = [
    "enabled",
    "feedbackTone",
    "minTokens",
    "maxTokens",
    "softCapDaily",
    "softCapWeekly",
  ];
  if (scalarKeys.some((key) => value[key] !== undefined)) return false;

  const features = value.features || {};
  return !AI_FEATURE_KEYS.some((key) => features[key] !== undefined);
}

export function buildAiOverride(platformDefaults = {}, effectiveSettings = {}) {
  const platform = normalizeAiSettings(platformDefaults);
  const effective = normalizeAiSettings(effectiveSettings);
  const override = {};

  for (const key of [
    "enabled",
    "feedbackTone",
    "minTokens",
    "maxTokens",
    "softCapDaily",
    "softCapWeekly",
  ]) {
    if (effective[key] !== platform[key]) {
      override[key] = effective[key];
    }
  }

  const featureOverride = {};
  for (const key of AI_FEATURE_KEYS) {
    if (effective.features?.[key] !== platform.features?.[key]) {
      featureOverride[key] = effective.features?.[key];
    }
  }
  if (Object.keys(featureOverride).length > 0) {
    override.features = featureOverride;
  }

  return isEmptyOverride(override) ? null : override;
}

export function buildAiInheritanceMap(override = {}) {
  const safeOverride = normalizeAiSettings(override, { partial: true });
  return {
    enabled: safeOverride.enabled === undefined ? "inherited" : "overridden",
    feedbackTone:
      safeOverride.feedbackTone === undefined ? "inherited" : "overridden",
    minTokens:
      safeOverride.minTokens === undefined ? "inherited" : "overridden",
    maxTokens:
      safeOverride.maxTokens === undefined ? "inherited" : "overridden",
    softCapDaily:
      safeOverride.softCapDaily === undefined ? "inherited" : "overridden",
    softCapWeekly:
      safeOverride.softCapWeekly === undefined ? "inherited" : "overridden",
    features: AI_FEATURE_KEYS.reduce((acc, key) => {
      acc[key] =
        safeOverride.features?.[key] === undefined
          ? "inherited"
          : "overridden";
      return acc;
    }, {}),
  };
}

function extractLegacyTenantOverride(tenantDoc, platformDefaults) {
  if (!tenantDoc?.aiOverride && !tenantDoc?.ai) {
    return null;
  }

  if (tenantDoc?.aiOverride) {
    return normalizeAiSettings(tenantDoc.aiOverride, { partial: true });
  }

  if (!tenantDoc?.tenantId || !tenantDoc?.ai) {
    return null;
  }

  const legacyEffective = normalizeAiSettings(tenantDoc.ai);
  return buildAiOverride(platformDefaults, legacyEffective);
}

export async function resolveAiSettingsBundle({
  tenantId = null,
  createPlatformIfMissing = false,
} = {}) {
  let platformDoc = await TenantSettings.findOne({ tenantId: null }).lean();
  if (!platformDoc && createPlatformIfMissing) {
    platformDoc = await TenantSettings.findOneAndUpdate(
      { tenantId: null },
      { $setOnInsert: { ai: cloneDefaults() } },
      { upsert: true, new: true },
    ).lean();
  }

  const platformDefaults = normalizeAiSettings(platformDoc?.ai || {});
  const tenantDoc = tenantId
    ? await TenantSettings.findOne({ tenantId: String(tenantId) }).lean()
    : null;
  const override = tenantId
    ? extractLegacyTenantOverride(tenantDoc, platformDefaults)
    : null;
  const effective = tenantId
    ? mergeAiSettings(platformDefaults, override || {})
    : platformDefaults;

  return {
    tenantId: tenantId ? String(tenantId) : null,
    scope: tenantId ? "tenant" : "platform",
    platformDoc,
    tenantDoc,
    platformDefaults,
    override: override && !isEmptyOverride(override) ? override : null,
    effective,
    inheritance: buildAiInheritanceMap(override || {}),
    hasOverride: !!(override && !isEmptyOverride(override)),
  };
}

export async function savePlatformAiSettings(payload = {}) {
  const current = await resolveAiSettingsBundle({
    createPlatformIfMissing: true,
  });
  const requestedPatch = validateAiSettings(payload, { partial: true });
  const nextSettings = mergeAiSettings(current.platformDefaults, requestedPatch);
  const normalized = validateAiSettings(nextSettings);

  await TenantSettings.findOneAndUpdate(
    { tenantId: null },
    {
      $set: {
        ai: normalized,
      },
      $unset: {
        aiOverride: 1,
      },
    },
    { upsert: true, new: true },
  );

  return resolveAiSettingsBundle({
    createPlatformIfMissing: true,
  });
}

export async function saveTenantAiSettings({
  tenantId,
  payload = {},
} = {}) {
  const resolvedTenantId = String(tenantId || "").trim();
  if (!resolvedTenantId) {
    const error = new Error("tenantId is required for tenant-specific AI overrides");
    error.status = 400;
    throw error;
  }

  const bundle = await resolveAiSettingsBundle({
    tenantId: resolvedTenantId,
    createPlatformIfMissing: true,
  });

  const requestedOverride = payload?.override
    ? validateAiSettings(payload.override, { partial: true })
    : null;

  const nextEffective = requestedOverride
    ? mergeAiSettings(bundle.platformDefaults, requestedOverride)
    : mergeAiSettings(
        bundle.effective,
        validateAiSettings(payload, { partial: true }),
      );

  const normalizedEffective = validateAiSettings(nextEffective);
  const overrideToStore = buildAiOverride(
    bundle.platformDefaults,
    normalizedEffective,
  );

  if (!overrideToStore) {
    await TenantSettings.findOneAndUpdate(
      { tenantId: resolvedTenantId },
      {
        $setOnInsert: { tenantId: resolvedTenantId },
        $unset: {
          aiOverride: 1,
          ai: 1,
        },
      },
      { upsert: true, new: true },
    );
  } else {
    await TenantSettings.findOneAndUpdate(
      { tenantId: resolvedTenantId },
      {
        $set: {
          aiOverride: overrideToStore,
        },
        $setOnInsert: { tenantId: resolvedTenantId },
        $unset: {
          ai: 1,
        },
      },
      { upsert: true, new: true },
    );
  }

  return resolveAiSettingsBundle({
    tenantId: resolvedTenantId,
    createPlatformIfMissing: true,
  });
}

export async function resetTenantAiSettings(tenantId) {
  const resolvedTenantId = String(tenantId || "").trim();
  if (!resolvedTenantId) {
    const error = new Error("tenantId is required to reset tenant AI overrides");
    error.status = 400;
    throw error;
  }

  await TenantSettings.findOneAndUpdate(
    { tenantId: resolvedTenantId },
    {
      $setOnInsert: { tenantId: resolvedTenantId },
      $unset: {
        aiOverride: 1,
        ai: 1,
      },
    },
    { upsert: true, new: true },
  );

  return resolveAiSettingsBundle({
    tenantId: resolvedTenantId,
    createPlatformIfMissing: true,
  });
}

export function resolveAiFeatureSettingKey(routeFeature) {
  return AI_ROUTE_FEATURE_MAP[String(routeFeature || "").trim()] || null;
}

function makeAiAccessError(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

export function assertAiAccess(settings, routeFeature) {
  const effectiveSettings = normalizeAiSettings(settings);
  if (!effectiveSettings.enabled) {
    throw makeAiAccessError("AI is disabled for this tenant.");
  }

  const featureKey = resolveAiFeatureSettingKey(routeFeature);
  if (featureKey && effectiveSettings.features?.[featureKey] === false) {
    throw makeAiAccessError(
      `${AI_FEATURE_LABELS[featureKey] || "This AI capability"} is disabled for this tenant.`,
    );
  }

  return {
    featureKey,
    settings: effectiveSettings,
  };
}

export function buildAiPolicyHeaders(settings, routeFeature = "") {
  const effectiveSettings = normalizeAiSettings(settings);
  const featureKey = resolveAiFeatureSettingKey(routeFeature);

  return {
    "x-ai-enabled": String(Boolean(effectiveSettings.enabled)),
    "x-ai-feedback-tone": effectiveSettings.feedbackTone,
    "x-ai-min-tokens": String(Number(effectiveSettings.minTokens || 0)),
    "x-ai-max-tokens": String(Number(effectiveSettings.maxTokens || 0)),
    "x-ai-soft-cap-daily": String(Number(effectiveSettings.softCapDaily || 0)),
    "x-ai-soft-cap-weekly": String(Number(effectiveSettings.softCapWeekly || 0)),
    ...(featureKey
      ? {
          "x-ai-feature-key": featureKey,
          "x-ai-feature-enabled": String(
            effectiveSettings.features?.[featureKey] !== false,
          ),
        }
      : {}),
  };
}

export function applyAiTokenPolicy(payload, settings) {
  if (!isPlainObject(payload)) return payload;

  const nextPayload = { ...payload };
  const minTokens = Number(settings?.minTokens || 0);
  const maxTokens = Number(settings?.maxTokens || 0);
  const candidateKeys = [
    "max_tokens",
    "maxTokens",
    "max_output_tokens",
    "max_completion_tokens",
    "token_limit",
  ];

  for (const key of candidateKeys) {
    if (nextPayload[key] === undefined || nextPayload[key] === null || nextPayload[key] === "") {
      continue;
    }

    let value = toInteger(nextPayload[key], undefined, { min: 0, max: 1_000_000 });
    if (value === undefined) continue;

    if (maxTokens > 0 && value > maxTokens) {
      value = maxTokens;
    }
    if (minTokens > 0 && value < minTokens) {
      value = minTokens;
    }

    nextPayload[key] = value;
  }

  return nextPayload;
}
