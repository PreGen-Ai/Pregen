import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "../..");

const configuredEnvFile = process.env.BACKEND_ENV_FILE
  ? path.resolve(process.cwd(), process.env.BACKEND_ENV_FILE)
  : path.join(BACKEND_ROOT, ".env");

dotenv.config({ path: configuredEnvFile });

function cleanEnvValue(value) {
  if (value === undefined || value === null) return undefined;

  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function findEnvEntry(names) {
  for (const name of names) {
    const value = cleanEnvValue(process.env[name]);
    if (value !== undefined) {
      return { name, value };
    }
  }
  return null;
}

function requireEnv(names, fallback = undefined) {
  const list = Array.isArray(names) ? names : [names];
  const entry = findEnvEntry(list);
  if (entry?.value !== undefined) return entry.value;
  if (fallback !== undefined) return fallback;

  throw new Error(`Missing required environment variable: ${list.join(" or ")}`);
}

function readIntEnv(name, fallback) {
  const value = cleanEnvValue(process.env[name]);
  if (value === undefined) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid integer environment variable: ${name}`);
  }

  return parsed;
}

function readBooleanEnv(name, fallback = false) {
  const value = cleanEnvValue(process.env[name]);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function splitEnvList(value) {
  const cleaned = cleanEnvValue(value);
  if (cleaned === undefined) return [];

  return cleaned
    .split(/[,\n]/)
    .map((item) => cleanEnvValue(item))
    .filter(Boolean);
}

export function normalizeOrigin(value) {
  const cleaned = cleanEnvValue(value);
  if (!cleaned) return undefined;

  try {
    return new URL(cleaned).origin.toLowerCase();
  } catch {
    return cleaned.replace(/\/+$/, "").toLowerCase();
  }
}

function extractMongoTargets(uri) {
  if (!uri) return [];

  const authority = uri
    .replace(/^mongodb(?:\+srv)?:\/\//i, "")
    .replace(/^[^@]+@/, "")
    .split("/")[0]
    .split("?")[0];

  return authority
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function redactMongoUri(uri) {
  if (!uri) return "";

  return String(uri).replace(
    /(mongodb(?:\+srv)?:\/\/)([^@]+)@/i,
    "$1<credentials>@",
  );
}

export const ENV_FILE_PATH = configuredEnvFile;
export const ENV_FILE_FOUND = fs.existsSync(configuredEnvFile);

export const NODE_ENV = cleanEnvValue(process.env.NODE_ENV) || "development";
export const IS_PROD = NODE_ENV === "production";
export const IS_DEV = NODE_ENV === "development";
export const PORT = readIntEnv("PORT", 5000);

export const APP_NAME =
  cleanEnvValue(process.env.APP_NAME) || "PreGen Backend";
export const APP_BACKEND_URL =
  cleanEnvValue(process.env.APP_BACKEND_URL) ||
  (IS_PROD ? "https://pregen.onrender.com" : null);
export const CLIENT_URL = requireEnv(
  ["CLIENT_URL", "CORS_ORIGIN_2", "CORS_ORIGIN_1"],
  !IS_PROD ? "http://localhost:3000" : "https://pregen.netlify.app",
);

export const CORS_ALLOWED_ORIGINS = [
  ...new Set(
    [CLIENT_URL]
      .concat([
        cleanEnvValue(process.env.CORS_ORIGIN_1),
        cleanEnvValue(process.env.CORS_ORIGIN_2),
        APP_BACKEND_URL,
      ])
      .concat(splitEnvList(process.env.CORS_ORIGIN))
      .concat(splitEnvList(process.env.CORS_ALLOWED_ORIGINS))
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
  ),
];

export const JWT_SECRET = requireEnv("JWT_SECRET");
const sessionSecretEntry = findEnvEntry(["SESSION_SECRET", "JWT_SECRET"]);
export const SESSION_SECRET_SOURCE = sessionSecretEntry?.name || null;
export const SESSION_SECRET = requireEnv(
  ["SESSION_SECRET", "JWT_SECRET"],
  sessionSecretEntry?.value,
);
export const REFRESH_TOKEN_EXPIRES_IN =
  cleanEnvValue(process.env.REFRESH_TOKEN_EXPIRES_IN) || "30d";

const primaryMongoEntry = findEnvEntry(["MONGO_URL", "MONGO_URI", "MONGODB_URI"]);
const localMongoEntry = findEnvEntry(["MONGO_LOCAL_URL", "LOCAL_MONGO_URL"]);

export const MONGO_USE_LOCAL_FALLBACK =
  !IS_PROD && readBooleanEnv("MONGO_USE_LOCAL_FALLBACK", false);

const activeMongoEntry = MONGO_USE_LOCAL_FALLBACK
  ? localMongoEntry
  : primaryMongoEntry;

export const MONGO_URI_SOURCE = activeMongoEntry?.name || null;
export const MONGO_URI = requireEnv(
  MONGO_USE_LOCAL_FALLBACK
    ? ["MONGO_LOCAL_URL", "LOCAL_MONGO_URL"]
    : ["MONGO_URL", "MONGO_URI", "MONGODB_URI"],
  activeMongoEntry?.value,
);

export const MONGO_DB_NAME = cleanEnvValue(process.env.MONGO_DB_NAME);
export const MONGO_CONNECT_TIMEOUT_MS = readIntEnv(
  "MONGO_CONNECT_TIMEOUT_MS",
  10000,
);
export const MONGO_SERVER_SELECTION_TIMEOUT_MS = readIntEnv(
  "MONGO_SERVER_SELECTION_TIMEOUT_MS",
  10000,
);
export const MONGO_SOCKET_TIMEOUT_MS = readIntEnv(
  "MONGO_SOCKET_TIMEOUT_MS",
  20000,
);
export const MONGO_RETRY_ATTEMPTS = readIntEnv("MONGO_RETRY_ATTEMPTS", 1);
export const MONGO_RETRY_DELAY_MS = readIntEnv("MONGO_RETRY_DELAY_MS", 1500);

export const REDIS_URL = cleanEnvValue(process.env.REDIS_URL) || null;

const openAiKeyEntry = findEnvEntry(["OPENAI_API_KEY", "OPENAI_KEY", "openai-key"]);
export const OPENAI_API_KEY = openAiKeyEntry?.value || null;
export const OPENAI_API_KEY_SOURCE = openAiKeyEntry?.name || null;
export const OPENAI_MODEL =
  cleanEnvValue(process.env.OPENAI_MODEL) || "gpt-5.4-mini";
const geminiKeyEntry = findEnvEntry(["GEMINI_API_KEY"]);
export const GEMINI_API_KEY = geminiKeyEntry?.value || null;
export const GEMINI_API_KEY_SOURCE = geminiKeyEntry?.name || null;
export const PRIMARY_LLM_PROVIDER =
  cleanEnvValue(process.env.PRIMARY_LLM_PROVIDER) ||
  cleanEnvValue(process.env.AI_PRIMARY_PROVIDER) ||
  "openai";
export const FALLBACK_LLM_PROVIDER =
  cleanEnvValue(process.env.FALLBACK_LLM_PROVIDER) ||
  cleanEnvValue(process.env.AI_FALLBACK_PROVIDER) ||
  "gemini";
const aiServiceEntry = findEnvEntry([
  "AI_SERVICE_URL",
  "FASTAPI_SERVICE_URL",
  "FASTAPI_BASE_URL",
]);
export const AI_SERVICE_URL_SOURCE =
  aiServiceEntry?.name || (IS_PROD ? "default-production" : "default-development");
export const AI_SERVICE_URL =
  aiServiceEntry?.value ||
  (IS_PROD ? "https://pregen-xce4.onrender.com" : "http://localhost:8000");
const aiSharedSecretEntry = findEnvEntry([
  "AI_SERVICE_SHARED_SECRET",
  "FASTAPI_INTERNAL_API_KEY",
  "INTERNAL_API_SECRET",
]);
export const AI_SERVICE_SHARED_SECRET =
  aiSharedSecretEntry?.value ||
  (!IS_PROD ? "dev-ai-service-secret" : undefined);

export function getRuntimeConfigWarnings() {
  const warnings = [];
  const normalizedClientOrigin = normalizeOrigin(CLIENT_URL);
  const normalizedAiServiceOrigin = normalizeOrigin(AI_SERVICE_URL);

  if (SESSION_SECRET_SOURCE !== "SESSION_SECRET") {
    warnings.push(
      "SESSION_SECRET is not set. Express sessions will fall back to JWT_SECRET; set a dedicated SESSION_SECRET for deployed environments.",
    );
  }

  if (IS_PROD && normalizedClientOrigin?.includes("localhost")) {
    warnings.push(
      "CLIENT_URL points to localhost in production. Set it to the deployed frontend origin.",
    );
  }

  if (IS_PROD && normalizedAiServiceOrigin?.includes("localhost")) {
    warnings.push(
      "AI_SERVICE_URL points to localhost in production. Set it to the deployed AI service origin.",
    );
  }

  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    warnings.push(
      "No local AI provider key is configured. Ensure the FastAPI AI service has OPENAI_API_KEY or GEMINI_API_KEY, and check /health for provider diagnostics.",
    );
  }

  if (!CORS_ALLOWED_ORIGINS.length) {
    warnings.push(
      "No CORS origins are configured. At minimum, set CLIENT_URL to the deployed frontend origin.",
    );
  }

  return warnings;
}

export function getAiProviderConfigSummary() {
  const primary = String(PRIMARY_LLM_PROVIDER || "openai").toLowerCase();
  const fallback = String(FALLBACK_LLM_PROVIDER || "gemini").toLowerCase();
  const keyPresence = {
    openai: Boolean(OPENAI_API_KEY),
    gemini: Boolean(GEMINI_API_KEY),
  };
  const activeProvider = keyPresence[primary]
    ? primary
    : keyPresence[fallback]
      ? fallback
      : "none";

  return {
    primaryProvider: primary,
    fallbackProvider: fallback === primary ? "none" : fallback,
    activeProvider,
    fallbackReason:
      activeProvider === fallback && primary !== fallback
        ? "primary_key_missing"
        : null,
    openai: {
      keyPresent: Boolean(OPENAI_API_KEY),
      keySource: OPENAI_API_KEY_SOURCE || "(not configured)",
      model: OPENAI_MODEL,
    },
    gemini: {
      keyPresent: Boolean(GEMINI_API_KEY),
      keySource: GEMINI_API_KEY_SOURCE || "(not configured)",
    },
  };
}

export function getMongoConfigSummary() {
  const uri = MONGO_URI || "";
  return {
    envFile: ENV_FILE_FOUND
      ? path.relative(BACKEND_ROOT, ENV_FILE_PATH) || ".env"
      : path.relative(BACKEND_ROOT, ENV_FILE_PATH) || configuredEnvFile,
    source: MONGO_URI_SOURCE || "(not configured)",
    mode: MONGO_USE_LOCAL_FALLBACK ? "local-fallback" : "primary",
    scheme: uri.startsWith("mongodb+srv://") ? "srv" : "direct",
    dbName: MONGO_DB_NAME || "(driver default)",
    targets: extractMongoTargets(uri),
    timeouts: {
      connectMs: MONGO_CONNECT_TIMEOUT_MS,
      serverSelectionMs: MONGO_SERVER_SELECTION_TIMEOUT_MS,
      socketMs: MONGO_SOCKET_TIMEOUT_MS,
    },
    retryAttempts: MONGO_RETRY_ATTEMPTS,
  };
}

export function getRuntimeConfigSummary() {
  return {
    envFile: ENV_FILE_FOUND
      ? path.relative(BACKEND_ROOT, ENV_FILE_PATH) || ".env"
      : path.relative(BACKEND_ROOT, ENV_FILE_PATH) || configuredEnvFile,
    nodeEnv: NODE_ENV,
    port: PORT,
    clientOrigin: normalizeOrigin(CLIENT_URL),
    appBackendUrl: normalizeOrigin(APP_BACKEND_URL),
    corsOrigins: CORS_ALLOWED_ORIGINS,
    sessionSecretSource: SESSION_SECRET_SOURCE || "(not configured)",
    aiServiceUrl: AI_SERVICE_URL,
    aiServiceSource: AI_SERVICE_URL_SOURCE,
    aiProviders: getAiProviderConfigSummary(),
    redisEnabled: Boolean(REDIS_URL),
    warnings: getRuntimeConfigWarnings(),
  };
}
