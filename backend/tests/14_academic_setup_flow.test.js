import request from "supertest";
import app from "./helpers/app.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearAllCollections,
} from "./helpers/db.js";
import {
  createAdmin,
  createTeacher,
  createStudent,
  authHeader,
} from "./helpers/factory.js";
import Course from "../src/models/CourseModel.js";
import CourseMember from "../src/models/CourseMember.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Academic setup flow", () => {
  test("subject-to-class assignment provisions a workspace and memberships", async () => {
    const tenantId = "tenant_test";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher, token: teacherToken } = await createTeacher({
      tenantId,
      tenantIds: [tenantId],
    });
    const { user: student, token: studentToken } = await createStudent({
      tenantId,
    });

    const classRes = await request(app)
      .post("/api/admin/classes")
      .set(authHeader(adminToken))
      .send({
        name: "Grade 10A",
        grade: "10",
        section: "A",
      });

    expect(classRes.status).toBe(201);
    const classId = classRes.body?.class?._id;
    expect(classId).toBeTruthy();

    const assignTeacherRes = await request(app)
      .post(`/api/admin/classes/${classId}/assign-teacher`)
      .set(authHeader(adminToken))
      .send({ teacherId: teacher._id });
    expect(assignTeacherRes.status).toBe(200);

    const enrollRes = await request(app)
      .post(`/api/admin/classes/${classId}/enroll`)
      .set(authHeader(adminToken))
      .send({ studentIds: [student._id] });
    expect(enrollRes.status).toBe(200);

    const subjectRes = await request(app)
      .post("/api/admin/subjects")
      .set(authHeader(adminToken))
      .send({
        name: "Biology",
        code: "BIO",
        teacherIds: [teacher._id],
        classroomIds: [classId],
      });

    expect(subjectRes.status).toBe(201);

    const workspace = await Course.findOne({
      tenantId,
      subjectId: subjectRes.body?.subject?._id || subjectRes.body?.subject?.id,
      classroomId: classId,
      deleted: false,
    }).lean();

    expect(workspace).toBeTruthy();
    expect(workspace.title).toContain("Biology");

    const memberships = await CourseMember.find({
      courseId: workspace._id,
      status: "active",
    }).lean();

    expect(
      memberships.some(
        (row) =>
          String(row.userId) === String(teacher._id) && row.role === "teacher",
      ),
    ).toBe(true);
    expect(
      memberships.some(
        (row) =>
          String(row.userId) === String(student._id) && row.role === "student",
      ),
    ).toBe(true);

    const teacherCoursesRes = await request(app)
      .get("/api/courses")
      .set(authHeader(teacherToken));
    expect(teacherCoursesRes.status).toBe(200);
    expect(
      (teacherCoursesRes.body?.courses || []).some(
        (course) => String(course._id) === String(workspace._id),
      ),
    ).toBe(true);

    const studentCoursesRes = await request(app)
      .get("/api/courses")
      .set(authHeader(studentToken));
    expect(studentCoursesRes.status).toBe(200);
    expect(
      (studentCoursesRes.body?.courses || []).some(
        (course) => String(course._id) === String(workspace._id),
      ),
    ).toBe(true);
  });
});
