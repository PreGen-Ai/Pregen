import Assignment from "../models/Assignment.js";
import Course from "../models/CourseModel.js";
import Quiz from "../models/quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Submission from "../models/Submission.js";
import {
  canAccessCourse,
  getAccessibleCourseIdsForUser,
  getRequestTenantId,
  getStudentAcademicContext,
  isTeacherLike,
  isValidObjectId,
  normalizeRoleValue,
  toId,
  userFields,
} from "../utils/academicContract.js";

function sortByLatest(a, b) {
  return new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0);
}

function buildSummary(items = []) {
  const gradedItems = items.filter((item) => item.score !== null && item.score !== undefined);
  const averageScore = gradedItems.length
    ? Math.round(
        gradedItems.reduce((sum, item) => sum + Number(item.score || 0), 0) /
          gradedItems.length,
      )
    : null;

  return {
    total: items.length,
    assignments: items.filter((item) => item.kind === "assignment").length,
    quizzes: items.filter((item) => item.kind === "quiz").length,
    graded: gradedItems.length,
    averageScore,
  };
}

function serializeSubmissionGradebook(submission) {
  return {
    _id: toId(submission._id),
    kind: "assignment",
    sourceId: toId(submission._id),
    assignmentId: toId(submission.assignmentId?._id || submission.assignmentId),
    courseId: toId(submission.workspaceId?._id || submission.workspaceId),
    studentId: toId(submission.studentId?._id || submission.studentId),
    title: submission.assignmentId?.title || "Assignment",
    courseTitle: submission.workspaceId?.title || "Course",
    student:
      submission.studentId && typeof submission.studentId === "object"
        ? {
            _id: toId(submission.studentId._id),
            firstName: submission.studentId.firstName || "",
            lastName: submission.studentId.lastName || "",
            username: submission.studentId.username || "",
            email: submission.studentId.email || "",
          }
        : null,
    score:
      submission.grade !== null && submission.grade !== undefined
        ? Number(submission.grade)
        : submission.score !== null && submission.score !== undefined
          ? Number(submission.score)
          : null,
    maxScore: Number(submission.assignmentId?.maxScore || 100),
    feedback: submission.feedback || "",
    status: submission.gradingStatus || "submitted",
    submittedAt: submission.submittedAt || submission.createdAt || null,
    gradedAt: submission.gradedAt || null,
    updatedAt: submission.updatedAt || null,
  };
}

function serializeQuizGradebook(attempt) {
  return {
    _id: toId(attempt._id),
    kind: "quiz",
    sourceId: toId(attempt._id),
    quizAttemptId: toId(attempt._id),
    quizId: toId(attempt.quizId?._id || attempt.quizId),
    courseId: toId(attempt.workspaceId?._id || attempt.workspaceId),
    studentId: toId(attempt.studentId?._id || attempt.studentId),
    title: attempt.quizId?.title || "Quiz",
    courseTitle: attempt.workspaceId?.title || "Course",
    student:
      attempt.studentId && typeof attempt.studentId === "object"
        ? {
            _id: toId(attempt.studentId._id),
            firstName: attempt.studentId.firstName || "",
            lastName: attempt.studentId.lastName || "",
            username: attempt.studentId.username || "",
            email: attempt.studentId.email || "",
          }
        : null,
    score:
      attempt.score !== null && attempt.score !== undefined
        ? Number(attempt.score)
        : null,
    maxScore: Number(attempt.maxScore || attempt.quizId?.totalPoints || 0),
    feedback: attempt.feedback || "",
    status: attempt.status || "submitted",
    submittedAt: attempt.submittedAt || attempt.createdAt || null,
    gradedAt: attempt.gradedAt || null,
    updatedAt: attempt.updatedAt || null,
  };
}

async function resolveCourseScope(req, role) {
  const tenantId = getRequestTenantId(req);
  const requestedCourseId = req.query.courseId;

  if (requestedCourseId) {
    if (!isValidObjectId(requestedCourseId)) {
      throw new Error("Invalid courseId");
    }

    const course = await Course.findById(requestedCourseId).select(
      "_id tenantId createdBy deleted",
    );
    const allowed =
      role === "STUDENT"
        ? (await getStudentAcademicContext(req.user._id, tenantId)).courseIds.includes(
            String(requestedCourseId),
          )
        : await canAccessCourse({ course, req });

    if (!allowed) {
      throw new Error("Not allowed to access this course");
    }

    return [requestedCourseId];
  }

  if (role === "STUDENT") {
    return (await getStudentAcademicContext(req.user._id, tenantId)).courseIds;
  }

  return getAccessibleCourseIdsForUser({
    userId: req.user._id,
    tenantId,
  });
}

export async function listGradebook(req, res) {
  try {
    const role = normalizeRoleValue(req.user?.role);
    const courseIds = await resolveCourseScope(req, role);
    const studentId =
      role === "STUDENT" ? req.user._id : req.query.studentId || null;

    if (!courseIds.length) {
      return res.json({ items: [], summary: buildSummary([]) });
    }

    const submissionFilter = {
      workspaceId: { $in: courseIds },
      deleted: false,
    };
    const attemptFilter = {
      workspaceId: { $in: courseIds },
      deleted: false,
    };

    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({ message: "Invalid studentId" });
      }
      submissionFilter.studentId = studentId;
      attemptFilter.studentId = studentId;
    }

    const [submissions, attempts] = await Promise.all([
      Submission.find(submissionFilter)
        .populate("assignmentId", "title maxScore")
        .populate("studentId", userFields)
        .populate("workspaceId", "title")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean(),
      QuizAttempt.find(attemptFilter)
        .populate("quizId", "title totalPoints")
        .populate("studentId", userFields)
        .populate("workspaceId", "title")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    const items = [
      ...submissions.map((submission) => serializeSubmissionGradebook(submission)),
      ...attempts.map((attempt) => serializeQuizGradebook(attempt)),
    ].sort(sortByLatest);

    return res.json({
      items,
      summary: buildSummary(items),
    });
  } catch (error) {
    const status =
      /Invalid courseId/.test(error.message) || /Not allowed/.test(error.message)
        ? 403
        : 500;
    return res.status(status).json({
      message: "Failed to load gradebook",
      error: error.message,
    });
  }
}

export async function updateSubmissionGrade(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update grades" });
    }

    const { submissionId } = req.params;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const submission = await Submission.findOne({
      _id: submissionId,
      deleted: false,
    });
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const assignment = await Assignment.findById(submission.assignmentId).select(
      "_id workspace deleted",
    );
    if (!assignment || assignment.deleted) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const allowed = await canAccessCourse({ courseId: assignment.workspace, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to grade this submission" });
    }

    const feedback =
      req.body.feedback !== undefined
        ? String(req.body.feedback || "").trim()
        : submission.feedback;
    const hasGrade =
      req.body.grade !== undefined && req.body.grade !== null && req.body.grade !== "";
    const nextGrade = hasGrade
      ? Number(req.body.grade)
      : Number(submission.grade ?? submission.score ?? 0);

    if (Number.isNaN(nextGrade) || nextGrade < 0 || nextGrade > 100) {
      return res.status(400).json({ message: "grade must be between 0 and 100" });
    }

    submission.grade = nextGrade;
    submission.score = nextGrade;
    submission.feedback = feedback;
    submission.gradedBy = "TEACHER";
    submission.gradingStatus = "graded";
    submission.gradedAt = new Date();
    await submission.save();

    const fresh = await Submission.findById(submission._id)
      .populate("assignmentId", "title maxScore")
      .populate("studentId", userFields)
      .populate("workspaceId", "title")
      .lean();

    return res.json({
      message: "Submission grade updated",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update submission grade",
      error: error.message,
    });
  }
}

export async function updateQuizAttemptGrade(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update grades" });
    }

    const { attemptId } = req.params;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      deleted: false,
    });
    if (!attempt) {
      return res.status(404).json({ message: "Quiz attempt not found" });
    }

    const quiz = await Quiz.findById(attempt.quizId).select("_id workspace deleted");
    if (!quiz || quiz.deleted) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const allowed = await canAccessCourse({ courseId: quiz.workspace, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to grade this quiz attempt" });
    }

    const feedback =
      req.body.feedback !== undefined
        ? String(req.body.feedback || "").trim()
        : attempt.feedback || "";
    const hasScore =
      req.body.score !== undefined && req.body.score !== null && req.body.score !== "";
    const nextScore = hasScore ? Number(req.body.score) : Number(attempt.score ?? 0);

    if (Number.isNaN(nextScore) || nextScore < 0 || nextScore > 100) {
      return res.status(400).json({ message: "score must be between 0 and 100" });
    }

    attempt.score = nextScore;
    attempt.feedback = feedback;
    attempt.status = "graded";
    attempt.gradedAt = new Date();
    attempt.locked = true;
    await attempt.save();

    const fresh = await QuizAttempt.findById(attempt._id)
      .populate("quizId", "title totalPoints")
      .populate("studentId", userFields)
      .populate("workspaceId", "title")
      .lean();

    return res.json({
      message: "Quiz attempt updated",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update quiz attempt",
      error: error.message,
    });
  }
}
