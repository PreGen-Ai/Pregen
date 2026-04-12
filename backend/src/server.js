// backend/src/server.js
import express from "express";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import session from "express-session";
import connectMongoDBSession from "connect-mongodb-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

// Env & DB
import {
  PORT,
  CLIENT_URL,
  APP_BACKEND_URL,
  CORS_ALLOWED_ORIGINS,
  NODE_ENV,
  IS_PROD,
  MONGO_URI,
  MONGO_DB_NAME,
  SESSION_SECRET,
  getMongoConfigSummary,
  getRuntimeConfigSummary,
  normalizeOrigin,
} from "../src/config/env.js";
import { connectMongo } from "./config/mongo.js";
import { connectRedis } from "./config/redis.js";
import { initSocketServer } from "./socket/index.js";

// Routes
import userRoutes from "./routes/userroutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import lessonsRoutes from "./routes/lessonsRoutes.js";
import announcementsRoutes from "./routes/announcementsRoutes.js";
import gradebookRoutes from "./routes/gradebookRoutes.js";
import analyticRoutes from "./routes/analyticRoutes.js";
import aiUsageRoutes from "./routes/aiUsage.routes.js";
import aiRoutes from "./routes/ai.routes.js";

// Admin
import adminRouter from "./routes/admin/index.js"; // /api/admin/*
import { adminSystemRouter } from "./routes/adminRoutes.js"; // /api/admin/system/*

// Cron jobs
import "./cron/cleanupCron.js";
import "./cron/aiServiceKeepalive.js";

// Path setup (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

const mongoConfigSummary = getMongoConfigSummary();
const runtimeConfigSummary = getRuntimeConfigSummary();
console.log(
  `[startup] env=${mongoConfigSummary.envFile} mongoSource=${mongoConfigSummary.source} mongoMode=${mongoConfigSummary.mode} mongoScheme=${mongoConfigSummary.scheme}`,
);
console.log(
  `[startup] mongoTargets=${mongoConfigSummary.targets.join(", ") || "(none)"} mongoDb=${mongoConfigSummary.dbName}`,
);
console.log(
  `[startup] runtime client=${runtimeConfigSummary.clientOrigin} aiService=${runtimeConfigSummary.aiServiceUrl} redis=${runtimeConfigSummary.redisEnabled ? "enabled" : "disabled"} sessionSecret=${runtimeConfigSummary.sessionSecretSource}`,
);
for (const warning of runtimeConfigSummary.warnings) {
  console.warn(`[startup] warning: ${warning}`);
}

/**
 * ---------- Security & logging ----------
 */
app.use(helmet());
app.use(morgan(IS_PROD ? "combined" : "dev"));

/**
 * ---------- CORS allowlist ----------
 */
const allowedOrigins = [
  // Optional local development origins.
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "https://preprod-pregen.netlify.app",
  "https://pregen.netlify.app",
  APP_BACKEND_URL,
  CLIENT_URL,
  ...CORS_ALLOWED_ORIGINS,
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOriginSet = new Set(allowedOrigins);

console.log(
  `[startup] corsAllowedOrigins=${Array.from(allowedOriginSet).join(", ")}`,
);

const corsOptions = {
  origin: (origin, cb) => {
    const normalizedOrigin = normalizeOrigin(origin);

    if (!normalizedOrigin) return cb(null, true);
    if (allowedOriginSet.has(normalizedOrigin)) return cb(null, true);

    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "x-request-id",
    "Accept",
    "X-Requested-With",
    "x-tenant-id",
  ],
  exposedHeaders: ["Content-Disposition", "Content-Type"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

const httpServer = createServer(app);
const io = initSocketServer(httpServer, { corsOptions });

/**
 * ---------- Rate limiting ----------
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

/**
 * ---------- Body parsing ----------
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/**
 * ---------- Uploads folder + Multer ----------
 */
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, "uploads/"),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const upload = multer({ storage });
// Allow cross-origin embedding of uploaded assets (images, logos).
// Helmet sets Cross-Origin-Resource-Policy: same-origin globally; override
// it here so the Netlify frontend can load images hosted on Render.
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadsDir),
);

/**
 * ---------- Session store (Mongo-backed) ----------
 */
const MongoDBStore = connectMongoDBSession(session);

let sessionStore = null;
try {
  sessionStore = new MongoDBStore({
    uri: MONGO_URI,
    databaseName: MONGO_DB_NAME,
    collection: "sessions",
  });

  sessionStore.on("error", (err) => {
    console.error("[session] store error:", err?.message || err);
  });
} catch (e) {
  console.error("[session] store init failed:", e?.message || e);
  sessionStore = null;
}

app.use(
  session({
    secret: SESSION_SECRET,
    name: "pregen.sid",
    resave: false,
    saveUninitialized: false,
    store: sessionStore || undefined,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "None" : "Lax",
    },
  }),
);

/**
 * ---------- Routes ----------
 */
app.use("/api/users", userRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/quizzes", quizRoutes);

app.use("/api/courses", courseRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/lessons", lessonsRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/gradebook", gradebookRoutes);
app.use("/api/analytics", analyticRoutes);
app.use("/api/ai-usage", aiUsageRoutes);
app.use("/api/ai", aiRoutes);

/**
 * Admin routes
 * Order matters
 */
app.use("/api/admin/super", (req, res) => {
  return res.redirect(307, `/api/admin/system/super${req.url}`);
});

app.use("/api/admin/system", adminSystemRouter);
app.use("/api/admin", adminRouter);

/**
 * ---------- Root & health ----------
 */
app.get("/", (_, res) => res.send("PreGen Backend API is live"));

app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    environment: NODE_ENV,
    client: CLIENT_URL,
    mongoDbName: MONGO_DB_NAME,
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  const status = err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : "Request Error",
    message: NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

async function start() {
  try {
    await connectMongo();
    await connectRedis();

    httpServer.listen(PORT, () => {
      console.log("PreGen Backend running");
      console.log(`Port: ${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`Client: ${CLIENT_URL}`);
      console.log(
        `[startup] realtime transports=websocket,polling backend=${APP_BACKEND_URL || "(not set)"}`,
      );
    });
  } catch (e) {
    console.error("[startup] failed:", e?.message || e);
    if (Array.isArray(e?.mongoHints)) {
      for (const hint of e.mongoHints) {
        console.error(`[startup] mongo hint: ${hint}`);
      }
    }
    if (e?.mongoConfig) {
      console.error(
        `[startup] mongo summary: env=${e.mongoConfig.envFile} source=${e.mongoConfig.source} mode=${e.mongoConfig.mode} scheme=${e.mongoConfig.scheme}`,
      );
      console.error(
        `[startup] mongo targets: ${e.mongoConfig.targets.join(", ") || "(none)"}`,
      );
    }
    process.exit(1);
  }
}

start();

export default app;
export { httpServer, io };
