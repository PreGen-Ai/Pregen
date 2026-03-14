// backend/src/controllers/admin/usersAdmin.controller.js
import bcrypt from "bcryptjs";
import { getTenantId } from "../../middleware/authMiddleware.js";
import User from "../../models/userModel.js";

function roleOf(req) {
  return String(req.userRole || req.user?.role || "").toUpperCase();
}

function isSuperAdmin(req) {
  return roleOf(req) === "SUPERADMIN";
}

function resolveTenantId(req, { allowSuperadminOverride = false } = {}) {
  const role = roleOf(req);

  // Superadmin can optionally specify tenantId for cross-tenant ops
  if (allowSuperadminOverride && role === "SUPERADMIN") {
    const t = req.body?.tenantId || req.query?.tenantId;
    if (t) return t;
  }

  // Tenant middleware shapes vary across your codebase, cover them all
  return (
    req.tenant?._id ??
    req.tenant?.id ??
    req.tenantId ??
    getTenantId(req) ??
    req.user?.tenantId ??
    null
  );
}

function baseNotDeletedFilter() {
  // Support both styles: deleted boolean and deletedAt timestamp
  return {
    deleted: { $ne: true },
    deletedAt: { $in: [null, undefined] },
  };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/**
 * GET /api/admin/users
 * - SUPERADMIN: global list, optional ?tenantId=
 * - ADMIN: tenant-scoped using tenant resolver
 *
 * Query:
 * - q: search (username, email, firstName, lastName, name)
 * - role: filter by role
 * - status: enabled | disabled
 */
export async function listUsers(req, res) {
  try {
    const role = roleOf(req);

    const tenantId = isSuperAdmin(req)
      ? req.query?.tenantId || null
      : resolveTenantId(req);

    if (!isSuperAdmin(req) && !tenantId) {
      return res.status(400).json({
        success: false,
        message: "Missing tenantId on admin user",
      });
    }

    const { q = "", role: roleFilter = "", status = "" } = req.query;

    const filter = {
      ...baseNotDeletedFilter(),
      ...(tenantId ? { tenantId } : {}),
    };

    const queryText = String(q || "").trim();
    if (queryText) {
      const rx = { $regex: queryText, $options: "i" };
      filter.$or = [
        { username: rx },
        { email: rx },
        { firstName: rx },
        { lastName: rx },
        { name: rx }, // legacy field support
      ];
    }

    if (roleFilter) filter.role = roleFilter;

    if (status === "enabled") filter.enabled = true;
    if (status === "disabled") filter.enabled = false;

    const items = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.json({ items, count: items.length });
  } catch (err) {
    console.error("Error fetching users:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load users" });
  }
}

/**
 * POST /api/admin/createAdmin
 * tenant-scoped (superadmin may pass tenantId in body)
 */
export async function createAdmin(req, res) {
  try {
    const { username, email, password, firstName, lastName, gender } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "username, email and password are required",
      });
    }

    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const emailLower = normalizeEmail(email);

    const existing = await User.findOne({
      tenantId,
      email: emailLower,
      ...baseNotDeletedFilter(),
    }).lean();

    if (existing) {
      return res.status(409).json({
        message: "User with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await User.create({
      username,
      email: emailLower,
      password: hashedPassword,
      firstName,
      lastName,
      gender,
      role: "ADMIN",
      enabled: true,
      tenantId,
    });

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      user: {
        id: newAdmin._id,
        email: newAdmin.email,
        username: newAdmin.username,
        role: newAdmin.role,
        tenantId: newAdmin.tenantId,
      },
    });
  } catch (error) {
    console.error("Create Admin Error:", error);
    return res.status(500).json({
      message: "Failed to create admin",
      error: error.message,
    });
  }
}

/**
 * PUT /api/admin/promote/:id
 * tenant-scoped (superadmin may pass tenantId in query/body)
 */
export async function promoteUserToAdmin(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const user = await User.findOne({
      _id: req.params.id,
      tenantId,
      ...baseNotDeletedFilter(),
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = "ADMIN";
    await user.save();

    return res.json({
      success: true,
      message: "User promoted to admin",
      userId: user._id,
    });
  } catch (err) {
    console.error("Promote error:", err);
    return res.status(500).json({ message: "Failed to promote user" });
  }
}

/**
 * POST /api/admin/users/invite
 * tenant-scoped (superadmin may pass tenantId in body)
 */
export async function inviteUser(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { name = "", email, role = "STUDENT" } = req.body;

    if (!String(email || "").trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailLower = normalizeEmail(email);

    const exists = await User.findOne({
      tenantId,
      email: emailLower,
      ...baseNotDeletedFilter(),
    }).lean();

    if (exists) return res.status(409).json({ message: "User already exists" });

    const tempPassword = Math.random().toString(36).slice(2, 10) + "A1";
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({
      tenantId,
      name,
      email: emailLower,
      role,
      enabled: true,
      password: passwordHash,
      mustChangePassword: true,
      invitedAt: new Date(),
    });

    // Email sending hook goes here (nodemailer/SES/etc).
    return res.status(201).json({
      message: "Invite created",
      userId: user._id,
      tempPassword, // remove this in production, send via email instead
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to invite user", error: String(e) });
  }
}

/**
 * PATCH /api/admin/users/:id/status
 * tenant-scoped (superadmin may pass tenantId in query/body)
 */
export async function setUserStatus(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { enabled } = req.body;
    const { id } = req.params;

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId, ...baseNotDeletedFilter() },
      { enabled: !!enabled },
      { new: true },
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "Updated", user });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to update user", error: String(e) });
  }
}

/**
 * PATCH /api/admin/users/:id/role
 * tenant-scoped (superadmin may pass tenantId in query/body)
 */
export async function setUserRole(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { role } = req.body;
    const { id } = req.params;

    if (!role) return res.status(400).json({ message: "Role is required" });

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId, ...baseNotDeletedFilter() },
      { role },
      { new: true },
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "Updated", user });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to update role", error: String(e) });
  }
}

/**
 * POST /api/admin/users/:id/reset-password
 * tenant-scoped (superadmin may pass tenantId in query/body)
 */
export async function resetPassword(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { id } = req.params;

    const tempPassword = Math.random().toString(36).slice(2, 10) + "A1";
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId, ...baseNotDeletedFilter() },
      { password: passwordHash, mustChangePassword: true },
      { new: true },
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    // Email hook here
    return res.json({ message: "Reset issued", tempPassword }); // remove in production
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to reset password", error: String(e) });
  }
}
