// tests/21_student_submission_detail.test.js
// Tests: student accessing per-question feedback for their own returned submission/quiz attempt.
// Covers: RBAC (own vs other student), returned-only gate, teacher workflow → student result.
import request from "supertest";
import app from "./helpers/app.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearAllCollections,
} from "./helpers/db.js";
import { authHeader, createCourse, createStudent, createTeacher } from "./helpers/factory.js";
import Assignment from "../src/models/Assignment.js";
import AssignmentAssignment from "../src/models/AssignmentAssignment.js";
import CourseMember from "../src/models/CourseMember.js";
import Quiz from "../src/models/quiz.js";
import QuizAssignment from "../src/models/QuizAssignment.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import Submission from "../src/models/Submission.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());
afterEach(() => jest.restoreAllMocks());

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : "";
      },
      entries() {
        return [["content-type", "application/json"]][Symbol.iterator]();
      },
    },
    text: async () => JSON.stringify(body),
  };
}

async function buildFixture() {
  const { user: teacher, token: teacherToken } = await createTeacher({ tenantId: "tenant_t21" });
  const { user: student, token: studentToken } = await createStudent({ tenantId: "tenant_t21" });
  const { user: otherStudent, token: otherStudentToken } = await createStudent({ tenantId: "tenant_t21" });
  const course = await createCourse(teacher, { tenantId: "tenant_t21" });

  await Promise.all([
    CourseMember.create({ courseId: course._id, userId: student._id, role: "student", status: "active" }),
    CourseMember.create({ courseId: course._id, userId: otherStudent._id, role: "student", status: "active" }),
  ]);

  return { teacher, teacherToken, student, studentToken, otherStudent, otherStudentToken, course };
}

describe("Student submission detail — assignment flow", () => {
  test("student cannot access detail before submission is returned", async () => {
    const { teacher, teacherToken, student, studentToken, course } = await buildFixture();

    const assignment = await Assignment.create({
      tenantId: "tenant_t21",
      title: "Science essay",
      description: "Describe photosynthesis.",
      instructions: "Include light, water, and CO2.",
      dueDate: new Date(Date.now() + 86400000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });
    await AssignmentAssignment.create({
      tenantId: "tenant_t21",
      assignmentId: assignment._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 70,
        feedback: "Good start.",
        graded_questions: [],
        report_id: "r-assign-1",
      }),
    );

    const submitRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({ assignmentId: String(assignment._id), textSubmission: "Light hits leaves." });

    expect(submitRes.status).toBe(202);

    const saved = await Submission.findOne({ assignmentId: assignment._id, studentId: student._id }).lean();

    // Student tries to view detail before it's returned — should get 403
    const res = await request(app)
      .get(`/api/gradebook/my/submissions/${saved._id}`)
      .set(authHeader(studentToken));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not been returned/i);
  });

  test("full flow: student submits → AI grades → teacher reviews and returns → student sees per-question feedback", async () => {
    const { teacher, teacherToken, student, studentToken, course } = await buildFixture();

    const assignment = await Assignment.create({
      tenantId: "tenant_t21",
      title: "Energy lab report",
      description: "Explain how plants convert light to energy.",
      instructions: "Mention chlorophyll, glucose, ATP.",
      dueDate: new Date(Date.now() + 86400000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });
    await AssignmentAssignment.create({
      tenantId: "tenant_t21",
      assignmentId: assignment._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 75,
        feedback: "Covers chlorophyll; missing ATP detail.",
        graded_questions: [
          {
            id: String(assignment._id),
            score: 75,
            max_score: 100,
            feedback: "Good start. Mention ATP for full credit.",
          },
        ],
        report_id: "r-assign-2",
      }),
    );

    // 1. Student submits
    const submitRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({
        assignmentId: String(assignment._id),
        textSubmission: "Plants use chlorophyll to turn sunlight into glucose.",
      });
    expect(submitRes.status).toBe(202);

    const saved = await Submission.findOne({ assignmentId: assignment._id, studentId: student._id }).lean();
    expect(saved.questionReviews).toHaveLength(1);
    expect(saved.questionReviews[0].aiScore).toBe(75);

    // 2. Teacher returns with per-question override
    const returnRes = await request(app)
      .patch(`/api/gradebook/submissions/${saved._id}`)
      .set(authHeader(teacherToken))
      .send({
        grade: 85,
        feedback: "Strong work. Next time mention ATP synthesis.",
        reviewStatus: "returned",
        questions: [
          {
            questionId: String(assignment._id),
            teacherScore: 85,
            teacherFeedback: "Well explained. Add ATP for full marks.",
          },
        ],
      });
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.item.reviewStatus).toBe("returned");
    expect(returnRes.body.item.released).toBe(true);

    // 3. Student now accesses their own returned submission detail
    const detailRes = await request(app)
      .get(`/api/gradebook/my/submissions/${saved._id}`)
      .set(authHeader(studentToken));

    expect(detailRes.status).toBe(200);

    const sub = detailRes.body.submission;
    expect(sub.reviewStatus).toBe("returned");
    expect(sub.released).toBe(true);
    expect(sub.score).toBe(85);
    expect(sub.finalScore).toBe(85);
    expect(sub.feedback).toContain("ATP");

    // Per-question feedback is present
    expect(Array.isArray(sub.questions)).toBe(true);
    expect(sub.questions).toHaveLength(1);
    expect(sub.questions[0].teacherScore).toBe(85);
    expect(sub.questions[0].teacherFeedback).toContain("full marks");
    expect(sub.questions[0].studentAnswer).toContain("chlorophyll");
  });

  test("student cannot read another student's submission detail even if returned", async () => {
    const { teacher, teacherToken, student, studentToken, otherStudent, otherStudentToken, course } =
      await buildFixture();

    const assignment = await Assignment.create({
      tenantId: "tenant_t21",
      title: "Math proof",
      description: "Prove the quadratic formula.",
      instructions: "Show all steps.",
      dueDate: new Date(Date.now() + 86400000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });
    await AssignmentAssignment.create({
      tenantId: "tenant_t21",
      assignmentId: assignment._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({ ok: true, overall_score: 90, feedback: "Perfect.", graded_questions: [], report_id: "r3" }),
    );

    await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({ assignmentId: String(assignment._id), textSubmission: "Derivation complete." });

    const saved = await Submission.findOne({ assignmentId: assignment._id, studentId: student._id }).lean();

    // Return to student
    await request(app)
      .patch(`/api/gradebook/submissions/${saved._id}`)
      .set(authHeader(teacherToken))
      .send({ grade: 90, feedback: "Excellent.", reviewStatus: "returned" });

    // Other student tries to read it
    const forbiddenRes = await request(app)
      .get(`/api/gradebook/my/submissions/${saved._id}`)
      .set(authHeader(otherStudentToken));

    expect(forbiddenRes.status).toBe(404);
  });

  test("teacher cannot use student-only /my/ routes", async () => {
    const { teacherToken } = await buildFixture();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa99";

    const res = await request(app)
      .get(`/api/gradebook/my/submissions/${fakeId}`)
      .set(authHeader(teacherToken));

    expect(res.status).toBe(403);
  });
});

describe("Student quiz attempt detail — quiz flow", () => {
  test("full flow: student submits quiz with essay → AI grades → teacher returns → student sees per-question feedback", async () => {
    const { teacher, teacherToken, student, studentToken, course } = await buildFixture();

    const quiz = await Quiz.create({
      tenantId: "tenant_t21",
      title: "Biology quiz",
      subject: "Biology",
      teacher: teacher._id,
      createdBy: teacher._id,
      workspace: course._id,
      status: "published",
      showResults: true,
      questions: [
        {
          questionText: "Which pigment captures sunlight?",
          questionType: "multiple_choice",
          options: [
            { text: "Glucose", isCorrect: false },
            { text: "Chlorophyll", isCorrect: true },
            { text: "Water", isCorrect: false },
          ],
          correctAnswer: "B",
          points: 2,
          explanation: "Chlorophyll absorbs light energy.",
        },
        {
          questionText: "Why is glucose important?",
          questionType: "essay",
          correctAnswer: "Glucose stores chemical energy for the plant.",
          points: 8,
        },
      ],
    });

    const target = await QuizAssignment.create({
      tenantId: "tenant_t21",
      quizId: quiz._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    const attempt = await QuizAttempt.create({
      tenantId: "tenant_t21",
      quizId: quiz._id,
      quizAssignmentId: target._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "in_progress",
      startedAt: new Date(Date.now() - 60000),
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 80,
        feedback: "Good overall.",
        graded_questions: [
          { id: String(quiz.questions[0]._id), score: 2, max_score: 2, feedback: "Correct." },
          { id: String(quiz.questions[1]._id), score: 6, max_score: 8, feedback: "Mention energy storage explicitly." },
        ],
        report_id: "r-quiz-1",
      }),
    );

    // 1. Student submits quiz
    const submitRes = await request(app)
      .post(`/api/quizzes/attempts/${attempt._id}/submit`)
      .set(authHeader(studentToken))
      .send({
        answers: {
          [String(quiz.questions[0]._id)]: "B",
          [String(quiz.questions[1]._id)]: "Glucose gives the plant energy to grow.",
        },
      });
    expect(submitRes.status).toBe(202);

    const savedAttempt = await QuizAttempt.findById(attempt._id).lean();
    expect(savedAttempt.questionReviews).toHaveLength(2);
    expect(savedAttempt.questionReviews[1].aiScore).toBe(6);

    // 2. Student blocked before return
    const blockedRes = await request(app)
      .get(`/api/gradebook/my/quiz-attempts/${attempt._id}`)
      .set(authHeader(studentToken));
    expect(blockedRes.status).toBe(403);

    // 3. Teacher returns with override
    const returnRes = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(teacherToken))
      .send({
        score: 82,
        feedback: "Great effort. Include energy storage concept next time.",
        reviewStatus: "returned",
        questions: [
          { questionId: String(quiz.questions[0]._id), teacherScore: 2, teacherFeedback: "Perfect." },
          { questionId: String(quiz.questions[1]._id), teacherScore: 7, teacherFeedback: "Mention energy storage to score full marks." },
        ],
      });
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.item.reviewStatus).toBe("returned");

    // 4. Student views per-question detail
    const detailRes = await request(app)
      .get(`/api/gradebook/my/quiz-attempts/${attempt._id}`)
      .set(authHeader(studentToken));

    expect(detailRes.status).toBe(200);
    const att = detailRes.body.attempt;
    expect(att.reviewStatus).toBe("returned");
    expect(att.released).toBe(true);
    expect(att.score).toBe(82);

    expect(att.questions).toHaveLength(2);
    expect(att.questions[0].studentAnswer).toBe("B");
    expect(att.questions[0].correctAnswer).toBe("B");
    expect(att.questions[0].teacherScore).toBe(2);
    expect(att.questions[1].teacherScore).toBe(7);
    expect(att.questions[1].teacherFeedback).toContain("energy storage");
    // No raw AI internals leaked to student
    expect(att.questions[1].studentAnswer).toContain("energy");
  });

  test("student cannot access another student's quiz attempt detail", async () => {
    const { teacher, teacherToken, student, studentToken, otherStudent, otherStudentToken, course } =
      await buildFixture();

    const quiz = await Quiz.create({
      tenantId: "tenant_t21",
      title: "Chem quiz",
      subject: "Chemistry",
      teacher: teacher._id,
      createdBy: teacher._id,
      workspace: course._id,
      status: "published",
      questions: [
        {
          questionText: "What is H2O?",
          questionType: "multiple_choice",
          options: [{ text: "Water", isCorrect: true }, { text: "Acid", isCorrect: false }],
          correctAnswer: "A",
          points: 1,
        },
      ],
    });

    const target = await QuizAssignment.create({
      tenantId: "tenant_t21",
      quizId: quiz._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    const attempt = await QuizAttempt.create({
      tenantId: "tenant_t21",
      quizId: quiz._id,
      quizAssignmentId: target._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "in_progress",
      startedAt: new Date(Date.now() - 30000),
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({ ok: true, overall_score: 100, feedback: "Perfect.", graded_questions: [], report_id: "r-chem" }),
    );

    await request(app)
      .post(`/api/quizzes/attempts/${attempt._id}/submit`)
      .set(authHeader(studentToken))
      .send({ answers: { [String(quiz.questions[0]._id)]: "A" } });

    // Approve directly via gradebook
    await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}/approve`)
      .set(authHeader(teacherToken))
      .send({ score: 100, feedback: "Full marks." });

    // Other student should get 404
    const forbiddenRes = await request(app)
      .get(`/api/gradebook/my/quiz-attempts/${attempt._id}`)
      .set(authHeader(otherStudentToken));
    expect(forbiddenRes.status).toBe(404);
  });
});
