// backend/src/server.js
import express from "express";
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
  NODE_ENV,
  IS_PROD,
  MONGO_URI,
  MONGO_DB_NAME,
  JWT_SECRET,
} from "../src/config/env.js";
import { connectMongo } from "./config/mongo.js";
import { connectRedis } from "./config/redis.js";

// Routes
import userRoutes from "./routes/userroutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import analyticRoutes from "./routes/analyticRoutes.js";
import aiUsageRoutes from "./routes/aiUsage.routes.js";

// Admin
import adminRouter from "./routes/admin/index.js"; // /api/admin/*
import { adminSystemRouter } from "./routes/adminRoutes.js"; // /api/admin/system/*

// Cron jobs
import "./cron/cleanupCron.js";

// Path setup (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

/**
 * ---------- Security & logging ----------
 */
app.use(helmet());
app.use(morgan(IS_PROD ? "combined" : "dev"));

/**
 * ---------- CORS allowlist ----------
 */
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://preprod-pregen.netlify.app",
  "https://pregen.netlify.app",
  CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
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
app.use("/uploads", express.static(uploadsDir));

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
    console.error("Session store error:", err?.message || err);
  });
} catch (e) {
  console.error("Session store init failed:", e?.message || e);
  sessionStore = null;
}

app.use(
  session({
    secret: JWT_SECRET,
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

app.use("/api/courses", courseRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/analytics", analyticRoutes);
app.use("/api/ai-usage", aiUsageRoutes);

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

    app.listen(PORT, () => {
      console.log("PreGen Backend running");
      console.log(`Port: ${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`Client: ${CLIENT_URL}`);
    });
  } catch (e) {
    console.error("❌ Startup failed:", e?.message || e);
    process.exit(1);
  }
}

start();

export default app;
