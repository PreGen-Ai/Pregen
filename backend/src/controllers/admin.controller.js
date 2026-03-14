import User from "../models/userModel.js";
import Assignment from "../models/Assignment.js";
import AIUsageLog from "../models/aiUsage.js";
import AuditLog from "../models/AuditLog.js";

/**
 * Merchant Admin dashboard overview.
 * Answers in 5 seconds:
 * - students/teachers/users
 * - assignments graded by AI this week
 * - avg score (tenant)
 * - AI calls (today / week)
 * - estimated teacher time saved (rough)
 */
export async function getMerchantOverview(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [usersCount, teachersCount, studentsCount] = await Promise.all([
      User.countDocuments({ tenantId, disabled: false }),
      User.countDocuments({ tenantId, role: "TEACHER", disabled: false }),
      User.countDocuments({ tenantId, role: "STUDENT", disabled: false }),
    ]);

    const [aiCallsToday, aiCallsWeek] = await Promise.all([
      AIUsageLog.countDocuments({
        tenantId,
        timestamp: { $gte: startOfToday },
      }),
      AIUsageLog.countDocuments({ tenantId, timestamp: { $gte: startOfWeek } }),
    ]);

    const aiGradedThisWeek = await Assignment.countDocuments({
      tenantId,
      gradedByAI: true,
      gradedAt: { $gte: startOfWeek },
    });

    const avgScoreAgg = await Assignment.aggregate([
      { $match: { tenantId, score: { $gt: 0 } } },
      { $group: { _id: null, avgScore: { $avg: "$score" } } },
    ]);

    const avgScore = Math.round((avgScoreAgg?.[0]?.avgScore || 0) * 10) / 10;

    // Basic time saved estimate:
    // assume AI-graded assignment saves 6 minutes of teacher time.
    const teacherTimeSavedMinutes = aiGradedThisWeek * 6;

    res.json({
      users: usersCount,
      teachers: teachersCount,
      students: studentsCount,

      assignmentsGradedByAIThisWeek: aiGradedThisWeek,
      avgScore,

      aiCallsToday,
      aiCallsWeek,

      teacherTimeSavedMinutes,
    });
  } catch (e) {
    next(e);
  }
}

export async function getMerchantRecentLogs(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const logs = await AuditLog.find({ tenantId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json(logs);
  } catch (e) {
    next(e);
  }
}
