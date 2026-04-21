import AIUsageLog from "../../models/aiUsage.js";
import Submission from "../../models/Submission.js";
import { getTenantId } from "../../middleware/authMiddleware.js";
import { getAdminAnalyticsSummaryPayload } from "../../services/platformAnalyticsService.js";
import { Parser } from "json2csv";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function rangeToDate(range) {
  if (range === "90d") return daysAgo(90);
  if (range === "30d") return daysAgo(30);
  return daysAgo(7);
}

export async function getSummary(req, res) {
  try {
    const tenantId = getTenantId(req);
    const range = String(req.query.range || "7d");
    const payload = await getAdminAnalyticsSummaryPayload({ range, tenantId });
    return res.json(payload);
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to load analytics", error: String(e) });
  }
}

export async function exportReport(req, res) {
  try {
    const tenantId = getTenantId(req);
    const tenantFilter = tenantId ? { tenantId } : {};
    const type = String(req.params.type || "");

    if (type === "performance") {
      const rows = await Submission.find({
        ...tenantFilter,
        gradedAt: { $ne: null },
      })
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean();

      const parser = new Parser({
        fields: [
          "_id",
          "studentId",
          "teacherId",
          "score",
          "gradedBy",
          "gradedAt",
          "createdAt",
        ],
      });
      const csv = parser.parse(rows);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="performance.csv"`,
      );
      return res.status(200).send(csv);
    }

    if (type === "ai-usage") {
      const rows = await AIUsageLog.find({ ...tenantFilter })
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();

      const parser = new Parser({
        fields: [
          "_id",
          "userId",
          "feature",
          "requests",
          "tokens",
          "cost",
          "createdAt",
        ],
      });
      const csv = parser.parse(rows);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ai-usage.csv"`,
      );
      return res.status(200).send(csv);
    }

    return res.status(400).json({ message: "Unknown export type" });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to export", error: String(e) });
  }
}
