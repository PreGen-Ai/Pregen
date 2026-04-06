// backend/src/env.js
import dotenv from "dotenv";

dotenv.config();

/**
 * Helper to require env vars
 */
function requireEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = parseInt(process.env.PORT || "5000", 10);

// App
export const APP_NAME = process.env.APP_NAME || "PreGen Backend";
export const CLIENT_URL = requireEnv("CLIENT_URL");

// Auth
export const JWT_SECRET = requireEnv("JWT_SECRET");
export const REFRESH_TOKEN_EXPIRES_IN =
  process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

// Database
export const MONGO_URI = requireEnv("MONGO_URL");
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME ;

// Redis
export const REDIS_URL = process.env.REDIS_URL || null;

// AI
export const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");

// Flags
export const IS_PROD = NODE_ENV === "production";
export const IS_DEV = NODE_ENV === "development";
