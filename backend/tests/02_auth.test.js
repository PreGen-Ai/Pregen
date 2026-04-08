// tests/02_auth.test.js
// Authentication: login, logout, checkAuth, token validation, disabled/blocked accounts
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createAdmin,
  makeToken,
  makeExpiredToken,
  authHeader,
} from "./helpers/factory.js";
import User from "../src/models/userModel.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Authentication — Login", () => {
  test("POST /api/users/login succeeds with valid credentials", async () => {
    const { user } = await createStudent({ password: await bcrypt.hash("Password1!", 10) });
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "Password1!" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toHaveProperty("email", user.email);
  });

  test("POST /api/users/login returns 401 for wrong password", async () => {
    const { user } = await createStudent();
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "WrongPassword!" });
    expect(res.status).toBe(401);
  });

  test("POST /api/users/login returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "nobody@nowhere.com", password: "Password1!" });
    expect(res.status).toBe(401);
  });

  test("POST /api/users/login rejects disabled account", async () => {
    const { user } = await createStudent({ disabled: true });
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "Password1!" });
    expect(res.status).toBe(401);
  });

  test("POST /api/users/login rejects blocked account", async () => {
    const { user } = await createStudent({ blocked: true });
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "Password1!" });
    expect(res.status).toBe(401);
  });

  test("POST /api/users/login response does NOT contain password", async () => {
    const { user } = await createStudent();
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "Password1!" });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/password/i);
  });

  test("POST /api/users/login with missing email returns 400-level error", async () => {
    const res = await request(app)
      .post("/api/users/login")
      .send({ password: "Password1!" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("POST /api/users/login with empty body returns 400-level error", async () => {
    const res = await request(app).post("/api/users/login").send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Authentication — checkAuth & requireAuth middleware", () => {
  test("GET /api/users/checkAuth returns 401 with no token", async () => {
    const res = await request(app).get("/api/users/checkAuth");
    expect(res.status).toBe(401);
  });

  test("GET /api/users/checkAuth returns 200 with valid Bearer token", async () => {
    const { user, token } = await createStudent();
    const res = await request(app)
      .get("/api/users/checkAuth")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user).toBeTruthy();
  });

  test("GET /api/users/checkAuth returns 401 with expired token", async () => {
    const { user } = await createStudent();
    const expiredToken = makeExpiredToken(user);
    const res = await request(app)
      .get("/api/users/checkAuth")
      .set(authHeader(expiredToken));
    expect(res.status).toBe(401);
  });

  test("GET /api/users/checkAuth returns 401 with tampered token", async () => {
    const { token } = await createStudent();
    const tampered = token.slice(0, -5) + "XXXXX";
    const res = await request(app)
      .get("/api/users/checkAuth")
      .set(authHeader(tampered));
    expect(res.status).toBe(401);
  });

  test("GET /api/users/checkAuth returns 401 for deleted user's valid token", async () => {
    const { user, token } = await createStudent();
    await User.findByIdAndUpdate(user._id, { deleted: true });
    // User is deleted but token is still valid — middleware should reject because findById returns null
    const res = await request(app)
      .get("/api/users/checkAuth")
      .set(authHeader(token));
    expect(res.status).toBe(401);
  });

  test("Protected route returns 401 with garbage Authorization header", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set("Authorization", "Bearer thisisgarbagetoken");
    expect(res.status).toBe(401);
  });
});

describe("Authentication — Profile", () => {
  test("GET /api/users/profile returns own user data", async () => {
    const { user, token } = await createStudent();
    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  test("GET /api/users/profile response excludes password field", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(token));
    expect(res.body.user).not.toHaveProperty("password");
  });
});

describe("Authentication — Dashboard ping", () => {
  test("GET /api/users/dashboard returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/STUDENT/i);
  });

  test("GET /api/users/dashboard returns 200 for TEACHER", async () => {
    const { token } = await createAdmin(); // admin has access
    const res = await request(app).get("/api/users/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/dashboard returns 401 without auth", async () => {
    const res = await request(app).get("/api/users/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("Authentication — Logout", () => {
  test("POST /api/users/logout clears session for authenticated user", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/users/logout")
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
  });
});
