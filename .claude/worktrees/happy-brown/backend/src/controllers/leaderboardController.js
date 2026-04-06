// controllers/leaderboardController.js
import Leaderboard from "../models/leaderboardModel.js";

/**
 * ============================================================
 *  GET LEADERBOARD
 * ============================================================
 *
 * Retrieve leaderboard sorted by points (descending).
 *
 *  Optional filters:
 *   ?subject=Math
 *   ?className=Grade10A
 *
 *  Pagination:
 *   ?limit=10&cursor=100|<id>
 *
 * cursor format: "points|_id"
 *
 * Example:
 *   GET /leaderboard?subject=Math&limit=10
 *   GET /leaderboard?cursor=450|65af2c...&limit=10
 */
export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
    const { subject, className, cursor } = req.query;

    const filter = {};

    //  Optional filters
    if (subject) filter.subject = subject;
    if (className) filter.className = className;

    //  Cursor pagination (points desc, _id desc)
    // cursor = "points|_id"
    if (cursor) {
      const [pointsStr, id] = cursor.split("|");
      const points = Number(pointsStr);

      if (!Number.isNaN(points) && id) {
        filter.$or = [
          { points: { $lt: points } },
          { points: points, _id: { $lt: id } },
        ];
      }
    }

    const leaderboard = await Leaderboard.find(filter)
      .populate("student", "firstName lastName username email user_code")
      .sort({ points: -1, _id: -1 })
      .limit(limit);

    //  Build next cursor
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
        student: entry.student
          ? {
              _id: entry.student._id,
              firstName: entry.student.firstName,
              lastName: entry.student.lastName,
              username: entry.student.username,
              email: entry.student.email,
              user_code: entry.student.user_code,
            }
          : null,
        createdAt: entry.createdAt,
      })),
      cursor: { next: nextCursor },
      count: leaderboard.length,
    });
  } catch (err) {
    console.error(" Get leaderboard error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch leaderboard",
    });
  }
};
