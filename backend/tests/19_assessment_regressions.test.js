import request from "supertest";
import app from "./helpers/app.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearAllCollections,
} from "./helpers/db.js";
import {
  createCourse,
  createStudent,
  createTeacher,
  authHeader,
} from "./helpers/factory.js";
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

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type"
          ? "application/json"
          : "";
      },
      entries() {
        return [["content-type", "application/json"]][Symbol.iterator]();
      },
    },
    text: async () => JSON.stringify(body),
  };
}

async function enrollStudent(course, student) {
  await CourseMember.create({
    courseId: course._id,
    userId: student._id,
    role: "student",
    status: "active",
  });
}

describe("Assessment grading and leakage regressions", () => {
  test("student assignment submission sends valid grading contract and hides AI review", async () => {
    const { user: teacher } = await createTeacher();
    const { user: student, token } = await createStudent();
    const course = await createCourse(teacher);
    await enrollStudent(course, student);

    const assignment = await Assignment.create({
      tenantId: "tenant_test",
      title: "Photosynthesis essay",
      description: "Explain how photosynthesis stores energy.",
      instructions: "Mention chlorophyll, light energy, glucose, and oxygen.",
      subject: "Biology",
      curriculum: "General",
      dueDate: new Date(Date.now() + 86400000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
    });
    await AssignmentAssignment.create({
      tenantId: "tenant_test",
      assignmentId: assignment._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, options = {}) => {
        const body = JSON.parse(options.body);
        expect(body.question_data.id).toBe(String(assignment._id));
        expect(body.student_answer).toContain("chlorophyll");
        expect(body.student_answers[String(assignment._id)]).toContain(
          "chlorophyll",
        );
        return makeJsonResponse({
          ok: true,
          overall_score: 82,
          feedback: "Strong answer; add more detail on glucose.",
          graded_questions: [{ id: String(assignment._id), feedback: "Good" }],
          report_id: "report-assignment-1",
        });
      },
    );

    const res = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(token))
      .send({
        assignmentId: String(assignment._id),
        textSubmission:
          "Plants use chlorophyll to capture light energy and produce glucose.",
        answers: JSON.stringify({ essay: "chlorophyll and glucose" }),
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.body.submission.score).toBeNull();
    expect(res.body.submission.feedback).toBe("");
    expect(res.body.submission.aiFeedback).toBeUndefined();

    const saved = await Submission.findOne({
      assignmentId: assignment._id,
      studentId: student._id,
    }).lean();
    expect(saved.aiScore).toBe(82);
    expect(saved.gradingStatus).toBe("pending_teacher_review");
    expect(saved.answers).toEqual({ essay: "chlorophyll and glucose" });
  });

  test("manual quiz AI grading saves review state but student response stays hidden", async () => {
    const { user: teacher } = await createTeacher();
    const { user: student, token } = await createStudent();
    const course = await createCourse(teacher);
    await enrollStudent(course, student);

    const quiz = await Quiz.create({
      tenantId: "tenant_test",
      title: "Essay quiz",
      subject: "Biology",
      teacher: teacher._id,
      createdBy: teacher._id,
      workspace: course._id,
      status: "published",
      showResults: true,
      questions: [
        {
          questionText: "Explain the role of chlorophyll in photosynthesis.",
          questionType: "essay",
          correctAnswer:
            "Chlorophyll absorbs light energy used to convert carbon dioxide and water into glucose.",
          points: 10,
        },
      ],
    });
    const attempt = await QuizAttempt.create({
      tenantId: "tenant_test",
      quizId: quiz._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "in_progress",
      startedAt: new Date(Date.now() - 60000),
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 75,
        feedback: "Partially correct.",
        graded_questions: [{ id: String(quiz.questions[0]._id), feedback: "OK" }],
        report_id: "report-quiz-1",
      }),
    );

    const res = await request(app)
      .post(`/api/quizzes/attempts/${attempt._id}/submit`)
      .set(authHeader(token))
      .send({
        answers: {
          [String(quiz.questions[0]._id)]:
            "Chlorophyll captures light for photosynthesis.",
        },
      });

    expect(res.status).toBe(202);
    expect(res.body.score).toBeNull();
    expect(res.body.attempt.score).toBeNull();
    expect(res.body.attempt.feedback).toBe("");
    expect(res.body.attempt.aiFeedback).toBeUndefined();

    const saved = await QuizAttempt.findById(attempt._id).lean();
    expect(saved.aiScore).toBe(75);
    expect(saved.status).toBe("pending_teacher_review");
  });

  test("student assigned quiz content hides answer keys until final release", async () => {
    const { user: teacher, token: teacherToken } = await createTeacher();
    const { user: student, token: studentToken } = await createStudent();
    const course = await createCourse(teacher);
    await enrollStudent(course, student);

    const quiz = await Quiz.create({
      tenantId: "tenant_test",
      title: "Objective quiz",
      subject: "Math",
      teacher: teacher._id,
      createdBy: teacher._id,
      workspace: course._id,
      status: "published",
      showResults: true,
      questions: [
        {
          questionText: "What is 2 + 2?",
          questionType: "multiple_choice",
          options: [
            { text: "3", isCorrect: false },
            { text: "4", isCorrect: true },
            { text: "5", isCorrect: false },
            { text: "6", isCorrect: false },
          ],
          points: 1,
          explanation: "2 + 2 equals 4.",
        },
      ],
    });
    const target = await QuizAssignment.create({
      tenantId: "tenant_test",
      quizId: quiz._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });
    const attempt = await QuizAttempt.create({
      tenantId: "tenant_test",
      quizId: quiz._id,
      quizAssignmentId: target._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "pending_teacher_review",
      aiScore: 100,
      aiFeedback: "Correct answer is B.",
      answers: [{ questionId: quiz.questions[0]._id, answer: "B" }],
      submittedAt: new Date(),
    });

    const pending = await request(app)
      .get(`/api/quizzes/assignments/${target._id}/content`)
      .set(authHeader(studentToken));

    expect(pending.status).toBe(200);
    expect(pending.body.quiz.questions[0].correctAnswer).toBeUndefined();
    expect(pending.body.quiz.questions[0].correct_answer).toBeUndefined();
    expect(pending.body.quiz.questions[0].expected_answer).toBeUndefined();
    expect(pending.body.quiz.questions[0].explanation).toBe("");
    expect(pending.body.assignment.attempt.score).toBeNull();
    expect(pending.body.assignment.attempt.aiFeedback).toBeUndefined();

    const teacherView = await request(app)
      .get("/api/teachers/quizzes")
      .set(authHeader(teacherToken));
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.data[0].questions[0].correctAnswer).toBe("B");

    await QuizAttempt.findByIdAndUpdate(attempt._id, {
      status: "final",
      finalScore: 100,
      finalFeedback: "Approved.",
      teacherApprovedAt: new Date(),
      teacherApprovedBy: teacher._id,
    });

    const released = await request(app)
      .get(`/api/quizzes/assignments/${target._id}/content`)
      .set(authHeader(studentToken));

    expect(released.status).toBe(200);
    expect(released.body.quiz.questions[0].correctAnswer).toBe("B");
    expect(released.body.assignment.attempt.score).toBe(100);
  });
});
