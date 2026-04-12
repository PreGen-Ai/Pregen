import Leaderboard from "../models/leaderboardModel.js";
import { getRequestTenantId, isValidObjectId } from "../utils/academicContract.js";

export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
    const { subject, className, cursor } = req.query;
    const tenantId = getRequestTenantId(req);

    const filter = {
      deleted: false,
      ...(tenantId ? { tenantId } : {}),
    };

    if (subject) filter.subject = String(subject).trim();
    if (className) filter.className = String(className).trim();
    if (req.query.courseId && isValidObjectId(req.query.courseId)) {
      filter.courseId = req.query.courseId;
    }

    if (cursor) {
      const [pointsStr, id] = String(cursor).split("|");
      const points = Number(pointsStr);

      if (!Number.isNaN(points) && id) {
        filter.$or = [
          { points: { $lt: points } },
          { points, _id: { $lt: id } },
        ];
      }
    }

    const leaderboard = await Leaderboard.find(filter)
      .populate("studentId", "firstName lastName username email user_code")
      .sort({ points: -1, _id: -1 })
      .limit(limit);

    const nextCursor =
      leaderboard.length === limit
        ? `${leaderboard[leaderboard.length - 1].points}|${leaderboard[leaderboard.length - 1]._id}`
        : null;

    return res.json({
      success: true,
      data: leaderboard.map((entry) => ({
        _id: entry._id,
        points: entry.points,
        subject: entry.subject || null,
        className: entry.className || null,
        student: entry.studentId
          ? {
              _id: entry.studentId._id,
              firstName: entry.studentId.firstName,
              lastName: entry.studentId.lastName,
              username: entry.studentId.username,
              email: entry.studentId.email,
              user_code: entry.studentId.user_code,
            }
          : null,
        createdAt: entry.createdAt,
      })),
      cursor: { next: nextCursor },
      count: leaderboard.length,
    });
  } catch (err) {
    console.error("Get leaderboard error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch leaderboard",
    });
  }
};
