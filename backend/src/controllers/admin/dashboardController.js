import Classroom from "../../models/Classroom.js";
import AIUsageLog from "../../models/aiUsage.js";
import Submission from "../../models/Submission.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

// Use your existing User model path if different:
import User from "../../models/userModel.js";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getDashboardMetrics(req, res) {
  try {
    const tenantId = getTenantId(req);

    const tenantFilter = tenantId ? { tenantId } : {};
    const baseUserFilter = tenantId ? { tenantId } : {};

    const [students, teachers, classes] = await Promise.all([
      User.countDocuments({
        ...baseUserFilter,
        role: "STUDENT",
        deletedAt: { $in: [null, undefined] },
      }),
      User.countDocuments({
        ...baseUserFilter,
        role: "TEACHER",
        deletedAt: { $in: [null, undefined] },
      }),
      Classroom.countDocuments({ ...tenantFilter, deletedAt: null }),
    ]);

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const aiUsageTodayAgg = await AIUsageLog.aggregate([
      { $match: { ...tenantFilter, createdAt: { $gte: startToday } } },
      { $group: { _id: null, requests: { $sum: "$requests" } } },
    ]);

    const aiUsageToday = aiUsageTodayAgg?.[0]?.requests || 0;

    const aiGraded7d = await Submission.countDocuments({
      ...tenantFilter,
      gradedBy: "AI",
      gradedAt: { $gte: daysAgo(7) },
    });

    const avgAgg = await Submission.aggregate([
      {
        $match: {
          ...tenantFilter,
          gradedAt: { $ne: null },
          createdAt: { $gte: daysAgo(30) },
        },
      },
      { $group: { _id: null, avgScore: { $avg: "$score" } } },
    ]);
    const avgPerformance = Math.round(avgAgg?.[0]?.avgScore || 0);

    const savedAgg = await Submission.aggregate([
      {
        $match: {
          ...tenantFilter,
          gradedBy: "AI",
          gradedAt: { $gte: daysAgo(30) },
        },
      },
      { $group: { _id: null, seconds: { $sum: "$timeSavedSeconds" } } },
    ]);
    const teacherTimeSavedHrs =
      Math.round(((savedAgg?.[0]?.seconds || 0) / 3600) * 10) / 10;

    return res.json({
      students,
      teachers,
      classes,
      aiGraded7d,
      aiUsageToday,
      avgPerformance,
      teacherTimeSavedHrs,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to load dashboard metrics", error: String(e) });
  }
}
