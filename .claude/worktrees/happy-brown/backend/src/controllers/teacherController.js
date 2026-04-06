// controllers/teacherController.js
import Assignment from "../models/Assignment.js"; // use the refactored Assignment model
import AssignmentAssignment from "../models/AssignmentAssignment.js"; //  new
import Quiz from "../models/quiz.js"; // or "../models/Quiz.js" if you refactored Quiz too
import QuizAssignment from "../models/QuizAssignment.js"; // if you added it
import CourseActivity from "../models/CourseActivityModel.js"; // optional: activity feed

/**
 * Small helper: cursor pagination
 * cursor format: "2026-01-20T10:00:00.000Z|<id>"
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
 *  Create assignment (scalable)
 * - Assignment = definition + rules
 * - AssignmentAssignment = targets (class/workspace/student)
 * ============================================================
 */
export const createAssignment = async (req, res) => {
  try {
    // ✅ Only teacher/admin/superadmin should create (adjust based on your policy)
    if (
      !req.user ||
      !["teacher", "admin", "superadmin"].includes(req.user.role)
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const {
      title,
      description,
      instructions,
      dueDate,

      workspaceId,
      classId,
      courseId,

      type,
      maxScore,
      allowedFileTypes,
      maxFileSize,
      maxFiles,

      // NEW: assignment targets
      // You can pass one of:
      // - assignToStudentIds: ["..."]
      // - assignToClassId: "..."
      // - assignToWorkspaceId: "..."
      assignToStudentIds = [],
      assignToClassId = null,
      assignToWorkspaceId = null,

      // optional override for per-target dueDate
      targetDueDate = null,
    } = req.body;

    if (!title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "title, description, dueDate are required",
      });
    }

    // Files
    const files = req.files || [];
    const materials = files.map((file) => ({
      filename: file.filename,
      filePath: file.path, // consider storing storage key instead
      originalName: file.originalname,
      fileType: file.mimetype,
      uploadedAt: new Date(),
    }));

    // Create assignment definition
    const assignment = await Assignment.create({
      title,
      description,
      instructions,
      dueDate,
      teacherId: req.user._id,

      workspaceId: workspaceId || null,
      classId: classId || null,
      courseId: courseId || null,

      type: type || "text_submission",
      maxScore: maxScore || 100,
      allowedFileTypes: allowedFileTypes || [],
      maxFileSize: maxFileSize || 10,
      maxFiles: maxFiles || 5,

      materials,
      status: "published",
    });

    // Create assignment targets (no unbounded arrays)
    const targets = [];

    // If explicitly assigned to students
    if (Array.isArray(assignToStudentIds) && assignToStudentIds.length > 0) {
      for (const studentId of assignToStudentIds) {
        targets.push({
          assignmentId: assignment._id,
          studentId,
          classId: assignToClassId || classId || null,
          workspaceId: assignToWorkspaceId || workspaceId || null,
          dueDate: targetDueDate ? new Date(targetDueDate) : new Date(dueDate),
        });
      }
    } else {
      // otherwise assign to class or workspace (one row)
      targets.push({
        assignmentId: assignment._id,
        classId: assignToClassId || classId || null,
        workspaceId: assignToWorkspaceId || workspaceId || null,
        dueDate: targetDueDate ? new Date(targetDueDate) : new Date(dueDate),
      });
    }

    // Upsert-safe insert (prevents duplicates)
    // If you expect lots of targets, use bulkWrite
    if (targets.length > 0) {
      await AssignmentAssignment.insertMany(targets, { ordered: false }).catch(
        (e) => {
          // ignore duplicates (E11000) if re-sent
          if (e?.code !== 11000) throw e;
        },
      );
    }

    // Optional: add activity feed (if you use CourseActivity)
    if (courseId) {
      await CourseActivity.create({
        type: "assignment",
        userId: req.user._id,
        courseId,
        sectionId: null,
        assignmentId: assignment._id,
        visibility: true,
      });
    }

    return res.status(201).json({
      success: true,
      data: assignment,
      message: "Assignment created successfully",
    });
  } catch (err) {
    console.error("Create assignment error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create assignment",
    });
  }
};

/**
 * ============================================================
 *  Get teacher's assignments and quizzes (paginated)
 * - no scans
 * - cursor pagination
 * ============================================================
 */
export const getTeacherContent = async (req, res) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    // Pagination params
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    // You can paginate assignments and quizzes independently
    const assignmentCursor = req.query.assignmentCursor || null;
    const quizCursor = req.query.quizCursor || null;

    // Filters
    const assignmentsFilter = { teacherId: req.user._id, deleted: false };
    const quizzesFilter = { teacher: req.user._id, deleted: false }; // adjust if your Quiz model uses teacherId

    applyCursor(assignmentsFilter, assignmentCursor);
    applyCursor(quizzesFilter, quizCursor);

    const assignments = await Assignment.find(assignmentsFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    const quizzes = await Quiz.find(quizzesFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    return res.json({
      success: true,
      data: {
        assignments,
        quizzes,
      },
      cursors: {
        nextAssignmentCursor: makeNextCursor(assignments, limit),
        nextQuizCursor: makeNextCursor(quizzes, limit),
      },
      counts: {
        assignments: assignments.length,
        quizzes: quizzes.length,
      },
    });
  } catch (err) {
    console.error("Get teacher content error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch teacher content",
    });
  }
};
