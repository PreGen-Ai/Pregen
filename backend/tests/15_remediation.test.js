import request from "supertest";

import app from "./helpers/app.js";
import {
  clearAllCollections,
  connectTestDB,
  disconnectTestDB,
} from "./helpers/db.js";
import {
  authHeader,
  createAdmin,
  createCourse,
  createStudent,
  createSuperAdmin,
  createTeacher,
} from "./helpers/factory.js";
import Assignment from "../src/models/Assignment.js";
import AuditLog from "../src/models/AuditLog.js";
import Classroom from "../src/models/Classroom.js";
import Course from "../src/models/CourseModel.js";
import CourseMember from "../src/models/CourseMember.js";
import Leaderboard from "../src/models/leaderboardModel.js";
import Quiz from "../src/models/quiz.js";
import QuizAssignment from "../src/models/QuizAssignment.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import Submission from "../src/models/Submission.js";
import User from "../src/models/userModel.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(async () => {
  await clearAllCollections();
});
afterEach(() => {
  jest.restoreAllMocks();
});

function futureIso(days = 3) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function buildCourseFixture({
  tenantId = "tenant_alpha",
  includeSecondStudent = false,
} = {}) {
  const { user: teacher, token: teacherToken } = await createTeacher({ tenantId });
  const { user: student, token: studentToken } = await createStudent({ tenantId });
  const extraStudent = includeSecondStudent
    ? await createStudent({ tenantId })
    : null;

  const course = await createCourse(teacher, { tenantId });
  const classroom = await Classroom.create({
    tenantId,
    name: "Class A",
    section: "A",
    teacherId: teacher._id,
    studentIds: [
      student._id,
      ...(extraStudent ? [extraStudent.user._id] : []),
    ],
  });

  course.classroomId = classroom._id;
  await course.save();

  await CourseMember.create({
    courseId: course._id,
    userId: student._id,
    role: "student",
    status: "active",
  });

  if (extraStudent) {
    await CourseMember.create({
      courseId: course._id,
      userId: extraStudent.user._id,
      role: "student",
      status: "active",
    });
  }

  return {
    tenantId,
    teacher,
    teacherToken,
    student,
    studentToken,
    secondStudent: extraStudent?.user || null,
    secondStudentToken: extraStudent?.token || null,
    course,
    classroom,
  };
}

async function createPublishedAssignment({
  teacherToken,
  course,
  classroom,
  studentIds,
  overrides = {},
}) {
  return request(app)
    .post("/api/teachers/assignments")
    .set(authHeader(teacherToken))
    .send({
      title: "Targeted Assignment",
      description: "Write about the lesson.",
      instructions: "Use evidence from class.",
      dueDate: futureIso(),
      workspaceId: String(course._id),
      classroomId: classroom ? String(classroom._id) : undefined,
      studentIds: studentIds.map(String),
      status: "published",
      ...overrides,
    });
}

async function createPublishedQuiz({
  teacherToken,
  course,
  classroom,
  studentIds,
  overrides = {},
}) {
  return request(app)
    .post("/api/teachers/quizzes")
    .set(authHeader(teacherToken))
    .send({
      title: "Targeted Quiz",
      description: "Quiz on the chapter",
      subject: "Science",
      workspaceId: String(course._id),
      classroomId: classroom ? String(classroom._id) : undefined,
      studentIds: studentIds.map(String),
      dueDate: futureIso(),
      status: "published",
      questions: [
        {
          questionText: "Explain photosynthesis.",
          questionType: "essay",
          points: 10,
        },
      ],
      ...overrides,
    });
}

describe("Remediation - admin security and message contracts", () => {
  test("tenant admin cannot promote a user to SUPERADMIN, even with SUPER_ADMIN input", async () => {
    const { token: adminToken } = await createAdmin({ tenantId: "tenant_alpha" });
    const { user: student } = await createStudent({ tenantId: "tenant_alpha" });

    const res = await request(app)
      .patch(`/api/admin/users/${student._id}/role`)
      .set(authHeader(adminToken))
      .send({ role: "SUPER_ADMIN" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only superadmins/i);

    const freshUser = await User.findById(student._id).lean();
    expect(freshUser.role).toBe("STUDENT");
  });

  test("superadmin can promote a tenant user to SUPERADMIN through normalized role input", async () => {
    const { token: superToken } = await createSuperAdmin();
    const { user: adminUser } = await createAdmin({ tenantId: "tenant_alpha" });

    const res = await request(app)
      .patch(`/api/admin/users/${adminUser._id}/role`)
      .set({
        ...authHeader(superToken),
        "x-tenant-id": "tenant_alpha",
      })
      .send({ role: "super_admin" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("SUPERADMIN");

    const freshUser = await User.findById(adminUser._id).lean();
    expect(freshUser.role).toBe("SUPERADMIN");
  });

  test("empty class enrollment payload returns the aligned studentIds message", async () => {
    const { token: adminToken } = await createAdmin({ tenantId: "tenant_alpha" });

    const classRes = await request(app)
      .post("/api/admin/classes")
      .set(authHeader(adminToken))
      .send({ name: "Grade 9-A" });

    expect(classRes.status).toBe(201);

    const enrollRes = await request(app)
      .post(`/api/admin/classes/${classRes.body.class._id}/enroll`)
      .set(authHeader(adminToken))
      .send({ studentIds: [] });

    expect(enrollRes.status).toBe(400);
    expect(enrollRes.body.message).toBe("studentIds must be non-empty array");
  });

  test("creating a user writes an audit log entry", async () => {
    const { token: adminToken } = await createAdmin({ tenantId: "tenant_alpha" });
    const email = `student_${Date.now()}@test.com`;

    const res = await request(app)
      .post("/api/admin/users/create")
      .set(authHeader(adminToken))
      .send({
        email,
        password: "Password1!",
        role: "STUDENT",
      });

    expect(res.status).toBe(201);

    const auditEntry = await AuditLog.findOne({
      type: "USER_CREATED",
      "meta.email": email,
    }).lean();

    expect(auditEntry).toBeTruthy();
    expect(auditEntry.tenantId).toBe("tenant_alpha");
  });
});

describe("Remediation - tenant isolation and targeting", () => {
  test("leaderboard data is tenant scoped even when subject filter is used", async () => {
    const { user: studentA, token: tokenA } = await createStudent({
      tenantId: "tenant_alpha",
      firstName: "Alpha",
      lastName: "Student",
    });
    const { user: studentB } = await createStudent({
      tenantId: "tenant_beta",
      firstName: "Beta",
      lastName: "Student",
    });

    await Leaderboard.create([
      {
        tenantId: "tenant_alpha",
        studentId: studentA._id,
        subject: "Science",
        points: 87,
      },
      {
        tenantId: "tenant_beta",
        studentId: studentB._id,
        subject: "Science",
        points: 99,
      },
    ]);

    const res = await request(app)
      .get("/api/students/leaderboard?subject=Science")
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe(studentA.email);
    expect(res.body.data[0].points).toBe(87);
  });

  test("teacher can create targeted assignment and quiz, and only enrolled students can see them", async () => {
    const fixture = await buildCourseFixture({ includeSecondStudent: false });
    const { tenantId, teacherToken, student, studentToken, course, classroom } = fixture;
    const { user: outsider, token: outsiderToken } = await createStudent({ tenantId });

    const assignmentRes = await createPublishedAssignment({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
    });
    const quizRes = await createPublishedQuiz({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
    });

    expect(assignmentRes.status).toBe(201);
    expect(quizRes.status).toBe(201);
    expect(assignmentRes.body.data.classId).toBe(String(classroom._id));
    expect(quizRes.body.data.classId).toBe(String(classroom._id));

    const enrolledAssignments = await request(app)
      .get("/api/students/assignments")
      .set(authHeader(studentToken));
    const outsiderAssignments = await request(app)
      .get("/api/students/assignments")
      .set(authHeader(outsiderToken));
    const enrolledQuizzes = await request(app)
      .get("/api/students/quizzes")
      .set(authHeader(studentToken));
    const outsiderQuizzes = await request(app)
      .get("/api/students/quizzes")
      .set(authHeader(outsiderToken));

    expect(enrolledAssignments.status).toBe(200);
    expect(enrolledAssignments.body.data).toHaveLength(1);
    expect(enrolledAssignments.body.data[0].title).toBe("Targeted Assignment");
    expect(outsiderAssignments.status).toBe(200);
    expect(outsiderAssignments.body.data).toHaveLength(0);

    expect(enrolledQuizzes.status).toBe(200);
    expect(enrolledQuizzes.body.data).toHaveLength(1);
    expect(enrolledQuizzes.body.data[0].title).toBe("Targeted Quiz");
    expect(outsiderQuizzes.status).toBe(200);
    expect(outsiderQuizzes.body.data).toHaveLength(0);

    const storedCourse = await Course.findById(course._id).lean();
    expect(String(storedCourse.classroomId)).toBe(String(classroom._id));
  });
});

describe("Remediation - submission and review lifecycle", () => {
  test("student cannot submit after due date and cannot submit to a course they are not enrolled in", async () => {
    const { teacher, student, studentToken, course } = await buildCourseFixture();
    const { user: outsider, token: outsiderToken } = await createStudent({
      tenantId: "tenant_alpha",
    });

    const pastAssignment = await Assignment.create({
      tenantId: "tenant_alpha",
      title: "Past Assignment",
      description: "Too late",
      dueDate: new Date(Date.now() - 60 * 1000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });

    const enrolledLateRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({
        assignmentId: String(pastAssignment._id),
        textSubmission: "Late work",
      });

    expect(enrolledLateRes.status).toBe(400);
    expect(enrolledLateRes.body.error).toBe("Assignment due date has passed");

    const freshAssignment = await Assignment.create({
      tenantId: "tenant_alpha",
      title: "Current Assignment",
      description: "Active",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      teacher: teacher._id,
      workspace: course._id,
      status: "published",
      maxScore: 100,
      type: "text_submission",
    });

    const outsiderRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(outsiderToken))
      .send({
        assignmentId: String(freshAssignment._id),
        textSubmission: "Not enrolled",
      });

    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.error).toBe("Not enrolled in this course");
  });

  test("teacher review flow preserves AI draft, allows override, finalizes approval, and exposes only final student results", async () => {
    const fixture = await buildCourseFixture();
    const { teacher, teacherToken, student, studentToken, course, classroom } = fixture;

    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          overall_score: 76,
          graded_questions: [
            {
              id: "essay-1",
              feedback: "AI draft feedback",
              score: 76,
              max_score: 100,
            },
          ],
          report_id: "report-ai-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const assignmentRes = await createPublishedAssignment({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
      overrides: {
        title: "AI Reviewed Assignment",
      },
    });

    expect(assignmentRes.status).toBe(201);

    const submitRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({
        assignmentId: assignmentRes.body.data._id,
        textSubmission: "Here is my answer with details.",
      });

    expect(submitRes.status).toBe(202);
    expect(submitRes.body.submission.score).toBeNull();
    expect(submitRes.body.submission.feedback).toBe("");

    const storedSubmission = await Submission.findOne({
      assignmentId: assignmentRes.body.data._id,
      studentId: student._id,
    });

    expect(storedSubmission).toBeTruthy();
    expect(storedSubmission.aiScore).toBe(76);
    expect(storedSubmission.aiFeedback).toBe("AI draft feedback");
    expect(storedSubmission.gradingStatus).toBe("pending_teacher_review");
    expect(storedSubmission.finalScore).toBeNull();

    const preApprovalResults = await request(app)
      .get("/api/students/results")
      .set(authHeader(studentToken));

    expect(preApprovalResults.status).toBe(200);
    expect(preApprovalResults.body.data.assignments[0].score).toBeNull();
    expect(preApprovalResults.body.data.assignments[0].feedback).toBe("");
    expect(preApprovalResults.body.data.assignments[0].released).toBe(false);

    const reviewRes = await request(app)
      .patch(`/api/teachers/assignments/submissions/${storedSubmission._id}/review`)
      .set(authHeader(teacherToken))
      .send({
        grade: 91,
        feedback: "Teacher override feedback",
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.item.adjustedByTeacher).toBe(true);
    expect(reviewRes.body.item.status).toBe("pending_teacher_review");
    expect(reviewRes.body.item.aiScore).toBe(76);
    expect(reviewRes.body.item.aiFeedback).toBe("AI draft feedback");

    const approveRes = await request(app)
      .post(`/api/teachers/assignments/submissions/${storedSubmission._id}/approve`)
      .set(authHeader(teacherToken))
      .send({
        grade: 91,
        feedback: "Teacher override feedback",
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.item.status).toBe("final");
    expect(approveRes.body.item.finalScore).toBe(91);
    expect(approveRes.body.item.finalFeedback).toBe("Teacher override feedback");

    const finalizedSubmission = await Submission.findById(storedSubmission._id).lean();
    expect(finalizedSubmission.adjustedByTeacher).toBe(true);
    expect(finalizedSubmission.teacherApprovedBy.toString()).toBe(String(teacher._id));
    expect(finalizedSubmission.finalScore).toBe(91);
    expect(finalizedSubmission.finalFeedback).toBe("Teacher override feedback");

    const resultRes = await request(app)
      .get("/api/students/results")
      .set(authHeader(studentToken));

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.data.assignments[0].score).toBe(91);
    expect(resultRes.body.data.assignments[0].feedback).toBe("Teacher override feedback");
    expect(resultRes.body.data.assignments[0].released).toBe(true);
    expect(resultRes.body.data.assignments[0].status).toBe("final");

    const auditTypes = await AuditLog.find({
      type: { $in: ["GRADE_REVIEW_DRAFTED", "GRADE_APPROVED"] },
      "meta.submissionId": storedSubmission._id,
    })
      .sort({ createdAt: 1 })
      .lean();

    expect(auditTypes.map((entry) => entry.type)).toEqual([
      "GRADE_REVIEW_DRAFTED",
      "GRADE_APPROVED",
    ]);
  });

  test("AI grading failures create a durable grading_delayed state instead of a silent partial result", async () => {
    const fixture = await buildCourseFixture();
    const { teacherToken, student, studentToken, course, classroom } = fixture;

    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Upstream grading failure" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const assignmentRes = await createPublishedAssignment({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
      overrides: {
        title: "Delayed Grading Assignment",
      },
    });

    expect(assignmentRes.status).toBe(201);

    const submitRes = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(studentToken))
      .send({
        assignmentId: assignmentRes.body.data._id,
        textSubmission: "This will trigger delayed grading.",
      });

    expect(submitRes.status).toBe(202);
    expect(submitRes.body.message).toMatch(/Grading is delayed/i);

    const storedSubmission = await Submission.findOne({
      assignmentId: assignmentRes.body.data._id,
      studentId: student._id,
    }).lean();

    expect(storedSubmission.gradingStatus).toBe("grading_delayed");
    expect(storedSubmission.latestGradingError).toMatch(/Upstream grading failure/i);
    expect(storedSubmission.finalScore).toBeNull();
  });

  test("teacher cannot access another teacher's submission list", async () => {
    const fixture = await buildCourseFixture();
    const { teacherToken, student, course, classroom } = fixture;
    const { token: otherTeacherToken } = await createTeacher({ tenantId: "tenant_alpha" });

    const assignmentRes = await createPublishedAssignment({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
      overrides: {
        title: "Ownership Assignment",
      },
    });

    expect(assignmentRes.status).toBe(201);

    const foreignRes = await request(app)
      .get(`/api/teachers/assignments/${assignmentRes.body.data._id}/submissions`)
      .set(authHeader(otherTeacherToken));

    expect(foreignRes.status).toBe(403);
  });

  test("student quiz submission is persisted, reaches AI review, and is visible to the teacher", async () => {
    const fixture = await buildCourseFixture();
    const { teacherToken, student, studentToken, course, classroom } = fixture;

    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          overall_score: 84,
          graded_questions: [
            {
              id: "essay-quiz-1",
              feedback: "Thoughtful explanation of photosynthesis.",
              score: 84,
              max_score: 100,
            },
          ],
          report_id: "report-quiz-review-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const quizRes = await createPublishedQuiz({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
      overrides: {
        title: "AI Reviewed Quiz",
      },
    });

    expect(quizRes.status).toBe(201);

    const targetRow = await QuizAssignment.findOne({
      quizId: quizRes.body.data._id,
      studentId: student._id,
    }).lean();
    expect(targetRow).toBeTruthy();

    const storedQuiz = await Quiz.findById(quizRes.body.data._id).lean();
    const quizQuestionId = String(storedQuiz.questions[0]._id);

    const startRes = await request(app)
      .post(`/api/quizzes/assignments/${targetRow._id}/start`)
      .set(authHeader(studentToken));

    expect(startRes.status).toBe(200);
    expect(startRes.body.attempt.status).toBe("InProgress");

    const submitRes = await request(app)
      .post(`/api/quizzes/attempts/${startRes.body.attempt._id}/submit`)
      .set(authHeader(studentToken))
      .send({
        answers: {
          [quizQuestionId]: "Plants use sunlight to make glucose.",
        },
      });

    expect(submitRes.status).toBe(202);

    const storedAttempt = await QuizAttempt.findById(startRes.body.attempt._id).lean();
    expect(storedAttempt).toBeTruthy();
    expect(storedAttempt.status).toBe("pending_teacher_review");
    expect(storedAttempt.aiScore).toBe(84);
    expect(storedAttempt.aiFeedback).toBe(
      "Thoughtful explanation of photosynthesis.",
    );
    expect(storedAttempt.answers).toHaveLength(1);
    expect(String(storedAttempt.answers[0].questionId)).toBe(quizQuestionId);
    expect(storedAttempt.workspaceId.toString()).toBe(String(course._id));

    const resultsRes = await request(app)
      .get(`/api/teachers/quizzes/${quizRes.body.data._id}/results`)
      .set(authHeader(teacherToken));

    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.summary.submitted).toBe(1);
    expect(resultsRes.body.attempts).toHaveLength(1);
    expect(resultsRes.body.attempts[0].score).toBe(84);
    expect(resultsRes.body.attempts[0].feedback).toBe(
      "Thoughtful explanation of photosynthesis.",
    );
    expect(String(resultsRes.body.attempts[0].student._id)).toBe(String(student._id));
  });

  test("course assignment submit route persists the submission, runs AI grading, and exposes it to the teacher", async () => {
    const fixture = await buildCourseFixture();
    const { teacherToken, student, studentToken, course, classroom } = fixture;

    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          overall_score: 92,
          graded_questions: [
            {
              id: "assignment-1",
              feedback: "Strong evidence and clear reasoning.",
              score: 92,
              max_score: 100,
            },
          ],
          report_id: "report-assignment-review-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const assignmentRes = await createPublishedAssignment({
      teacherToken,
      course,
      classroom,
      studentIds: [student._id],
      overrides: {
        title: "Course Submit Assignment",
      },
    });

    expect(assignmentRes.status).toBe(201);

    const submitRes = await request(app)
      .post(
        `/api/courses/${course._id}/assignments/${assignmentRes.body.data._id}/submit`,
      )
      .set(authHeader(studentToken))
      .field("textSubmission", "Here is my final lab reflection.");

    expect(submitRes.status).toBe(202);
    expect(submitRes.body.submission.score).toBeNull();
    expect(submitRes.body.submission.feedback).toBe("");

    const storedSubmission = await Submission.findOne({
      assignmentId: assignmentRes.body.data._id,
      studentId: student._id,
      workspaceId: course._id,
    }).lean();

    expect(storedSubmission).toBeTruthy();
    expect(storedSubmission.textSubmission).toBe(
      "Here is my final lab reflection.",
    );
    expect(storedSubmission.gradingStatus).toBe("pending_teacher_review");
    expect(storedSubmission.aiScore).toBe(92);
    expect(storedSubmission.aiFeedback).toBe(
      "Strong evidence and clear reasoning.",
    );

    const teacherSubmissionsRes = await request(app)
      .get(`/api/teachers/assignments/${assignmentRes.body.data._id}/submissions`)
      .set(authHeader(teacherToken));

    expect(teacherSubmissionsRes.status).toBe(200);
    expect(teacherSubmissionsRes.body.summary.submitted).toBe(1);
    expect(teacherSubmissionsRes.body.submissions).toHaveLength(1);
    expect(teacherSubmissionsRes.body.submissions[0].score).toBe(92);
    expect(teacherSubmissionsRes.body.submissions[0].feedback).toBe(
      "Strong evidence and clear reasoning.",
    );
    expect(
      String(teacherSubmissionsRes.body.submissions[0].student._id),
    ).toBe(String(student._id));
  });
});

describe("Remediation - Node/FastAPI grading contract alignment", () => {
  test("grade-quiz proxy forwards canonical quiz_questions while accepting assignment_data.questions", async () => {
    const { token: teacherToken } = await createTeacher({ tenantId: "tenant_alpha" });
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          overall_score: 88,
          graded_questions: [
            {
              id: "q1",
              feedback: "Well done",
              score: 1,
              max_score: 1,
            },
          ],
          report_id: "report-quiz-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const payload = {
      student_id: "student-123",
      assignment_name: "Contract Quiz",
      subject: "Science",
      curriculum: "General",
      assignment_data: {
        questions: [
          {
            id: "q1",
            type: "multiple_choice",
            question: "What is H2O?",
            options: ["Water", "Air"],
            correct_answer: "A",
            max_score: 1,
          },
        ],
      },
      student_answers: {
        q1: "A",
      },
    };

    const res = await request(app)
      .post("/api/ai/grade-quiz")
      .set(authHeader(teacherToken))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.overall_score).toBe(88);

    const upstreamCall = fetchSpy.mock.calls[0];
    const forwardedBody = JSON.parse(upstreamCall[1].body);

    expect(Array.isArray(forwardedBody.quiz_questions)).toBe(true);
    expect(forwardedBody.quiz_questions).toHaveLength(1);
    expect(forwardedBody.assignment_data.questions).toHaveLength(1);
    expect(forwardedBody.quiz_questions[0].id).toBe("q1");
    expect(upstreamCall[1].headers["x-internal-api-key"]).toBe(
      process.env.AI_SERVICE_SHARED_SECRET,
    );
  });
});
