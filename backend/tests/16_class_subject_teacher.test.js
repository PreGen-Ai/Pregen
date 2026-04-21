// tests/16_class_subject_teacher.test.js
// End-to-end tests for the class / subject / teacher assignment flow.
//
// Coverage:
//   ✓ listClasses returns enriched teacher + students + subjects arrays
//   ✓ createClass with teacherId inline assigns teacher and syncs CourseMember
//   ✓ assignTeacher sets Classroom.teacherId and syncs CourseMember records
//   ✓ assignTeacher rejects a teacher from a different tenant (tenant scope fix)
//   ✓ assignTeacher rejects a non-TEACHER user
//   ✓ enrollStudents adds students and syncs CourseMember records
//   ✓ unenrollStudents removes students and marks CourseMember removed
//   ✓ Creating a subject with classroomIds provisions a Course workspace
//   ✓ After subject→class assignment, teacher sees the workspace in /api/courses
//   ✓ After student enrollment, student sees the workspace in /api/courses

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
import Classroom from "../src/models/Classroom.js";
import Subject from "../src/models/Subject.js";
import Course from "../src/models/CourseModel.js";
import CourseMember from "../src/models/CourseMember.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** POST /api/admin/classes — returns { status, body } */
async function adminCreateClass(adminToken, payload) {
  return request(app)
    .post("/api/admin/classes")
    .set(authHeader(adminToken))
    .send(payload);
}

/** POST /api/admin/classes/:id/assign-teacher */
async function adminAssignTeacher(adminToken, classId, teacherId) {
  return request(app)
    .post(`/api/admin/classes/${classId}/assign-teacher`)
    .set(authHeader(adminToken))
    .send({ teacherId });
}

/** POST /api/admin/classes/:id/enroll */
async function adminEnroll(adminToken, classId, studentIds) {
  return request(app)
    .post(`/api/admin/classes/${classId}/enroll`)
    .set(authHeader(adminToken))
    .send({ studentIds });
}

/** DELETE /api/admin/classes/:id/unenroll */
async function adminUnenroll(adminToken, classId, studentIds) {
  return request(app)
    .delete(`/api/admin/classes/${classId}/unenroll`)
    .set(authHeader(adminToken))
    .send({ studentIds });
}

/** POST /api/admin/subjects */
async function adminCreateSubject(adminToken, payload) {
  return request(app)
    .post("/api/admin/subjects")
    .set(authHeader(adminToken))
    .send(payload);
}

/** GET /api/admin/classes */
async function adminListClasses(adminToken) {
  return request(app)
    .get("/api/admin/classes")
    .set(authHeader(adminToken));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("listClasses — enriched response", () => {
  test("returns teacher object on each class item", async () => {
    const tenantId = "tenant_cls";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    // Create class then assign teacher
    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    expect(cr.status).toBe(201);
    const classId = cr.body?.class?._id;

    await adminAssignTeacher(adminToken, classId, teacher._id);

    const listRes = await adminListClasses(adminToken);
    expect(listRes.status).toBe(200);

    const cls = (listRes.body?.items || []).find((c) => String(c._id) === String(classId));
    expect(cls).toBeTruthy();
    expect(cls.teacher).toBeTruthy();
    expect(String(cls.teacher._id)).toBe(String(teacher._id));
    expect(cls.teacher.email).toBe(teacher.email);
  });

  test("returns students array (not raw ObjectId array)", async () => {
    const tenantId = "tenant_cls";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7B", grade: "7", section: "B" });
    const classId = cr.body?.class?._id;
    await adminEnroll(adminToken, classId, [student._id]);

    const listRes = await adminListClasses(adminToken);
    const cls = (listRes.body?.items || []).find((c) => String(c._id) === String(classId));
    expect(cls).toBeTruthy();

    expect(Array.isArray(cls.students)).toBe(true);
    expect(cls.students.length).toBe(1);
    expect(cls.students[0].email).toBe(student.email);
  });

  test("returns subject on class after subject assignment", async () => {
    const tenantId = "tenant_cls";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, { name: "Grade 8A", grade: "8", section: "A" });
    const classId = cr.body?.class?._id;

    await adminCreateSubject(adminToken, {
      name: "Mathematics",
      code: "MATH",
      teacherIds: [teacher._id],
      classroomIds: [classId],
    });

    const listRes = await adminListClasses(adminToken);
    const cls = (listRes.body?.items || []).find((c) => String(c._id) === String(classId));
    expect(cls).toBeTruthy();
    expect(cls.subject).toBeTruthy();
    expect(cls.subject.name).toBe("Mathematics");
    expect(Array.isArray(cls.subjects)).toBe(true);
    expect(cls.subjects.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("createClass — inline teacherId", () => {
  test("assigns teacher when teacherId is provided at create time", async () => {
    const tenantId = "tenant_create";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, {
      name: "Grade 9A",
      grade: "9",
      section: "A",
      teacherId: teacher._id,
    });
    expect(cr.status).toBe(201);
    const classId = cr.body?.class?._id;

    // Verify DB
    const cls = await Classroom.findById(classId).lean();
    expect(String(cls.teacherId)).toBe(String(teacher._id));
  });

  test("links subject and provisions Course when subjectId provided at create time", async () => {
    const tenantId = "tenant_create2";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    // Pre-create a subject
    const subjRes = await adminCreateSubject(adminToken, {
      name: "Science",
      code: "SCI",
      teacherIds: [teacher._id],
    });
    expect(subjRes.status).toBe(201);
    const subjectId = subjRes.body?.subject?._id;

    // Create class with subjectId inline
    const cr = await adminCreateClass(adminToken, {
      name: "Grade 8B",
      grade: "8",
      section: "B",
      subjectId,
    });
    expect(cr.status).toBe(201);
    const classId = cr.body?.class?._id;

    // Subject.classroomIds should now include this class
    const subj = await Subject.findById(subjectId).lean();
    expect(subj.classroomIds.map(String)).toContain(String(classId));

    // A Course workspace should have been created
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId, deleted: false }).lean();
    expect(course).toBeTruthy();
    expect(course.title).toContain("Science");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("assignTeacher", () => {
  test("sets Classroom.teacherId", async () => {
    const tenantId = "tenant_at";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminAssignTeacher(adminToken, classId, teacher._id);
    expect(res.status).toBe(200);

    const cls = await Classroom.findById(classId).lean();
    expect(String(cls.teacherId)).toBe(String(teacher._id));
  });

  test("syncs teacher as CourseMember in linked courses", async () => {
    const tenantId = "tenant_at";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    // Create a course for this classroom
    const subjRes = await adminCreateSubject(adminToken, {
      name: "History",
      code: "HIST",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;

    // Verify course was provisioned
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();
    expect(course).toBeTruthy();

    // Now assign teacher → should sync into that course
    const res = await adminAssignTeacher(adminToken, classId, teacher._id);
    expect(res.status).toBe(200);

    const membership = await CourseMember.findOne({
      courseId: course._id,
      userId: teacher._id,
      role: "teacher",
      status: "active",
    }).lean();
    expect(membership).toBeTruthy();
  });

  test("rejects teacher that does not belong to the tenant (tenant scope fix)", async () => {
    const tenantId = "tenant_at";
    const otherTenantId = "tenant_other";
    const { token: adminToken } = await createAdmin({ tenantId });

    // Teacher belongs ONLY to otherTenantId
    const { user: foreignTeacher } = await createTeacher({
      tenantId: otherTenantId,
      tenantIds: [otherTenantId],
    });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminAssignTeacher(adminToken, classId, foreignTeacher._id);
    expect(res.status).toBe(404); // "Teacher not found in this tenant"
  });

  test("rejects assigning a STUDENT user as teacher", async () => {
    const tenantId = "tenant_at2";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminAssignTeacher(adminToken, classId, student._id);
    // Student is in the tenant but is not TEACHER role — controller should reject
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("accepts teacher belonging to tenant via tenantIds (multi-tenant teacher)", async () => {
    const tenantId = "tenant_multi";
    const otherTenantId = "tenant_other2";
    const { token: adminToken } = await createAdmin({ tenantId });

    // Teacher's primary tenantId is otherTenantId but tenantIds includes tenantId
    const { user: multiTeacher } = await createTeacher({
      tenantId: otherTenantId,
      tenantIds: [otherTenantId, tenantId],
    });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminAssignTeacher(adminToken, classId, multiTeacher._id);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("enrollStudents / unenrollStudents", () => {
  test("enrollStudents adds students to Classroom.studentIds", async () => {
    const tenantId = "tenant_enroll";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: s1 } = await createStudent({ tenantId });
    const { user: s2 } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminEnroll(adminToken, classId, [s1._id, s2._id]);
    expect(res.status).toBe(200);

    const cls = await Classroom.findById(classId).lean();
    const ids = cls.studentIds.map(String);
    expect(ids).toContain(String(s1._id));
    expect(ids).toContain(String(s2._id));
  });

  test("enrollStudents syncs students as CourseMember in linked courses", async () => {
    const tenantId = "tenant_enroll";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 8A", grade: "8", section: "A" });
    const classId = cr.body?.class?._id;

    // Provision a course by creating subject with this classroom
    const subjRes = await adminCreateSubject(adminToken, {
      name: "English",
      code: "ENG",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();
    expect(course).toBeTruthy();

    // Now enroll student
    const res = await adminEnroll(adminToken, classId, [student._id]);
    expect(res.status).toBe(200);

    const membership = await CourseMember.findOne({
      courseId: course._id,
      userId: student._id,
      role: "student",
      status: "active",
    }).lean();
    expect(membership).toBeTruthy();
  });

  test("enrollStudents rejects students from a different tenant", async () => {
    const tenantId = "tenant_enroll2";
    const otherTenantId = "tenant_other3";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: foreignStudent } = await createStudent({ tenantId: otherTenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const res = await adminEnroll(adminToken, classId, [foreignStudent._id]);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("unenrollStudents removes students from Classroom.studentIds", async () => {
    const tenantId = "tenant_unenroll";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    await adminEnroll(adminToken, classId, [student._id]);

    const res = await adminUnenroll(adminToken, classId, [student._id]);
    expect(res.status).toBe(200);

    const cls = await Classroom.findById(classId).lean();
    expect(cls.studentIds.map(String)).not.toContain(String(student._id));
  });

  test("unenrollStudents marks CourseMember status as removed", async () => {
    const tenantId = "tenant_unenroll2";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 8B", grade: "8", section: "B" });
    const classId = cr.body?.class?._id;

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Biology",
      code: "BIO",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();

    await adminEnroll(adminToken, classId, [student._id]);

    // Confirm active membership
    const activeMember = await CourseMember.findOne({
      courseId: course._id,
      userId: student._id,
      status: "active",
    }).lean();
    expect(activeMember).toBeTruthy();

    await adminUnenroll(adminToken, classId, [student._id]);

    // Membership should now be removed
    const removedMember = await CourseMember.findOne({
      courseId: course._id,
      userId: student._id,
    }).lean();
    expect(removedMember?.status).toBe("removed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Subject → Classroom assignment (Course workspace provisioning)", () => {
  test("creating subject with classroomIds provisions a workspace", async () => {
    const tenantId = "tenant_subj";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, { name: "Grade 9A", grade: "9", section: "A" });
    const classId = cr.body?.class?._id;

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Geography",
      code: "GEO",
      teacherIds: [teacher._id],
      classroomIds: [classId],
    });
    expect(subjRes.status).toBe(201);
    const subjectId = subjRes.body?.subject?._id;

    const course = await Course.findOne({
      tenantId,
      subjectId,
      classroomId: classId,
      deleted: false,
    }).lean();

    expect(course).toBeTruthy();
    expect(course.title).toContain("Geography");
    expect(course.title).toContain("Grade 9A");
  });

  test("teacher assigned to class sees workspace via /api/courses", async () => {
    const tenantId = "tenant_subj2";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher, token: teacherToken } = await createTeacher({
      tenantId,
      tenantIds: [tenantId],
    });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    await adminAssignTeacher(adminToken, classId, teacher._id);

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Physics",
      code: "PHY",
      teacherIds: [teacher._id],
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();
    expect(course).toBeTruthy();

    const coursesRes = await request(app)
      .get("/api/courses")
      .set(authHeader(teacherToken));
    expect(coursesRes.status).toBe(200);
    const courseIds = (coursesRes.body?.courses || []).map((c) => String(c._id));
    expect(courseIds).toContain(String(course._id));
  });

  test("enrolled student sees workspace via /api/courses", async () => {
    const tenantId = "tenant_subj3";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });
    const { user: student, token: studentToken } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7B", grade: "7", section: "B" });
    const classId = cr.body?.class?._id;

    await adminEnroll(adminToken, classId, [student._id]);

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Chemistry",
      code: "CHEM",
      teacherIds: [teacher._id],
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();
    expect(course).toBeTruthy();

    const coursesRes = await request(app)
      .get("/api/courses")
      .set(authHeader(studentToken));
    expect(coursesRes.status).toBe(200);
    const courseIds = (coursesRes.body?.courses || []).map((c) => String(c._id));
    expect(courseIds).toContain(String(course._id));
  });

  test("workspace title uses subject name + class name", async () => {
    const tenantId = "tenant_title";
    const { token: adminToken } = await createAdmin({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 8A", grade: "8", section: "A" });
    const classId = cr.body?.class?._id;

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Mathematics",
      code: "MATH",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;

    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();
    expect(course.title).toBe("Mathematics - Grade 8A 8 A");
    expect(course.shortName).toContain("MATH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("RBAC on class endpoints", () => {
  test("STUDENT cannot list classes (403)", async () => {
    const { token } = await createStudent({ tenantId: "tenant_rbac" });
    const res = await request(app).get("/api/admin/classes").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("TEACHER cannot create classes (403)", async () => {
    const { token } = await createTeacher({ tenantId: "tenant_rbac" });
    const res = await request(app)
      .post("/api/admin/classes")
      .set(authHeader(token))
      .send({ name: "Grade 7A" });
    expect(res.status).toBe(403);
  });

  test("unauthenticated request returns 401", async () => {
    const res = await request(app).get("/api/admin/classes");
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Idempotency", () => {
  test("enrolling the same student twice does not duplicate CourseMember", async () => {
    const tenantId = "tenant_idem";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: student } = await createStudent({ tenantId });

    const cr = await adminCreateClass(adminToken, { name: "Grade 7A", grade: "7", section: "A" });
    const classId = cr.body?.class?._id;

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Art",
      code: "ART",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();

    // Enroll twice
    await adminEnroll(adminToken, classId, [student._id]);
    await adminEnroll(adminToken, classId, [student._id]);

    const members = await CourseMember.find({
      courseId: course._id,
      userId: student._id,
      role: "student",
    }).lean();

    expect(members.length).toBe(1);
  });

  test("assigning the same teacher twice does not duplicate CourseMember", async () => {
    const tenantId = "tenant_idem2";
    const { token: adminToken } = await createAdmin({ tenantId });
    const { user: teacher } = await createTeacher({ tenantId, tenantIds: [tenantId] });

    const cr = await adminCreateClass(adminToken, { name: "Grade 8A", grade: "8", section: "A" });
    const classId = cr.body?.class?._id;

    const subjRes = await adminCreateSubject(adminToken, {
      name: "Music",
      code: "MUS",
      classroomIds: [classId],
    });
    const subjectId = subjRes.body?.subject?._id;
    const course = await Course.findOne({ tenantId, subjectId, classroomId: classId }).lean();

    await adminAssignTeacher(adminToken, classId, teacher._id);
    await adminAssignTeacher(adminToken, classId, teacher._id);

    const members = await CourseMember.find({
      courseId: course._id,
      userId: teacher._id,
      role: "teacher",
    }).lean();

    expect(members.length).toBe(1);
  });
});
