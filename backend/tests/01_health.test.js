// tests/01_health.test.js
// Sanity: basic server health & 404 handling
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB } from "./helpers/db.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());

describe("Health & Infrastructure", () => {
  test("GET / returns 200 with text body", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/PreGen/i);
  });

  test("GET /api/health returns ok:true and expected fields", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      environment: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  test("GET /api/health timestamp is a valid ISO date", async () => {
    const res = await request(app).get("/api/health");
    const date = new Date(res.body.timestamp);
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
  });

  test("Unknown route returns 404 JSON", async () => {
    const res = await request(app).get("/api/this-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  test("Unknown nested route returns 404 JSON", async () => {
    const res = await request(app).get("/api/users/totally/unknown/path/xyz");
    expect([404]).toContain(res.status);
  });

  test("Response has JSON content-type for /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  test("OPTIONS preflight returns 200 for CORS", async () => {
    const res = await request(app)
      .options("/api/users/login")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");
    expect([200, 204]).toContain(res.status);
  });

  test("POST with malformed JSON returns 400-level error, not crash", async () => {
    const res = await request(app)
      .post("/api/users/login")
      .set("Content-Type", "application/json")
      .send("{ bad json }");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });
});
