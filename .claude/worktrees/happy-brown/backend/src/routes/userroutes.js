// backend/src/routes/userroute.js
import express from "express";
import User from "../models/userModel.js";

import {
  registerUser,
  loginUser,
  logoutUser,
  getAllUsers,
  getUserById,
  getUserByCode,
  updateUserProfile,
  upload,
  updateUserRoleOrPassword,
  deleteUser,
  restoreUser,
} from "../controllers/usercontroller.js";

import {
  requireAuth,
  authorizeRoles,
  requireStudent,
  requireTeacher,
  requireAdmin,
  requireSuperAdmin,
  requireParent,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * Public routes
 */
router.post("/signup", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);

/**
 * Auth check
 */
router.get("/checkAuth", requireAuth, (req, res) => {
  res.json({ user: req.user, token: req.token });
});

/**
 * Self profile
 */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch {
    res.status(500).json({ message: "Error fetching profile" });
  }
});

router.put(
  "/profile/:userId",
  requireAuth,
  upload.single("profilePhoto"),
  updateUserProfile,
);

/**
 * Admin + SuperAdmin user lookup
 */
router.get(
  "/users/id/:userId",
  requireAuth,
  authorizeRoles("ADMIN", "SUPERADMIN"),
  getUserById,
);

router.get(
  "/users/code/:code",
  requireAuth,
  authorizeRoles("ADMIN", "SUPERADMIN"),
  getUserByCode,
);

router.get(
  "/users",
  requireAuth,
  authorizeRoles("ADMIN", "SUPERADMIN"),
  getAllUsers,
);

/**
 * Admin updates
 */
router.put(
  "/admin/update-user/:id",
  requireAuth,
  authorizeRoles("ADMIN", "SUPERADMIN"),
  updateUserRoleOrPassword,
);

router.put(
  "/admin/update-role/:id",
  ...requireSuperAdmin,
  updateUserRoleOrPassword,
);

/**
 * Dashboard ping for any authenticated role in your enum
 */
router.get(
  "/dashboard",
  requireAuth,
  authorizeRoles("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"),
  (req, res) =>
    res.json({ message: `Welcome ${req.user.role} to your dashboard!` }),
);

/**
 * System management (SuperAdmin only)
 */
router.get("/all", ...requireSuperAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).json({ message: "Error fetching users" });
  }
});

router.delete("/delete/:id", ...requireSuperAdmin, deleteUser);

/**
 * Restore and block toggles (Admin + SuperAdmin)
 */
router.put("/restore/:id", ...requireAdmin, restoreUser);

router.put("/toggle-block/:id", ...requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.blocked = !user.blocked;
    await user.save();

    res.json({ success: true, blocked: user.blocked });
  } catch {
    res.status(500).json({ message: "Error toggling block status" });
  }
});

/**
 * Role test routes (strict, consistent)
 */
router.get("/super-admin", ...requireSuperAdmin, (req, res) => {
  res.json({ message: "Welcome, Super Admin!" });
});

router.get("/admin", ...requireAdmin, (req, res) => {
  res.json({ message: "Welcome, Admin!" });
});

router.get("/teacher", ...requireTeacher, (req, res) => {
  res.json({ message: "Welcome, Teacher!" });
});

router.get("/student", ...requireStudent, (req, res) => {
  res.json({ message: "Welcome, Student!" });
});

router.get("/parent", ...requireParent, (req, res) => {
  res.json({ message: "Welcome, Parent!" });
});

export default router;
