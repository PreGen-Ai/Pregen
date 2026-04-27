/**
 * tests/22_gradebook_teacher_access.test.js
 *
 * Acceptance tests for the Gradebook fix:
 *
 *  1. Teacher without CourseMember sees attempts for quizzes they created.
 *  2. Teacher sees per-question answers in review detail.
 *  3. Teacher can save per-question scores (draft review).
 *  4. Final score recalculates from per-question scores.
 *  5. Approve / Return to Student releases grade.
 *  6. GET /api/teachers/courses returns all accessible courses.
 *  7. Student cannot access unreleased submission/attempt detail.
 *  8. Student sees feedback after teacher returns grade.
 *  9. Admin sees tenant-scoped gradebook rows.
 * 10. In-progress quiz attempts are excluded from the gradebook list.
 */

import request from "supertest";
import mongoose from "mongoose";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createCourse,
  authHeader,
} from "./helpers/factory.js";

import Quiz from "../src/models/quiz.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import Assignment from "../src/models/Assignment.js";
import Submission from "../src/models/Submission.js";
import CourseMember from "../src/models/CourseMember.js";

const TENANT = "tenant_test";

// ─── helpers ────────────────────────────────────────────────────────────────

let _seq = 0;
function seq() {
  return `${++_seq}${Math.random().toString(36).slice(2, 6)}`;
}

function oid() {
  return new mongoose.Types.ObjectId();
}

/** Create a course with a guaranteed-unique code. */
async function makeCourse(teacher, extra = {}) {
  return createCourse(teacher, { code: `C${seq()}`.slice(0, 10).toUpperCase(), ...extra });
}

async function seedQuizWithAttempt({
  teacherUser,
  studentUser,
  courseId = null,
}) {
  const q1Id = oid();
  const q2Id = oid();

  const quiz = await Quiz.create({
    title: `Quiz ${seq()}`,
    teacher: teacherUser._id,
    tenantId: TENANT,
    workspace: courseId,
    subject: "Mathematics",   // required
    status: "published",
    totalPoints: 20,
    questions: [
      {
        _id: q1Id,
        questionText: "What is 2 + 2?",
        questionType: "multiple_choice",
        options: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
          { text: "5", isCorrect: false },
        ],
        correctAnswer: "B",
        points: 10,
      },
      {
        _id: q2Id,
        questionText: "Explain photosynthesis.",
        questionType: "essay",
        points: 10,
      },
    ],
  });

  const attempt = await QuizAttempt.create({
    quizId: quiz._id,
    studentId: studentUser._id,
    tenantId: TENANT,
    workspaceId: courseId,
    status: "pending_teacher_review",
    reviewStatus: "pending_review",
    submittedAt: new Date(),
    score: 50,
    maxScore: 20,
    answers: [
      { questionId: q1Id, answer: "B", isCorrect: true, pointsEarned: 10 },
      {
        questionId: q2Id,
        answer: "Photosynthesis is the process by which plants make food using sunlight.",
        isCorrect: null,
        pointsEarned: 0,
      },
    ],
    questionReviews: [
      {
        position: 0,
        questionId: String(q1Id),
        questionType: "multiple_choice",
        questionText: "What is 2 + 2?",
        options: ["3", "4", "5"],
        correctAnswer: "B",
        studentAnswer: "B",
        maxScore: 10,
        autoScore: 10,
        isCorrect: true,
      },
      {
        position: 1,
        questionId: String(q2Id),
        questionType: "essay",
        questionText: "Explain photosynthesis.",
        studentAnswer:
          "Photosynthesis is the process by which plants make food using sunlight.",
        maxScore: 10,
        autoScore: null,
        aiScore: null,
      },
    ],
  });

  return { quiz, attempt, q1Id, q2Id };
}

async function seedAssignmentWithSubmission({
  teacherUser,
  studentUser,
  courseId = null,
}) {
  const assignment = await Assignment.create({
    title: `Assignment ${seq()}`,
    description: "Write a short essay.",   // required
    dueDate: new Date(Date.now() + 86400000), // required — tomorrow
    teacher: teacherUser._id,
    tenantId: TENANT,
    workspace: courseId,
    maxScore: 100,
    status: "published",
    type: "text_submission",
  });

  const submission = await Submission.create({
    assignmentId: assignment._id,
    studentId: studentUser._id,
    workspaceId: courseId,
    tenantId: TENANT,
    gradingStatus: "submitted",
    reviewStatus: "pending_review",
    textSubmission: "My essay answer about climate change.",
    submittedAt: new Date(),
  });

  return { assignment, submission };
}

// ─── setup ──────────────────────────────────────────────────────────────────

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

// ─── 1. Teacher sees attempts even without CourseMember record ───────────────

describe("1. Teacher without CourseMember sees their quiz attempts", () => {
  test("listGradebook returns attempt for teacher who owns quiz (no CourseMember)", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    await CourseMember.deleteMany({ userId: teacher._id });
    await seedQuizWithAttempt({ teacherUser: teacher, studentUser: student, courseId: course._id });

    const res = await request(app)
      .get("/api/gradebook")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].kind).toBe("quiz");
  });

  test("listGradebook returns attempt when quiz has no workspace set", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });

    await seedQuizWithAttempt({ teacherUser: teacher, studentUser: student, courseId: null });

    const res = await request(app)
      .get("/api/gradebook")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

// ─── 2. Teacher views per-question review detail ────────────────────────────

describe("2. Teacher can view per-question review detail", () => {
  test("GET /api/gradebook/quiz-attempts/:id returns questions with student answers", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const detail = res.body.attempt;
    expect(detail).toBeDefined();
    expect(Array.isArray(detail.questions)).toBe(true);
    expect(detail.questions.length).toBeGreaterThan(0);

    const mcq = detail.questions.find((q) => q.questionType === "multiple_choice");
    expect(mcq).toBeDefined();
    expect(mcq.studentAnswer).toBe("B");
    expect(mcq.correctAnswer).toBeTruthy();

    const essay = detail.questions.find((q) => q.questionType === "essay");
    expect(essay).toBeDefined();
    expect(String(essay.studentAnswer).toLowerCase()).toContain("photosynthesis");
  });

  test("GET /api/gradebook/submissions/:id returns questions with student text", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { submission } = await seedAssignmentWithSubmission({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/submissions/${submission._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const detail = res.body.submission;
    expect(detail).toBeDefined();
    expect(Array.isArray(detail.questions)).toBe(true);
    expect(detail.questions.length).toBeGreaterThan(0);
    expect(detail.questions[0].studentAnswer).toContain("essay answer");
  });

  test("Teacher who owns quiz but is NOT a CourseMember can still load detail", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);
    await CourseMember.deleteMany({ userId: teacher._id });

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.attempt.questions.length).toBeGreaterThan(0);
  });

  test("A different teacher cannot access another teacher's quiz attempt", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: _other, token: otherToken } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(403);
  });
});

// ─── 3. Teacher saves per-question scores (draft review) ────────────────────

describe("3. Teacher saves per-question scores in draft review", () => {
  test("PATCH /api/gradebook/quiz-attempts/:id/review persists per-question teacherScore", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt, q2Id } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const reviewRes = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/review`)
      .set(authHeader(token))
      .send({
        reviewStatus: "reviewed",
        questions: [
          {
            questionId: String(q2Id),
            teacherScore: 8,
            teacherFeedback: "Good explanation but missing key detail.",
          },
        ],
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.item).toBeDefined();
    expect(reviewRes.body.item.reviewStatus).toBe("reviewed");

    // Verify score persisted in full detail
    const detailRes = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(token));

    expect(detailRes.status).toBe(200);
    const essay = detailRes.body.attempt.questions.find(
      (q) => q.questionType === "essay",
    );
    expect(essay).toBeDefined();
    expect(essay.teacherScore).toBe(8);
    expect(essay.teacherFeedback).toContain("Good explanation");
  });

  test("PATCH /api/gradebook/submissions/:id/review persists draft for assignment", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { submission } = await seedAssignmentWithSubmission({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .patch(`/api/gradebook/submissions/${submission._id}/review`)
      .set(authHeader(token))
      .send({
        grade: 78,
        feedback: "Well written but needs more detail.",
        reviewStatus: "reviewed",
      });

    expect(res.status).toBe(200);
    expect(res.body.item.reviewStatus).toBe("reviewed");
    expect(res.body.item.released).toBe(false); // draft — not yet visible to student
  });

  test("Student cannot access review endpoint", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: student, token: studentToken } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/review`)
      .set(authHeader(studentToken))
      .send({ score: 100 });

    expect(res.status).toBe(403);
  });
});

// ─── 4. Final score recalculates from per-question scores ───────────────────

describe("4. Final score recalculates from question scores", () => {
  test("Computed percentage reflects teacher-edited question scores", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt, q1Id, q2Id } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/review`)
      .set(authHeader(token))
      .send({
        questions: [
          { questionId: String(q1Id), teacherScore: 10 },
          { questionId: String(q2Id), teacherScore: 8, teacherFeedback: "Mostly correct." },
        ],
      });

    const detailRes = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(token));

    expect(detailRes.status).toBe(200);
    const questions = detailRes.body.attempt.questions;

    const totalScore = questions.reduce(
      (sum, q) => sum + (q.teacherScore ?? q.autoScore ?? 0),
      0,
    );
    const totalMax = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0);
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 10000) / 100 : null;

    // 10 + 8 = 18 / 20 = 90%
    expect(pct).toBeCloseTo(90, 0);
  });
});

// ─── 5. Approve / Return releases grade ─────────────────────────────────────

describe("5. Approve releases grade to student", () => {
  test("PATCH /api/gradebook/quiz-attempts/:id/approve sets reviewStatus=returned", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/approve`)
      .set(authHeader(token))
      .send({ score: 90, feedback: "Great work!" });

    expect(res.status).toBe(200);
    expect(res.body.item.reviewStatus).toBe("returned");
    expect(res.body.item.released).toBe(true);
  });

  test("PATCH /api/gradebook/submissions/:id/approve releases assignment grade", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { submission } = await seedAssignmentWithSubmission({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .patch(`/api/gradebook/submissions/${submission._id}/approve`)
      .set(authHeader(token))
      .send({ grade: 85, feedback: "Well done." });

    expect(res.status).toBe(200);
    expect(res.body.item.reviewStatus).toBe("returned");
    expect(res.body.item.released).toBe(true);
  });
});

// ─── 6. GET /api/teachers/courses ───────────────────────────────────────────

describe("6. GET /api/teachers/courses returns accessible courses", () => {
  test("Returns courses created by the teacher", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    await makeCourse(teacher, { title: "My Course A" });
    await makeCourse(teacher, { title: "My Course B" });

    const res = await request(app)
      .get("/api/teachers/courses")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.courses)).toBe(true);
    expect(res.body.courses.length).toBeGreaterThanOrEqual(2);
    const titles = res.body.courses.map((c) => c.title);
    expect(titles).toContain("My Course A");
    expect(titles).toContain("My Course B");
  });

  test("Returns courses where teacher is an active CourseMember", async () => {
    const { user: owner } = await createTeacher({ tenantId: TENANT });
    const { user: member, token } = await createTeacher({ tenantId: TENANT });
    const course = await makeCourse(owner, { title: "Shared Course" });

    await CourseMember.create({
      courseId: course._id,
      userId: member._id,
      status: "active",
      role: "teacher",
    });

    const res = await request(app)
      .get("/api/teachers/courses")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const titles = res.body.courses.map((c) => c.title);
    expect(titles).toContain("Shared Course");
  });

  test("Returns 401 without auth", async () => {
    const res = await request(app).get("/api/teachers/courses");
    expect(res.status).toBe(401);
  });

  test("Students cannot access /api/teachers/courses", async () => {
    const { token } = await createStudent({ tenantId: TENANT });
    const res = await request(app)
      .get("/api/teachers/courses")
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("Admin receives all tenant-scoped courses", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { token: adminToken } = await createAdmin({ tenantId: TENANT });
    await makeCourse(teacher, { title: "Admin Visible Course" });

    const res = await request(app)
      .get("/api/teachers/courses")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.courses.length).toBeGreaterThan(0);
  });
});

// ─── 7. Student cannot see unreleased grade detail ──────────────────────────

describe("7. Student cannot see unreleased grade detail", () => {
  test("GET /api/gradebook/my/quiz-attempts/:id returns 403 when not released", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: student, token: studentToken } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/my/quiz-attempts/${attempt._id}`)
      .set(authHeader(studentToken));

    expect(res.status).toBe(403);
  });

  test("GET /api/gradebook/my/submissions/:id returns 403 when not released", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: student, token: studentToken } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { submission } = await seedAssignmentWithSubmission({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    const res = await request(app)
      .get(`/api/gradebook/my/submissions/${submission._id}`)
      .set(authHeader(studentToken));

    expect(res.status).toBe(403);
  });
});

// ─── 8. Student sees feedback after grade is returned ───────────────────────

describe("8. Student sees reviewed feedback after grade returned", () => {
  test("Student can access quiz attempt detail after teacher approves", async () => {
    const { user: teacher, token: teacherToken } = await createTeacher({ tenantId: TENANT });
    const { user: student, token: studentToken } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const { attempt } = await seedQuizWithAttempt({
      teacherUser: teacher,
      studentUser: student,
      courseId: course._id,
    });

    // Teacher approves
    const approveRes = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/approve`)
      .set(authHeader(teacherToken))
      .send({ score: 90, feedback: "Excellent work!" });

    expect(approveRes.status).toBe(200);

    // Student can now load their result
    const studentRes = await request(app)
      .get(`/api/gradebook/my/quiz-attempts/${attempt._id}`)
      .set(authHeader(studentToken));

    expect(studentRes.status).toBe(200);
    const d = studentRes.body.attempt;
    expect(d.released).toBe(true);
    expect(d.feedback).toBeTruthy();
    // Student must NOT see internal AI/audit fields
    expect(d.aiScore).toBeUndefined();
    expect(d.gradingAudit).toBeUndefined();
  });
});

// ─── 9. Admin/Superadmin gradebook ──────────────────────────────────────────

describe("9. Admin sees tenant-scoped gradebook rows", () => {
  test("Admin receives gradebook items for their tenant", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const { token: adminToken } = await createAdmin({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    await seedQuizWithAttempt({ teacherUser: teacher, studentUser: student, courseId: course._id });

    const res = await request(app)
      .get("/api/gradebook")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  test("Admin can filter gradebook by courseId", async () => {
    const { user: teacher } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const { token: adminToken } = await createAdmin({ tenantId: TENANT });
    const courseA = await makeCourse(teacher, { title: "Course Alpha" });
    const courseB = await makeCourse(teacher, { title: "Course Beta" });

    await seedQuizWithAttempt({ teacherUser: teacher, studentUser: student, courseId: courseA._id });
    await seedQuizWithAttempt({ teacherUser: teacher, studentUser: student, courseId: courseB._id });

    const resA = await request(app)
      .get(`/api/gradebook?courseId=${courseA._id}`)
      .set(authHeader(adminToken));

    expect(resA.status).toBe(200);
    const courseIds = resA.body.items.map((i) => i.courseId);
    expect(courseIds.length).toBeGreaterThan(0);
    expect(courseIds.every((id) => String(id) === String(courseA._id))).toBe(true);
  });
});

// ─── 11. Legacy attempt with empty questionReviews can be reviewed ───────────

describe("11. Legacy attempt (empty questionReviews) can be reviewed", () => {
  test("PATCH /review succeeds even when attempt.questionReviews is empty", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const q1Id = oid();
    const quiz = await Quiz.create({
      title: `Legacy Quiz ${seq()}`,
      teacher: teacher._id,
      tenantId: TENANT,
      workspace: course._id,
      subject: "General",
      status: "published",
      totalPoints: 10,
      questions: [
        {
          _id: q1Id,
          questionText: "What is the capital of France?",
          questionType: "multiple_choice",
          options: [
            { text: "London", isCorrect: false },
            { text: "Paris", isCorrect: true },
          ],
          correctAnswer: "B",
          points: 10,
        },
      ],
    });

    // Simulate a legacy attempt: answers saved, but questionReviews = [] (pre-schema)
    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      studentId: student._id,
      tenantId: TENANT,
      workspaceId: course._id,
      status: "pending_teacher_review",
      reviewStatus: "pending_review",
      submittedAt: new Date(),
      score: 0,
      maxScore: 10,
      answers: [{ questionId: q1Id, answer: "A", isCorrect: false, pointsEarned: 0 }],
      questionReviews: [], // empty — simulates legacy attempt
    });

    const res = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/review`)
      .set(authHeader(token))
      .send({
        reviewStatus: "reviewed",
        questions: [{ questionId: String(q1Id), teacherScore: 0, teacherFeedback: "Paris is the answer." }],
      });

    // Must NOT be 500 "Question not found"
    expect(res.status).toBe(200);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.reviewStatus).toBe("reviewed");
  });
});

// ─── 10. In-progress attempts excluded from gradebook list ──────────────────

describe("10. In-progress quiz attempts are excluded from gradebook", () => {
  test("Attempt with status=in_progress does not appear in gradebook list", async () => {
    const { user: teacher, token } = await createTeacher({ tenantId: TENANT });
    const { user: student } = await createStudent({ tenantId: TENANT });
    const course = await makeCourse(teacher);

    const quiz = await Quiz.create({
      title: `In-progress Quiz ${seq()}`,
      teacher: teacher._id,
      tenantId: TENANT,
      workspace: course._id,
      subject: "General",
      status: "published",
      questions: [],
    });

    await QuizAttempt.create({
      quizId: quiz._id,
      studentId: student._id,
      tenantId: TENANT,
      workspaceId: course._id,
      status: "in_progress",
    });

    const res = await request(app)
      .get("/api/gradebook")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const inProgress = (res.body.items || []).filter(
      (i) => i.status === "in_progress",
    );
    expect(inProgress.length).toBe(0);
  });
});
