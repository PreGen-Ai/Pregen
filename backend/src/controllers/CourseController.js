import mongoose from "mongoose";
import Course from "../models/CourseModel.js";
import Assignment from "../models/Assignment.js";
import Submission from "../models/Submission.js";
import CourseSection from "../models/CourseSectionModel.js";
import CourseActivity from "../models/CourseActivityModel.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const roleOf = (req) => (req.user?.role || "").toLowerCase();
const isAdminLike = (req) => ["admin", "superadmin"].includes(roleOf(req));

const userFields = "firstName lastName username email role user_code";

const isMemberOfCourse = async (courseId, userId) => {
  const course = await Course.findOne({
    _id: courseId,
    deleted: false,
    $or: [{ createdBy: userId }, { "members.user": userId }],
  }).select("_id");
  return !!course;
};

const escapeRegex = (s) =>
  String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");



/* ======================================================
   0. GET COURSE BY ID (member/admin only)
====================================================== */
export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?._id;

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const allowed =
      isAdminLike(req) || (await isMemberOfCourse(courseId, userId));

    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const course = await Course.findById(courseId)
      .populate("createdBy", userFields)
      .populate("members.user", userFields)
      .populate("sections")
      .populate("assignments", "title dueDate status")
      .populate("quizzes.quiz", "title dueDate status")
      .populate("documents"); // consider pagination later

    if (!course) return res.status(404).json({ message: "Course not found" });

    res.json(course);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch course", error: err.message });
  }
};

/* ======================================================
   1. CREATE COURSE (admin/teacher/superadmin)
====================================================== */
export const createCourse = async (req, res) => {
  const { title, description, visibility = "private" } = req.body;

  try {
    const role = roleOf(req);
    if (!["teacher", "admin", "superadmin"].includes(role)) {
      return res
        .status(403)
        .json({ message: "Only teachers/admins can create courses." });
    }

    const existing = await Course.findOne({ title, deleted: false });
    if (existing)
      return res.status(400).json({ message: "Course already exists." });

    const course = new Course({
      title,
      description,
      createdBy: req.user._id,
      visibility,
      type: "course",
      members: [{ user: req.user._id, role: "teacher" }],
    });

    await course.save();
    res.status(201).json(course);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create course", error: err.message });
  }
};

/* ======================================================
   2. CREATE ASSIGNMENT + LINK TO COURSE (teacher/admin)
====================================================== */
export const assignToCourse = async (req, res) => {
  try {
    const role = roleOf(req);
    if (!["teacher", "admin", "superadmin"].includes(role)) {
      return res
        .status(403)
        .json({ message: "Only teachers/admins can assign." });
    }

    const { courseId } = req.params;
    if (!isValidObjectId(courseId))
      return res.status(400).json({ message: "Invalid courseId" });

    const course = await Course.findById(courseId);
    if (!course || course.deleted)
      return res.status(404).json({ message: "Course not found" });

    // optional: ensure user is a member/owner
    const allowed =
      isAdminLike(req) ||
      course.createdBy.toString() === req.user._id.toString() ||
      course.members.some((m) => m.user.toString() === req.user._id.toString());

    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const assignment = await Assignment.create({
      title: req.body.title,
      description: req.body.description,
      dueDate: req.body.dueDate,
      teacher: req.user._id,
      workspace: courseId, // courseId used as workspace
      type: req.body.type || "text_submission",
      status: "published",
      assignedStudents: req.body.assignedStudents || [],
    });

    course.assignments.push(assignment._id);
    await course.save();

    res.json({ success: true, message: "Assignment created", assignment });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign", error: err.message });
  }
};

/* ======================================================
   3. SUBMIT ASSIGNMENT (use Submission collection) ✅ scalable
====================================================== */
export const uploadAssignmentSubmission = async (req, res) => {
  try {
    const role = roleOf(req);
    if (role !== "student")
      return res.status(403).json({ message: "Only students can submit." });

    const { assignmentId } = req.params;
    if (!isValidObjectId(assignmentId))
      return res.status(400).json({ message: "Invalid assignmentId" });

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment)
      return res.status(404).json({ message: "Assignment not found" });

    // prevent multiple submissions (basic)
    const existing = await Submission.findOne({
      assignmentId: assignment._id,
      studentId: req.user._id,
    });

    if (existing) {
      return res.status(400).json({ message: "Already submitted" });
    }

    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      path: f.path,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const submission = await Submission.create({
      assignmentId: assignment._id,
      workspaceId: assignment.workspace, // courseId
      studentId: req.user._id,
      files,
      submittedAt: new Date(),
      feedback: "",
      grade: null,
    });

    res.json({ success: true, message: "Submission uploaded", submission });
  } catch (err) {
    res.status(500).json({ message: "Failed to upload", error: err.message });
  }
};

/* ======================================================
   4. ADD ACTIVITY TO SECTION (teacher/admin)
====================================================== */
export const addActivityToSection = async (req, res) => {
  try {
    const role = roleOf(req);
    if (!["teacher", "admin", "superadmin"].includes(role)) {
      return res
        .status(403)
        .json({ message: "Only teachers/admins can add activities." });
    }

    const { courseId, sectionId } = req.params;
    const activityData = req.body;

    if (!isValidObjectId(courseId) || !isValidObjectId(sectionId)) {
      return res.status(400).json({ message: "Invalid courseId/sectionId" });
    }

    const course = await Course.findById(courseId);
    if (!course || course.deleted)
      return res.status(404).json({ message: "Course not found" });

    const section = await CourseSection.findById(sectionId);
    if (!section) return res.status(404).json({ message: "Section not found" });

    const activity = await CourseActivity.create({
      type: activityData.type,
      assignment: activityData.assignment || null,
      quiz: activityData.quiz || null,
      document: activityData.document || null,
      course: courseId,
      section: sectionId,
      visibility: activityData.visibility ?? true,
    });

    section.activities.push(activity._id);
    await section.save();

    res.json({ success: true, message: "Activity added", activity });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to add activity", error: err.message });
  }
};

/* ======================================================
   5. SEARCH COURSES (limit)
====================================================== */
export const searchCourses = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);

    const filter = { deleted: false };
    if (q)
      filter.title = {
        $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };

    const results = await Course.find(filter).limit(limit);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Failed to search", error: error.message });
  }
};

/* ======================================================
   6. GET COURSE ACTIVITY (correct counting)
====================================================== */
export const getCourseActivity = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidObjectId(courseId))
      return res.status(400).json({ message: "Invalid courseId" });

    const totalAssignments = await Assignment.countDocuments({
      workspace: courseId,
    });

    const totalSubmissions = await Submission.countDocuments({
      workspaceId: courseId,
    });

    res.json({
      courseId,
      totalAssignments,
      totalSubmissions,
      lastUpdated: new Date(),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch activity", error: error.message });
  }
};

/* ======================================================
   7. ARCHIVE COURSE (teacher/admin)
====================================================== */
export const setCourseArchived = async (req, res) => {
  try {
    const role = roleOf(req);
    if (!["teacher", "admin", "superadmin"].includes(role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    course.archived = !!req.body.archived;
    await course.save();

    res.json({
      message: `Course ${course.archived ? "archived" : "unarchived"} successfully`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update archive", error: error.message });
  }
};

/* ======================================================
   8. GET COURSES BY USER ID (correct query)
====================================================== */
export const getCoursesByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!isValidObjectId(userId))
      return res.status(400).json({ message: "Invalid userId" });

    const courses = await Course.find({
      deleted: false,
      $or: [{ createdBy: userId }, { "members.user": userId }],
    })
      .populate("members.user", userFields)
      .populate("assignments", "title dueDate status");

    res.json(courses);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch courses", error: error.message });
  }
};

/* ======================================================
   9. SOFT DELETE COURSE (admin/superadmin only)
====================================================== */
export const deleteCourse = async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return res.status(403).json({ message: "Only admins can delete" });
    }

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Not found" });

    course.deleted = true;
    await course.save();

    res.json({ success: true, message: "Course deleted", course });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete", error: error.message });
  }
};

/* ======================================================
   10. GET ALL COURSES (admin/superadmin)
   GET /api/courses
====================================================== */
export const getAllCourses = async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return res.status(403).json({ message: "Admins only" });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const q = (req.query.q || "").toString().trim();
    const includeDeleted = req.query.includeDeleted === "true";

    const filter = {};
    if (!includeDeleted) filter.deleted = false;

    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: safe, $options: "i" } },
        { name: { $regex: safe, $options: "i" } },
        { code: { $regex: safe, $options: "i" } },
      ];
    }

    const [total, courses] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", userFields)
        .populate("members.user", userFields)
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      courses,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch courses",
      error: err.message,
    });
  }
};

/* ======================================================
   NEW 1) GET MY COURSES LIST
   GET /api/courses/my-courses/list
   Auth required
====================================================== */
export const getMyCoursesList = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);

    const filter = {
      deleted: false,
      $or: [{ createdBy: userId }, { "members.user": userId }],
    };

    const [total, courses] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", userFields)
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      courses,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch my courses",
      error: err.message,
    });
  }
};

/* ======================================================
   NEW 2) SEARCH COURSES LIST
   GET /api/courses/search/list
   Auth required (internal search)
====================================================== */
export const searchCoursesList = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);

    const filter = { deleted: false };

    if (q) {
      const safe = escapeRegex(q);
      filter.$or = [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
      ];
    }

    const [total, courses] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("title description visibility archived createdBy updatedAt createdAt")
        .populate("createdBy", userFields)
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      courses,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to search courses",
      error: error.message,
    });
  }
};

/* ======================================================
   NEW 3) PUBLIC COURSES LIST
   GET /api/courses/public/list
   No auth required
====================================================== */
export const getPublicCoursesList = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);

    const filter = {
      deleted: false,
      archived: { $ne: true },
      visibility: "public",
    };

    if (q) {
      const safe = escapeRegex(q);
      filter.$or = [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
      ];
    }

    const [total, courses] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("title description visibility createdBy updatedAt createdAt")
        .populate("createdBy", userFields)
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      courses,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch public courses",
      error: error.message,
    });
  }
};

/* ======================================================
   NEW 4) SUBMIT ASSIGNMENT (assignmentId only)
   POST /api/courses/:assignmentId/submit
   Student only
====================================================== */
export const submitAssignmentById = async (req, res) => {
  try {
    const role = roleOf(req);
    if (role !== "student") {
      return res.status(403).json({ message: "Only students can submit." });
    }

    const { assignmentId } = req.params;
    if (!isValidObjectId(assignmentId)) {
      return res.status(400).json({ message: "Invalid assignmentId" });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const courseId = assignment.workspace; // you use workspace as courseId
    if (courseId && !isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid assignment workspace" });
    }

    // must be a member of the course unless admin-like (students are not admin-like anyway)
    const allowed = await isMemberOfCourse(courseId, req.user._id);
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const existing = await Submission.findOne({
      assignmentId: assignment._id,
      studentId: req.user._id,
    });

    if (existing) {
      return res.status(400).json({ message: "Already submitted" });
    }

    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      path: f.path,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const submission = await Submission.create({
      assignmentId: assignment._id,
      workspaceId: courseId,
      studentId: req.user._id,
      files,
      submittedAt: new Date(),
      feedback: "",
      grade: null,
    });

    return res.json({
      success: true,
      message: "Submission uploaded",
      submission,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to upload",
      error: err.message,
    });
  }
};

/* ======================================================
   NEW 5) LIST COURSE ASSIGNMENT SUBMISSIONS
   GET /api/courses/:courseId/assignments/submissions
   Teacher/Admin/Superadmin
====================================================== */
export const getSubmissionsForCourse = async (req, res) => {
  try {
    const role = roleOf(req);
    if (!["teacher", "admin", "superadmin"].includes(role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { courseId } = req.params;
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select("createdBy members deleted");
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed =
      isAdminLike(req) ||
      String(course.createdBy) === String(req.user._id) ||
      course.members?.some((m) => String(m.user) === String(req.user._id));

    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);

    const filter = { workspaceId: courseId };

    const [total, submissions] = await Promise.all([
      Submission.countDocuments(filter),
      Submission.find(filter)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("studentId", userFields)
        .populate("assignmentId", "title dueDate status")
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      submissions,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch submissions",
      error: err.message,
    });
  }
};