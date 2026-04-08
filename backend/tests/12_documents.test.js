// tests/12_documents.test.js
// Documents: upload, search, course listing, soft delete, restore, hard delete
import request from "supertest";
import path from "path";
import fs from "fs";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createCourse,
  authHeader,
} from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

// Create a tiny text file buffer for upload tests
const SAMPLE_FILE_CONTENT = Buffer.from("Sample document content for testing");
const SAMPLE_FILENAME = "test_document.txt";

describe("Documents — Search & List", () => {
  test("GET /api/documents/search STUDENT returns 200", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .get("/api/documents/search?q=math")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/documents/search TEACHER returns 200", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .get("/api/documents/search")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/documents/search without auth returns 401", async () => {
    const res = await request(app).get("/api/documents/search");
    expect(res.status).toBe(401);
  });

  test("GET /api/documents/course/:courseId STUDENT returns 200", async () => {
    const { user: admin } = await createAdmin();
    const { token: studentToken } = await createStudent();
    const course = await createCourse(admin);
    const res = await request(app)
      .get(`/api/documents/course/${course._id}`)
      .set(authHeader(studentToken));
    expect(res.status).toBe(200);
  });
});

describe("Documents — Upload", () => {
  test("POST /api/documents/upload TEACHER can upload (mocked file)", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .post("/api/documents/upload")
      .set(authHeader(token))
      .attach("document", SAMPLE_FILE_CONTENT, {
        filename: SAMPLE_FILENAME,
        contentType: "text/plain",
      })
      .field("tenantId", "tenant_test")
      .field("name", "Test Document");
    // May succeed (201) or fail due to Cloudinary not configured (503/500)
    // But should NOT be 403 or 401
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("POST /api/documents/upload STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/documents/upload")
      .set(authHeader(token))
      .attach("document", SAMPLE_FILE_CONTENT, {
        filename: SAMPLE_FILENAME,
        contentType: "text/plain",
      });
    expect(res.status).toBe(403);
  });

  test("POST /api/documents/upload without auth returns 401", async () => {
    const res = await request(app)
      .post("/api/documents/upload")
      .attach("document", SAMPLE_FILE_CONTENT, {
        filename: SAMPLE_FILENAME,
        contentType: "text/plain",
      });
    expect(res.status).toBe(401);
  });
});

describe("Documents — Soft Delete & Restore (Role gates)", () => {
  const fakeDocId = "64aaaaaaaaaaaaaaaaaaaa20";

  test("PUT /api/documents/:id/soft-delete TEACHER auth passes (not 403)", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .put(`/api/documents/${fakeDocId}/soft-delete`)
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("PUT /api/documents/:id/soft-delete STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .put(`/api/documents/${fakeDocId}/soft-delete`)
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("PUT /api/documents/:id/restore TEACHER auth passes (not 403)", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .put(`/api/documents/${fakeDocId}/restore`)
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("DELETE /api/documents/:id/permanent-delete requires ADMIN", async () => {
    const { token: teacherToken } = await createTeacher();
    const res = await request(app)
      .delete(`/api/documents/${fakeDocId}/permanent-delete`)
      .set(authHeader(teacherToken));
    expect(res.status).toBe(403);
  });

  test("DELETE /api/documents/:id/permanent-delete ADMIN auth passes (not 403)", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .delete(`/api/documents/${fakeDocId}/permanent-delete`)
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });
});

describe("Documents — Bulk Operations (Admin only)", () => {
  test("PUT /api/documents/bulk-restore TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .put("/api/documents/bulk-restore")
      .set(authHeader(token))
      .send({ ids: ["64aaaaaaaaaaaaaaaaaaaa21"] });
    expect(res.status).toBe(403);
  });

  test("PUT /api/documents/bulk-restore ADMIN auth passes (not 403)", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .put("/api/documents/bulk-restore")
      .set(authHeader(token))
      .send({ ids: ["64aaaaaaaaaaaaaaaaaaaa21"] });
    expect(res.status).not.toBe(403);
  });

  test("DELETE /api/documents/bulk-delete STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .delete("/api/documents/bulk-delete")
      .set(authHeader(token))
      .send({ ids: ["64aaaaaaaaaaaaaaaaaaaa22"] });
    expect(res.status).toBe(403);
  });
});
