import request from "supertest";
import app from "./helpers/app.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearAllCollections,
} from "./helpers/db.js";
import {
  authHeader,
  createCourse,
  createStudent,
  createTeacher,
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
afterEach(() => {
  jest.restoreAllMocks();
});

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

async function buildFixture() {
  const { user: teacher, token: teacherToken } = await createTeacher({
    tenantId: "tenant_test",
  });
  const { user: student, token: studentToken } = await createStudent({
    tenantId: "tenant_test",
  });
  const course = await createCourse(teacher, { tenantId: "tenant_test" });

  await CourseMember.create({
    courseId: course._id,
    userId: student._id,
    role: "student",
    status: "active",
  });

  return { teacher, teacherToken, student, studentToken, course };
}

describe("Teacher review workflow", () => {
  test("teacher can inspect an assignment submission, save reviewed overrides, and return it later", async () => {
    const { teacher, teacherToken, student, studentToken, course } =
      await buildFixture();

    const assignment = await Assignment.create({
      tenantId: "tenant_test",
      title: "Energy transfer",
      description: "Explain how plants store solar energy.",
      instructions: "Mention chlorophyll, glucose, and oxygen.",
      dueDate: new Date(Date.now() + 86400000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });

    await AssignmentAssignment.create({
      tenantId: "tenant_test",
      assignmentId: assignment._id,
      workspaceId: course._id,
      studentId: student._id,
      status: "assigned",
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 74,
        feedback: "Good explanation but add oxygen output.",
        graded_questions: [
          {
            id: String(assignment._id),
            score: 74,
            max_score: 100,
            feedback: "Covers glucose but misses oxygen detail.",
          },
        ],
        report_id: "assignment-review-1",
      }),
    );

    const submitRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({
        assignmentId: String(assignment._id),
        textSubmission:
          "Plants use chlorophyll to turn light into glucose for stored energy.",
      });

    expect(submitRes.status).toBe(202);

    const savedSubmission = await Submission.findOne({
      assignmentId: assignment._id,
      studentId: student._id,
    }).lean();
    expect(savedSubmission).toBeTruthy();
    expect(savedSubmission.questionReviews).toHaveLength(1);
    expect(savedSubmission.reviewStatus).toBe("pending_review");

    const detailRes = await request(app)
      .get(`/api/teachers/assignments/submissions/${savedSubmission._id}`)
      .set(authHeader(teacherToken));

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.submission.reviewStatus).toBe("pending_review");
    expect(detailRes.body.submission.questions).toHaveLength(1);
    expect(detailRes.body.submission.questions[0].studentAnswer).toContain(
      "chlorophyll",
    );
    expect(detailRes.body.submission.questions[0].aiScore).toBe(74);
    expect(detailRes.body.submission.questions[0].aiFeedback).toContain(
      "oxygen detail",
    );

    const reviewedRes = await request(app)
      .patch(`/api/gradebook/submissions/${savedSubmission._id}`)
      .set(authHeader(teacherToken))
      .send({
        grade: 88,
        feedback: "Teacher review saved privately.",
        reviewStatus: "reviewed",
        questions: [
          {
            questionId: String(assignment._id),
            teacherScore: 88,
            teacherFeedback: "Clear answer. Add the oxygen by-product next time.",
          },
        ],
      });

    expect(reviewedRes.status).toBe(200);
    expect(reviewedRes.body.item.reviewStatus).toBe("reviewed");

    const reviewedSubmission = await Submission.findById(savedSubmission._id).lean();
    expect(reviewedSubmission.teacherAdjustedScore).toBe(88);
    expect(reviewedSubmission.finalScore).toBeNull();
    expect(reviewedSubmission.reviewStatus).toBe("reviewed");
    expect(reviewedSubmission.questionReviews[0].teacherScore).toBe(88);
    expect(reviewedSubmission.questionReviews[0].teacherFeedback).toContain(
      "oxygen by-product",
    );

    const hiddenStudentResults = await request(app)
      .get("/api/students/results")
      .set(authHeader(studentToken));

    expect(hiddenStudentResults.status).toBe(200);
    expect(hiddenStudentResults.body.data.assignments[0].score).toBeNull();
    expect(hiddenStudentResults.body.data.assignments[0].feedback).toBe("");

    const returnedRes = await request(app)
      .patch(`/api/teachers/assignments/submissions/${savedSubmission._id}`)
      .set(authHeader(teacherToken))
      .send({
        grade: 90,
        feedback: "Returned to student with final feedback.",
        reviewStatus: "returned",
        questions: [
          {
            questionId: String(assignment._id),
            teacherScore: 90,
            teacherFeedback: "Strong answer after review.",
          },
        ],
      });

    expect(returnedRes.status).toBe(200);
    expect(returnedRes.body.item.reviewStatus).toBe("returned");
    expect(returnedRes.body.item.released).toBe(true);

    const returnedSubmission = await Submission.findById(savedSubmission._id).lean();
    expect(returnedSubmission.finalScore).toBe(90);
    expect(returnedSubmission.finalFeedback).toBe(
      "Returned to student with final feedback.",
    );
    expect(returnedSubmission.gradingStatus).toBe("final");
    expect(returnedSubmission.reviewStatus).toBe("returned");

    const visibleStudentResults = await request(app)
      .get("/api/students/results")
      .set(authHeader(studentToken));

    expect(visibleStudentResults.status).toBe(200);
    expect(visibleStudentResults.body.data.assignments[0].score).toBe(90);
    expect(visibleStudentResults.body.data.assignments[0].feedback).toBe(
      "Returned to student with final feedback.",
    );
  });

  test("teacher can inspect quiz attempts with answers and AI detail, while another teacher is blocked", async () => {
    const { teacher, teacherToken, student, studentToken, course } =
      await buildFixture();
    const { token: otherTeacherToken } = await createTeacher({
      tenantId: "tenant_test",
    });

    const quiz = await Quiz.create({
      tenantId: "tenant_test",
      title: "Photosynthesis review",
      subject: "Biology",
      teacher: teacher._id,
      createdBy: teacher._id,
      workspace: course._id,
      status: "published",
      showResults: true,
      questions: [
        {
          questionText: "Which pigment captures light energy?",
          questionType: "multiple_choice",
          options: [
            { text: "Water", isCorrect: false },
            { text: "Chlorophyll", isCorrect: true },
            { text: "Glucose", isCorrect: false },
            { text: "Oxygen", isCorrect: false },
          ],
          correctAnswer: "B",
          points: 1,
          explanation: "Chlorophyll absorbs light for photosynthesis.",
        },
        {
          questionText: "Explain why glucose is important to the plant.",
          questionType: "essay",
          correctAnswer: "Glucose stores chemical energy the plant can use.",
          points: 9,
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
      status: "in_progress",
      startedAt: new Date(Date.now() - 30000),
    });

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        ok: true,
        overall_score: 82,
        feedback: "Solid understanding overall.",
        graded_questions: [
          {
            id: String(quiz.questions[0]._id),
            score: 1,
            max_score: 1,
            feedback: "Correct objective answer.",
          },
          {
            id: String(quiz.questions[1]._id),
            score: 7,
            max_score: 9,
            feedback: "Good explanation, but mention stored energy explicitly.",
          },
        ],
        report_id: "quiz-review-1",
      }),
    );

    const submitRes = await request(app)
      .post(`/api/quizzes/attempts/${attempt._id}/submit`)
      .set(authHeader(studentToken))
      .send({
        answers: {
          [String(quiz.questions[0]._id)]: "B",
          [String(quiz.questions[1]._id)]:
            "Glucose gives the plant food it can use later.",
        },
      });

    expect(submitRes.status).toBe(202);

    const savedAttempt = await QuizAttempt.findById(attempt._id).lean();
    expect(savedAttempt.questionReviews).toHaveLength(2);

    const detailRes = await request(app)
      .get(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(teacherToken));

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.attempt.reviewStatus).toBe("pending_review");
    expect(detailRes.body.attempt.questions).toHaveLength(2);
    expect(detailRes.body.attempt.questions[0].options).toHaveLength(4);
    expect(detailRes.body.attempt.questions[0].correctAnswer).toBe("B");
    expect(detailRes.body.attempt.questions[0].studentAnswer).toBe("B");
    expect(detailRes.body.attempt.questions[1].aiScore).toBe(7);
    expect(detailRes.body.attempt.questions[1].aiFeedback).toContain(
      "stored energy",
    );

    const updateRes = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${attempt._id}`)
      .set(authHeader(teacherToken))
      .send({
        score: 84,
        feedback: "Teacher override saved.",
        reviewStatus: "reviewed",
        questions: [
          {
            questionId: String(quiz.questions[0]._id),
            teacherScore: 1,
            teacherFeedback: "Good job on the objective question.",
          },
          {
            questionId: String(quiz.questions[1]._id),
            teacherScore: 8,
            teacherFeedback: "Add the stored energy point for full marks.",
          },
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.item.reviewStatus).toBe("reviewed");

    const updatedAttempt = await QuizAttempt.findById(attempt._id).lean();
    expect(updatedAttempt.teacherAdjustedScore).toBe(84);
    expect(updatedAttempt.reviewStatus).toBe("reviewed");
    expect(updatedAttempt.questionReviews[1].teacherScore).toBe(8);
    expect(updatedAttempt.questionReviews[1].teacherFeedback).toContain(
      "full marks",
    );

    const forbiddenRes = await request(app)
      .get(`/api/teachers/quizzes/attempts/${attempt._id}`)
      .set(authHeader(otherTeacherToken));

    expect(forbiddenRes.status).toBe(403);
  });
});
