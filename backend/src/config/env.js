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
export const PORT = Number.parseInt(
  cleanEnvValue(process.env.PORT) || "5000",
  10,
);

export const APP_NAME =
  cleanEnvValue(process.env.APP_NAME) || "PreGen Backend";
export const CLIENT_URL = requireEnv(
  "CLIENT_URL",
  !IS_PROD ? "http://localhost:3000" : undefined,
);

export const CORS_ALLOWED_ORIGINS = [
  ...new Set(
    [CLIENT_URL]
      .concat(splitEnvList(process.env.CORS_ORIGIN))
      .concat(splitEnvList(process.env.CORS_ALLOWED_ORIGINS))
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
  ),
];

export const JWT_SECRET = requireEnv("JWT_SECRET");
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

export const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
export const AI_SERVICE_URL =
  cleanEnvValue(process.env.AI_SERVICE_URL) ||
  cleanEnvValue(process.env.FASTAPI_SERVICE_URL) ||
  cleanEnvValue(process.env.FASTAPI_BASE_URL) ||
  (IS_PROD ? "https://pregen.onrender.com" : "http://localhost:8000");

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
