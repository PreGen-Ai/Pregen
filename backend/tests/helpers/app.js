// tests/helpers/app.js
// Builds the Express app without calling app.listen() so supertest can use it.
// We re-export server.js default but patch out the start() call.
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import helmet from "helmet";

// Routes
import userRoutes from "../../src/routes/userroutes.js";
import teacherRoutes from "../../src/routes/teacherRoutes.js";
import studentRoutes from "../../src/routes/studentRoutes.js";
import quizRoutes from "../../src/routes/quizRoutes.js";
import courseRoutes from "../../src/routes/courseRoutes.js";
import documentRoutes from "../../src/routes/documentRoutes.js";
import lessonsRoutes from "../../src/routes/lessonsRoutes.js";
import announcementsRoutes from "../../src/routes/announcementsRoutes.js";
import gradebookRoutes from "../../src/routes/gradebookRoutes.js";
import analyticRoutes from "../../src/routes/analyticRoutes.js";
import aiUsageRoutes from "../../src/routes/aiUsage.routes.js";
import aiRoutes from "../../src/routes/ai.routes.js";
import adminRouter from "../../src/routes/admin/index.js";
import { adminSystemRouter } from "../../src/routes/adminRoutes.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id", "x-user-id"],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "test_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false },
  })
);

// Routes
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

app.use("/api/admin/super", (req, res) =>
  res.redirect(307, `/api/admin/system/super${req.url}`)
);
app.use("/api/admin/system", adminSystemRouter);
app.use("/api/admin", adminRouter);

app.get("/", (_, res) => res.send("PreGen Test API"));
app.get("/api/health", (_, res) =>
  res.json({ ok: true, environment: "test", timestamp: new Date().toISOString() })
);

app.use((req, res) => res.status(404).json({ error: "Not Found", path: req.originalUrl }));
app.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

export default app;
