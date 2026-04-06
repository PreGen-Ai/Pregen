import express from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";

import dashboardRoutes from "./dashboardRoutes.js";
import usersRoutes from "./usersRoutes.js";
import classesRoutes from "./classesRoutes.js";
import aiRoutes from "./aiRoutes.js";
import analyticsRoutes from "./analyticsRoutes.js";
import brandingRoutes from "./brandingRoutes.js";

const router = express.Router();

router.use(requireAdmin);


router.use("/dashboard", dashboardRoutes);
router.use("/users", usersRoutes);
router.use("/classes", classesRoutes);
router.use("/ai", aiRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/branding", brandingRoutes);

export default router;
