// backend/controllers/analyticsController.js
import mongoose from "mongoose";
import User from "../models/userModel.js";
import Quiz from "../models/quiz.js";
import Submission from "../models/Submission.js";
import Workspace from "../models/CourseModel.js";

/**
 * ==========================================================
 * 📊 ANALYTICS CONTROLLER — MODEL-A FINAL
 * ==========================================================
 * Fully aligned with frontend analyticsApi.js:
 *   ✔ getStudentAnalytics (root analytics)
 *   ✔ getStudentPerformance
 *   ✔ getWeakAreas
 *   ✔ getTimeline
 *   ✔ getRecommendations
 *   ✔ getSessions
 *   ✔ getCategoryPerformance
 *   ✔ getWorkspaceAnalytics
 *   ✔ getUserStatistics
 * ==========================================================
 */

/* ----------------------------------------------------------
   1️⃣ ROOT STUDENT ANALYTICS
   GET /api/analytics/students/:studentId
---------------------------------------------------------- */
export const getStudentAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    console.log("📌 Incoming student analytics request:", studentId);

    // SAFE lookup conditions (no ObjectId crash)
    const conditions = [
      { student_id: studentId }, // students
      { teacherId: studentId }, // teachers
      { user_id: studentId }, // admins
      { username: studentId }, // login usernames
    ];

    // Only include _id match if a VALID ObjectId
    if (mongoose.Types.ObjectId.isValid(studentId)) {
      conditions.push({ _id: new mongoose.Types.ObjectId(studentId) });
    }

    console.log("🔍 Search conditions:", conditions);

    const user = await User.findOne({ $or: conditions });

    if (!user) {
      console.log("❌ Student not found:", studentId);
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    console.log("✅ Student resolved:", {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      student_id: user.student_id,
    });

    // Determine the submission key (based on role)
    let key =
      user.student_id || user.teacherId || user.user_id || user.username;

    console.log("📌 Submissions key:", key);

    const submissions = await Submission.find({ student_id: key });

    const total = submissions.length;
    const avgScore =
      total > 0
        ? Math.round(
            submissions.reduce((a, b) => a + (b.score || 0), 0) / total,
          )
        : 0;

    const totalQuizzesCreated = await Quiz.countDocuments({
      createdBy: user._id,
    });

    return res.json({
      success: true,
      student: {
        id: user._id,
        username: user.username,
        fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        email: user.email,
        role: user.role,
      },
      analytics: {
        totalSubmissions: total,
        averageScore: avgScore,
        totalQuizzesCreated,
      },
    });
  } catch (err) {
    console.error("❌ getStudentAnalytics Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student analytics",
    });
  }
};

/* ----------------------------------------------------------
   2️⃣ HIGH-LEVEL STUDENT PERFORMANCE
   GET /api/analytics/students/:id/performance
---------------------------------------------------------- */
export const getStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;

    const submissions = await Submission.find({ student_id: studentId });

    if (!submissions.length) {
      return res.json({
        averageScore: 0,
        totalQuizzes: 0,
        totalSubmissions: 0,
        improvement: 0,
      });
    }

    const avg =
      submissions.reduce((a, b) => a + (b.score || 0), 0) / submissions.length;

    // Recent improvement
    const last5 = submissions.slice(-5);
    const last5avg =
      last5.reduce((a, b) => a + (b.score || 0), 0) / last5.length;

    const prev5 = submissions.slice(-10, -5);
    const prev5avg =
      prev5.length > 0
        ? prev5.reduce((a, b) => a + (b.score || 0), 0) / prev5.length
        : last5avg;

    res.json({
      averageScore: Math.round(avg),
      totalQuizzes: submissions.length,
      totalSubmissions: submissions.length,
      improvement: Math.round(last5avg - prev5avg),
    });
  } catch (err) {
    console.error("❌ getStudentPerformance Error:", err);
    res.status(500).json({
      message: "Failed to load student performance",
    });
  }
};

/* ----------------------------------------------------------
   3️⃣ WEAK AREAS
   GET /api/analytics/students/:id/weak-areas
---------------------------------------------------------- */
export const getWeakAreas = async (req, res) => {
  try {
    const { studentId } = req.params;

    const submissions = await Submission.find({ student_id: studentId });

    if (!submissions.length) return res.json({ weak_areas: [] });

    const categories = {};

    submissions.forEach((s) => {
      if (!s.category) return;
      if (!categories[s.category]) categories[s.category] = [];
      categories[s.category].push(s.score || 0);
    });

    const ranking = Object.entries(categories)
      .map(([category, scores]) => ({
        category,
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
        recommendation: "Focus more on this topic",
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    res.json({ weak_areas: ranking });
  } catch (err) {
    console.error("❌ getWeakAreas Error:", err);
    res.status(500).json({
      message: "Failed to load weak areas",
    });
  }
};

/* ----------------------------------------------------------
   4️⃣ TIMELINE
   GET /api/analytics/students/:id/timeline
---------------------------------------------------------- */
export const getTimeline = async (req, res) => {
  try {
    const { studentId } = req.params;

    const timeline = await Submission.aggregate([
      { $match: { student_id: studentId } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          average_score: { $avg: "$score" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      timeline: timeline.map((t) => ({
        date: t._id,
        average_score: Math.round(t.average_score),
        trend: "neutral",
      })),
    });
  } catch (err) {
    console.error("❌ getTimeline Error:", err);
    res.status(500).json({
      message: "Failed to load timeline",
    });
  }
};

/* ----------------------------------------------------------
   5️⃣ AI RECOMMENDATIONS
   GET /api/analytics/students/:id/recommendations
---------------------------------------------------------- */
export const getRecommendations = async (req, res) => {
  try {
    res.json({
      recommendations: [
        {
          title: "Revise Weak Areas",
          description: "Focus on your lowest performing subjects.",
          resources: ["https://khanacademy.org"],
        },
        {
          title: "Practice More Quizzes",
          description: "Daily practice increases retention.",
        },
      ],
    });
  } catch (err) {
    console.error("❌ getRecommendations Error:", err);
    res.status(500).json({
      message: "Failed to load recommendations",
    });
  }
};

/* ----------------------------------------------------------
   6️⃣ STUDY SESSIONS
   GET /api/analytics/students/:id/sessions
---------------------------------------------------------- */
export const getSessions = async (req, res) => {
  try {
    const { studentId } = req.params;

    const sessions = await Submission.aggregate([
      { $match: { student_id: studentId } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          duration: { $sum: "$time_spent" },
          average_score: { $avg: "$score" },
          topics: { $addToSet: "$category" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 7 },
    ]);

    res.json({
      sessions: sessions.map((s) => ({
        date: s._id,
        duration: s.duration || 0,
        topics: s.topics || [],
        average_score: Math.round(s.average_score || 0),
        efficiency: Math.round((s.average_score || 0) / 100),
      })),
    });
  } catch (err) {
    console.error("❌ getSessions Error:", err);
    res.status(500).json({
      message: "Failed to load study sessions",
    });
  }
};

/* ----------------------------------------------------------
   7️⃣ CATEGORY PERFORMANCE
   GET /api/analytics/students/:id/categories/:category
---------------------------------------------------------- */
export const getCategoryPerformance = async (req, res) => {
  try {
    const { studentId, category } = req.params;

    const submissions = await Submission.find({
      student_id: studentId,
      category,
    });

    if (!submissions.length)
      return res.json({
        attempts: 0,
        averageScore: 0,
        scores: [],
      });

    const avg =
      submissions.reduce((a, b) => a + (b.score || 0), 0) / submissions.length;

    res.json({
      category,
      attempts: submissions.length,
      averageScore: Math.round(avg),
      scores: submissions.map((s) => s.score),
    });
  } catch (err) {
    console.error("❌ getCategoryPerformance Error:", err);
    res.status(500).json({
      message: "Failed to load category performance",
    });
  }
};

/* ----------------------------------------------------------
   8️⃣ WORKSPACE ANALYTICS
---------------------------------------------------------- */
export const getWorkspaceAnalytics = async (req, res) => {
  try {
    const analytics = await Workspace.aggregate([
      {
        $group: {
          _id: "$subject",
          totalStudents: { $sum: 1 },
          avgProgress: { $avg: "$progress" },
        },
      },
      { $sort: { totalStudents: -1 } },
    ]);

    res.json(analytics);
  } catch (err) {
    console.error("❌ getWorkspaceAnalytics Error:", err);
    res.status(500).json({
      message: "Failed to load workspace analytics",
    });
  }
};

/* ----------------------------------------------------------
   9️⃣ PLATFORM-WIDE USER STATS
---------------------------------------------------------- */
export const getUserStatistics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: "student" });
    const totalTeachers = await User.countDocuments({ role: "teacher" });
    const totalAdmins = await User.countDocuments({ role: "admin" });

    res.json({
      totalUsers,
      totalStudents,
      totalTeachers,
      totalAdmins,
    });
  } catch (err) {
    console.error("❌ getUserStatistics Error:", err);
    res.status(500).json({
      message: "Failed to load user statistics",
    });
  }
};
