import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import mongoose from "mongoose";

import User from "../models/userModel.js";
import RefreshToken from "../models/RefreshToken.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET; // better to have its own secret
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!JWT_SECRET)
  throw new Error("JWT_SECRET is missing in environment variables.");

/**
 * ============================================================
 * ✅ Multer Setup — Secure Uploads
 * ============================================================
 */
const allowedMimeTypes = ["image/jpeg", "image/png"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) =>
    cb(null, `profile-${Date.now()}${path.extname(file.originalname)}`),
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter(req, file, cb) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only PNG and JPEG allowed"));
    }
    cb(null, true);
  },
});

/**
 * ============================================================
 * ✅ Helpers
 * ============================================================
 */

const normalizeRole = (role) => {
  if (!role) return "student";
  const r = role.toString().toLowerCase().trim();
  if (r === "super_admin" || r === "super-admin" || r === "superadmin")
    return "superadmin";
  if (r === "admin") return "admin";
  if (r === "teacher") return "teacher";
  return "student";
};

const getClientIp = (req) => {
  const xf = (req.headers["x-forwarded-for"] || "").toString();
  return (
    (xf.split(",")[0] || "").trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    ""
  );
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const createAccessToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      username: user.username,
      email: user.email,
      user_code: user.user_code,
    },
    JWT_SECRET,
    { expiresIn: "30d" }, // ✅ keep as requested
  );

// refresh token: random string + signed guard (optional). We’ll store hash anyway.
const createRefreshTokenString = () => crypto.randomBytes(48).toString("hex");

// Recommended refresh expiry (you can change):
const REFRESH_EXPIRES_DAYS = 60; // 60 days refresh, JWT is 30 days

const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === "production";

  // Access token cookie (optional). You already return token in JSON too.
  res.cookie("token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  });

  // Refresh token cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
};

const clearAuthCookies = (res) => {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie("token", {
    path: "/",
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  });
  res.clearCookie("refreshToken", {
    path: "/",
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  });
};

/**
 * ============================================================
 *  REGISTER USER
 * ============================================================
 */
export const registerUser = async (req, res) => {
  try {
    let { username, email, password, firstName, lastName, gender, role } =
      req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "username, email, password are required",
      });
    }

    //  Only admins & superadmins can create users
    if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admins or superadmins can create users",
      });
    }

    email = email.toLowerCase().trim();
    username = username.trim().toLowerCase();
    role = normalizeRole(role);

    //  Admins/superadmins can ONLY create student or teacher
    if (!["student", "teacher"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You can only create users with role student or teacher",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    //  Rely on unique indexes (race-safe)
    const user = await User.create({
      username,
      email,
      password: hashed,
      firstName,
      lastName,
      gender,
      role,
    });

    const accessToken = createAccessToken(user);

    //  Create refresh token session
    const refreshToken = createRefreshTokenString();
    const tokenHash = hashToken(refreshToken);
    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] || "").toString();

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      createdByIp: ip,
      userAgent,
      expiresAt: new Date(
        Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      ),
    });

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token: accessToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
        user_code: user.user_code,
      },
    });
  } catch (e) {
    if (e?.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

/**
 * ============================================================
 *  LOGIN USER
 * ============================================================
 */
export const loginUser = async (req, res) => {
  try {
    console.log("LOGIN body:", req.body);
    console.log("Mongoose:", {
      readyState: mongoose.connection.readyState, // 0/1/2/3
      db: mongoose.connection?.name,
      host: mongoose.connection?.host,
    });
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    const user = await User.findOne({ email }).select("+password");
    console.log("FOUND user?", !!user, "email:", email);
    if (user) console.log("HASH prefix:", String(user.password).slice(0, 7)); // e.g. $2a$10
    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    if (user.deleted)
      return res
        .status(403)
        .json({ success: false, message: "This account was deleted." });
    if (user.blocked)
      return res
        .status(403)
        .json({ success: false, message: "This account is blocked." });

    const match = await bcrypt.compare(password, user.password);
    console.log("PASSWORD MATCH?", match);

    if (!match)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });

    const accessToken = createAccessToken(user);

    // Refresh token session
    const refreshToken = createRefreshTokenString();
    const tokenHash = hashToken(refreshToken);

    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] || "").toString();

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      createdByIp: ip,
      userAgent,
      expiresAt: new Date(
        Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      ),
    });

    // Update login meta (cap activityLog to last 50 to avoid unbounded array)
    await User.updateOne(
      { _id: user._id },
      {
        $set: { lastLogin: new Date(), lastIP: ip },
        $push: {
          activityLog: {
            $each: [{ action: "Login", timestamp: new Date() }],
            $slice: -50,
          },
        },
      },
    );

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token: accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        user_code: user.user_code,
      },
    });
  } catch (e) {
    console.error("❌ Login error:", e);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again later.",
    });
  }
};

/**
 * ============================================================
 * ✅ REFRESH TOKEN (rotate)
 * ============================================================
 * Client sends refreshToken cookie. We:
 * - hash it, find session
 * - revoke old
 * - issue new refresh + new access
 */
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Missing refresh token" });
    }

    const tokenHash = hashToken(refreshToken);

    const session = await RefreshToken.findOne({ tokenHash });
    if (!session) {
      clearAuthCookies(res);
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    if (session.revokedAt) {
      clearAuthCookies(res);
      return res
        .status(401)
        .json({ success: false, message: "Refresh token revoked" });
    }

    if (session.expiresAt <= new Date()) {
      clearAuthCookies(res);
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const user = await User.findById(session.userId);
    if (!user || user.deleted || user.blocked) {
      // revoke session
      session.revokedAt = new Date();
      session.revokeReason = "user invalid/deleted/blocked";
      await session.save();

      clearAuthCookies(res);
      return res
        .status(403)
        .json({ success: false, message: "User not allowed" });
    }

    // Rotate refresh token
    const newRefreshToken = createRefreshTokenString();
    const newHash = hashToken(newRefreshToken);

    session.revokedAt = new Date();
    session.replacedByTokenHash = newHash;
    session.revokeReason = "rotated";
    await session.save();

    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] || "").toString();

    await RefreshToken.create({
      userId: user._id,
      tokenHash: newHash,
      createdByIp: ip,
      userAgent,
      expiresAt: new Date(
        Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      ),
    });

    const newAccessToken = createAccessToken(user);
    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      token: newAccessToken,
    });
  } catch (e) {
    console.error("refreshAccessToken error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to refresh token" });
  }
};

/**
 * ============================================================
 * ✅ LOGOUT
 * ============================================================
 * - revoke current refresh token session if present
 * - clear cookies
 */
export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date(), revokeReason: "logout" } },
      );
    }

    clearAuthCookies(res);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (e) {
    clearAuthCookies(res);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};

/**
 * ============================================================
 * ✅ GET ALL USERS (paginated, no scan)
 * ============================================================
 * Query:
 *  /users?limit=30&cursor=2026-01-20T10:00:00.000Z|<id>&role=teacher&deleted=false
 */
export const getAllUsers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
    const cursor = req.query.cursor; // "createdAt|_id"
    const role = req.query.role ? normalizeRole(req.query.role) : null;
    const deleted = req.query.deleted === "true";

    const filter = { deleted };
    if (role) filter.role = role;

    if (cursor) {
      const [createdAtStr, id] = cursor.split("|");
      const createdAt = new Date(createdAtStr);

      filter.$or = [
        { createdAt: { $lt: createdAt } },
        { createdAt, _id: { $lt: id } },
      ];
    }

    const list = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    const nextCursor =
      list.length === limit
        ? `${list[list.length - 1].createdAt.toISOString()}|${list[list.length - 1]._id}`
        : null;

    res.json({ data: list, nextCursor });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * ============================================================
 * ✅ GET USER BY ID
 * ============================================================
 */
export const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.userId).select("-password");
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * ============================================================
 * ✅ GET USER BY CODE
 * ============================================================
 */
export const getUserByCode = async (req, res) => {
  try {
    const u = await User.findOne({ user_code: req.params.code }).select(
      "-password",
    );
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * ============================================================
 * ✅ CHECK AUTH
 * ============================================================
 */
export const checkAuth = async (req, res) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });

    return res.status(200).json({
      user: {
        _id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        user_code: req.user.user_code,
      },
      token: req.token || null,
    });
  } catch (err) {
    console.error("checkAuth error:", err);
    res.status(500).json({ message: "Server error verifying auth" });
  }
};

/**
 * ============================================================
 * ✅ UPDATE PROFILE (secure)
 * ============================================================
 */
export const updateUserProfile = async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    const isSelf = req.user?.id?.toString() === targetUserId.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user?.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const allowedFields = [
      "firstName",
      "lastName",
      "gender",
      "receiveNotifications",
    ];
    const updates = {};

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (req.file) updates.profilePhoto = `/uploads/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(targetUserId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * ============================================================
 * ✅ UPDATE ROLE OR PASSWORD (Admin/Super Admin)
 * ============================================================
 */
export const updateUserRoleOrPassword = async (req, res) => {
  try {
    const { newRole, newPassword } = req.body;

    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (newRole) {
      if (req.user.role !== "superadmin") {
        return res
          .status(403)
          .json({ message: "Only superadmin can assign roles" });
      }
      user.role = normalizeRole(newRole);
    }

    if (newPassword) {
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ success: true, message: "User updated successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * ============================================================
 * ✅ SOFT DELETE USER
 * ============================================================
 */
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.deleted) {
      return res
        .status(400)
        .json({ success: false, message: "User is already soft-deleted" });
    }

    user.deleted = true;
    user.deletedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "User moved to recycle bin (soft deleted)",
      deletedAt: user.deletedAt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to soft delete user",
      error: error.message,
    });
  }
};

/**
 * ============================================================
 * ✅ RESTORE USER
 * ============================================================
 */
export const restoreUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.deleted) {
      return res.status(400).json({ message: "User is not deleted" });
    }

    user.deleted = false;
    user.deletedAt = null;
    await user.save();

    res.json({ success: true, message: "User restored successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to restore user",
      error: error.message,
    });
  }
};
