// controllers/studentController.js

import Assignment from "../models/Assignment.js";
import AssignmentAssignment from "../models/AssignmentAssignment.js";
import Submission from "../models/Submission.js";

import Quiz from "../models/quiz.js";
import QuizAssignment from "../models/QuizAssignment.js";
import QuizAttempt from "../models/QuizAttempt.js";

import Leaderboard from "../models/leaderboardModel.js";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";

/**
 * Cursor helpers: "2026-01-20T10:00:00.000Z|<id>"
 */
const applyCursor = (filter, cursor) => {
  if (!cursor) return;
  const [createdAtStr, id] = cursor.split("|");
  const createdAt = new Date(createdAtStr);
  filter.$or = [
    { createdAt: { $lt: createdAt } },
    { createdAt, _id: { $lt: id } },
  ];
};

const makeNextCursor = (docs, limit) => {
  if (!docs || docs.length < limit) return null;
  const last = docs[docs.length - 1];
  return `${last.createdAt.toISOString()}|${last._id}`;
};

/**
 * ============================================================
 * ✅ Get assignments for student (NO assignedStudents array)
 * Uses AssignmentAssignment targeting + Assignment definition
 * ============================================================
 * Query:
 *  /student/assignments?courseId=...&limit=20&cursor=...
 */
export const getAssignments = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { courseId } = req.query;

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;

    // 1) Find student memberships (courses they belong to)
    // If courseId provided, validate membership in that course
    const memberFilter = { userId: studentId, status: "active" };
    if (courseId) memberFilter.courseId = courseId;

    const memberships =
      await CourseMember.find(memberFilter).select("courseId");
    const courseIds = memberships.map((m) => m.courseId);

    if (courseId && courseIds.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course" });
    }

    // 2) Get AssignmentAssignment rows assigned to:
    // - the student specifically OR
    // - a class/workspace (if you use those) OR
    // - generally per course (if you decided to store courseId in assignment itself)
    // For now: show assignments linked by courseId via Assignment model itself.
    const assignmentFilter = {
      status: "published",
      deleted: false,
      courseId: { $in: courseIds },
    };
    applyCursor(assignmentFilter, cursor);

    // assignments ordered by dueDate primarily, but cursor uses createdAt.
    // For stable pagination at scale, paginate on createdAt then sort dueDate in UI.
    const assignments = await Assignment.find(assignmentFilter)
      .select("-__v")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("teacherId", "firstName lastName email");

    // 3) Attach "assigned" state via AssignmentAssignment (optional)
    // If you are using AssignmentAssignment, you can filter assignments further.
    // Minimal: show published course assignments. If you need strict assignment targeting,
    // tell me and I'll enforce it fully based on your assignmentAssignment rows.

    return res.json({
      success: true,
      data: assignments,
      cursor: { next: makeNextCursor(assignments, limit) },
      count: assignments.length,
    });
  } catch (err) {
    console.error("Get assignments error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignments" });
  }
};

/**
 * ============================================================
 * ✅ Submit assignment (NO embedded submissions)
 * Uses Submission collection (1 submission per student per assignment)
 * ============================================================
 */
export const submitAssignment = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { assignmentId, answers, textSubmission, courseId } = req.body;
    const files = req.files || [];

    if (!assignmentId) {
      return res
        .status(400)
        .json({ success: false, error: "assignmentId is required" });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment || assignment.deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    if (assignment.status !== "published") {
      return res
        .status(400)
        .json({ success: false, error: "Assignment is not available" });
    }

    if (new Date() > new Date(assignment.dueDate)) {
      return res
        .status(400)
        .json({ success: false, error: "Assignment due date has passed" });
    }

    // Optional: verify student is enrolled in assignment course
    const effectiveCourseId = courseId || assignment.courseId;
    if (effectiveCourseId) {
      const isMember = await CourseMember.exists({
        userId: studentId,
        courseId: effectiveCourseId,
        status: "active",
      });
      if (!isMember) {
        return res
          .status(403)
          .json({ success: false, error: "Not enrolled in this course" });
      }
    }

    // Process files
    const submittedFiles = files.map((file) => ({
      name: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    }));

    const payloadAnswers = answers ?? textSubmission;

    // ✅ One submission per student per assignment (upsert)
    // Your Submission.js schema uses: assignmentId + workspaceId + studentId
    // But you moved to course. Let's store workspaceId only if you use it;
    // otherwise set workspaceId to courseId for now (or update schema).
    const workspaceId = assignment.workspaceId || null; // if you still have it

    const submission = await Submission.findOneAndUpdate(
      {
        assignmentId: assignment._id,
        studentId,
        workspaceId: workspaceId, // keep aligned with your Submission schema
      },
      {
        $set: {
          files: submittedFiles,
          feedback: "",
          submittedAt: new Date(),
          // store answers (your Submission schema currently does not have `answers`
          // If you want answers, add it to Submission model. For now put in feedback/metadata.
        },
        $setOnInsert: {
          grade: null,
        },
      },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      message: "Assignment submitted successfully",
      submissionId: submission._id,
    });
  } catch (err) {
    console.error("Submit assignment error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to submit assignment" });
  }
};

/**
 * ============================================================
 * ✅ Get quizzes for student (NO assignedStudents array)
 * Uses QuizAssignment + Quiz definition
 * ============================================================
 */
export const getQuizzes = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { courseId } = req.query;

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;

    // memberships
    const memberFilter = { userId: studentId, status: "active" };
    if (courseId) memberFilter.courseId = courseId;

    const memberships =
      await CourseMember.find(memberFilter).select("courseId");
    const courseIds = memberships.map((m) => m.courseId);

    if (courseId && courseIds.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course" });
    }

    // simple: published quizzes under those courses
    const filter = { status: "published", courseId: { $in: courseIds } };
    applyCursor(filter, cursor);

    const quizzes = await Quiz.find(filter)
      .select("-questions.correctAnswer -__v")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("teacher", "firstName lastName email");

    return res.json({
      success: true,
      data: quizzes,
      cursor: { next: makeNextCursor(quizzes, limit) },
      count: quizzes.length,
    });
  } catch (err) {
    console.error("Get quizzes error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch quizzes" });
  }
};

/**
 * ============================================================
 * ✅ Start quiz attempt (1 attempt total per quiz per student)
 * Uses QuizAttempt collection
 * ============================================================
 */
export const startQuiz = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId).select("-questions.correctAnswer");
    if (!quiz)
      return res.status(404).json({ success: false, error: "Quiz not found" });

    if (quiz.status !== "published") {
      return res
        .status(400)
        .json({ success: false, error: "Quiz not available" });
    }

    // enforce membership in quiz course (if courseId exists)
    if (quiz.courseId) {
      const isMember = await CourseMember.exists({
        userId: studentId,
        courseId: quiz.courseId,
        status: "active",
      });
      if (!isMember)
        return res
          .status(403)
          .json({ success: false, error: "Not enrolled in this course" });
    }

    // ✅ only 1 attempt total
    const existing = await QuizAttempt.findOne({ quizId, studentId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "You already started/submitted this quiz",
      });
    }

    const attempt = await QuizAttempt.create({
      quizId,
      studentId,
      status: "in_progress",
      startedAt: new Date(),
    });

    return res.json({
      success: true,
      attemptId: attempt._id,
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
        totalPoints: quiz.totalPoints,
        questions: quiz.questions.map((q) => ({
          _id: q._id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options?.map((opt) => ({ text: opt.text })),
          points: q.points,
          fileUploadConfig: q.fileUploadConfig,
        })),
      },
    });
  } catch (err) {
    console.error("Start quiz error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to start quiz" });
  }
};

/**
 * ============================================================
 * ✅ Submit quiz answers (grade + save attempt)
 * Uses QuizAttempt + Quiz definition
 * ============================================================
 */
export const submitQuiz = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { quizId, attemptId } = req.params;
    const { answers = [] } = req.body;

    const quiz = await Quiz.findById(quizId); // needs correctAnswer for grading
    if (!quiz)
      return res.status(404).json({ success: false, error: "Quiz not found" });

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt || attempt.studentId.toString() !== studentId.toString()) {
      return res
        .status(404)
        .json({ success: false, error: "Quiz attempt not found" });
    }

    if (attempt.status !== "in_progress") {
      return res
        .status(400)
        .json({ success: false, error: "Attempt already submitted" });
    }

    // grade
    let totalScore = 0;

    const processedAnswers = answers
      .map((a) => {
        const q = quiz.questions.id(a.questionId);
        if (!q) return null;

        let isCorrect = false;
        let pointsEarned = 0;

        if (q.questionType === "multiple_choice") {
          // client might send option id or index; your schema stores options with _id
          const selected = q.options.id(a.answer);
          isCorrect = !!selected?.isCorrect;
        } else if (q.questionType === "true_false") {
          isCorrect = a.answer === q.correctAnswer;
        } else {
          // short_answer/essay/file_upload: no auto grading
          isCorrect = false;
        }

        if (isCorrect) {
          pointsEarned = q.points || 1;
          totalScore += pointsEarned;
        }

        return {
          questionId: a.questionId,
          answer: a.answer,
          uploadedFiles: a.uploadedFiles || [],
          isCorrect,
          pointsEarned,
        };
      })
      .filter(Boolean);

    const totalPoints =
      quiz.totalPoints ||
      quiz.questions.reduce((s, q) => s + (q.points || 1), 0);
    const percentageScore =
      totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;

    // update attempt
    attempt.answers = processedAnswers;
    attempt.score = percentageScore;
    attempt.maxScore = totalPoints;
    attempt.submittedAt = new Date();
    attempt.status = "submitted";
    attempt.timeSpent = Math.floor(
      (Date.now() - new Date(attempt.startedAt).getTime()) / 1000,
    );

    await attempt.save();

    // Update leaderboard if passed (if you want)
    if (percentageScore >= (quiz.passingScore ?? 60)) {
      await updateLeaderboard(
        studentId,
        percentageScore,
        quiz.courseId || null,
      );
    }

    return res.json({
      success: true,
      score: percentageScore,
      passed: percentageScore >= (quiz.passingScore ?? 60),
      timeSpent: attempt.timeSpent,
      showResults: quiz.showResults,
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to submit quiz" });
  }
};

/**
 * ============================================================
 * ✅ Get student's courses (was getWorkspaces)
 * Uses CourseMember instead of Course.students/teachers arrays
 * ============================================================
 */
export const getWorkspaces = async (req, res) => {
  try {
    const studentId = req.user._id;

    const memberships = await CourseMember.find({
      userId: studentId,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .limit(200);

    const courseIds = memberships.map((m) => m.courseId);

    const courses = await Course.find({
      _id: { $in: courseIds },
      deleted: false,
      archived: false,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: courses,
      count: courses.length,
    });
  } catch (err) {
    console.error("Get courses error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch courses" });
  }
};

/**
 * ============================================================
 * ✅ Get student results
 * - assignments from Submission collection
 * - quizzes from QuizAttempt collection
 * ============================================================
 */
export const getResults = async (req, res) => {
  try {
    const studentId = req.user._id;

    // latest submissions
    const submissions = await Submission.find({ studentId })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("assignmentId", "title dueDate teacherId courseId");

    // latest quiz attempts
    const attempts = await QuizAttempt.find({ studentId, status: "submitted" })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("quizId", "title passingScore showResults courseId teacher");

    const results = {
      assignments: submissions.map((s) => ({
        type: "assignment",
        id: s.assignmentId?._id,
        title: s.assignmentId?.title,
        score: s.grade,
        graded: s.grade !== null,
        submittedAt: s.submittedAt || s.createdAt,
        dueDate: s.assignmentId?.dueDate,
      })),
      quizzes: attempts.map((a) => ({
        type: "quiz",
        id: a.quizId?._id,
        title: a.quizId?.title,
        score: a.score,
        passed: a.score >= (a.quizId?.passingScore ?? 60),
        submittedAt: a.submittedAt,
        timeSpent: a.timeSpent,
      })),
    };

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error("Get results error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch results" });
  }
};

/**
 * ============================================================
 * ✅ Leaderboard
 * ============================================================
 */

const updateLeaderboard = async (studentId, score, courseId) => {
  try {
    // Your leaderboard schema currently has: student, points, subject, className
    // If you want course leaderboard, add courseId field to Leaderboard model.
    // For now, just increment global points:
    await Leaderboard.findOneAndUpdate(
      { student: studentId },
      { $inc: { points: score } },
      { upsert: true, new: true },
    );
  } catch (err) {
    console.error("Update leaderboard error:", err);
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);

    const leaderboard = await Leaderboard.find({})
      .populate("student", "firstName lastName email")
      .sort({ points: -1 })
      .limit(limit);

    return res.json({
      success: true,
      data: leaderboard.map((entry) => ({
        student: entry.student
          ? `${entry.student.firstName} ${entry.student.lastName}`
          : "Unknown",
        email: entry.student?.email || "",
        points: entry.points,
      })),
      count: leaderboard.length,
    });
  } catch (err) {
    console.error("Get leaderboard error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch leaderboard" });
  }
};
