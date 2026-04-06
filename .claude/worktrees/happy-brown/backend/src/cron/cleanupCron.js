// backend/cron/cleanupCron.js
import cron from "node-cron";
import User from "../models/userModel.js";

// Runs every day at midnight
cron.schedule("0 0 * * *", async () => {
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log(
    `🧹 [CRON] Running cleanup job — removing users deleted before: ${cutoffDate}`,
  );

  try {
    const result = await User.deleteMany({
      deleted: true,
      deletedAt: { $lte: cutoffDate },
    });

    if (result.deletedCount > 0) {
      console.log(
        `✅ [CRON] Permanently removed ${result.deletedCount} users.`,
      );
    } else {
      console.log("ℹ️ [CRON] No users to clean up.");
    }
  } catch (error) {
    console.error("❌ [CRON] Error during cleanup job:", error.message);
  }
});
