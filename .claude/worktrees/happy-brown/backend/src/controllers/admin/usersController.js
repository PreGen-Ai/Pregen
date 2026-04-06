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
    const t =
      req.get("x-tenant-id") || req.body?.tenantId || req.query?.tenantId;
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
 * Enforce single-tenant constraint for ADMIN and STUDENT roles.
 * Teachers can be in multiple tenants, so no check for them.
 */
async function enforceSingleTenant(email, role, currentTenantId) {
  const upperRole = String(role || "").toUpperCase();
  if (upperRole === "TEACHER") return null; // teachers can be multi-tenant

  const existing = await User.findOne({
    email: normalizeEmail(email),
    ...baseNotDeletedFilter(),
  }).lean();

  if (!existing) return null; // new user, no conflict

  if (String(existing.tenantId) !== String(currentTenantId)) {
    return `A user with this email already belongs to a different tenant. ${upperRole === "ADMIN" ? "Admins" : "Students"} can only belong to one tenant.`;
  }

  return null; // same tenant — duplicate check handled separately
}

/**
 * GET /api/admin/users
 * - SUPERADMIN: global list, optional ?tenantId= or x-tenant-id header
 * - ADMIN: tenant-scoped
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
      ? req.get("x-tenant-id") || req.query?.tenantId || null
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
        { name: rx },
      ];
    }

    if (roleFilter) filter.role = roleFilter.toUpperCase();

    if (status === "enabled") filter.disabled = { $ne: true };
    if (status === "disabled") filter.disabled = true;

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
 * POST /api/admin/users/create
 * Create a user with explicit email + password (tenant-scoped).
 * - ADMIN/STUDENT: single-tenant enforced (cannot be in two tenants)
 * - TEACHER: can be in multiple tenants
 *
 * Body: { email, password, username?, firstName?, lastName?, gender?, role? }
 */
export async function createUser(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const {
      email,
      password,
      username,
      firstName = "",
      lastName = "",
      gender = "other",
      role = "STUDENT",
    } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "password must be at least 6 characters" });
    }

    const emailLower = normalizeEmail(email);
    const upperRole = String(role || "STUDENT").toUpperCase();
    const allowedRoles = ["STUDENT", "TEACHER", "ADMIN"];
    if (!allowedRoles.includes(upperRole)) {
      return res.status(400).json({
        message: `Invalid role. Allowed roles for admin creation: ${allowedRoles.join(", ")}`,
      });
    }

    // For TEACHER: if user already exists globally, add this tenant to their tenantIds
    if (upperRole === "TEACHER") {
      const existingTeacher = await User.findOne({
        email: emailLower,
        role: "TEACHER",
        ...baseNotDeletedFilter(),
      }).lean();

      if (existingTeacher) {
        // Teacher already exists; just add this tenant to their memberships
        if ((existingTeacher.tenantIds || []).includes(tenantId)) {
          return res.status(409).json({
            message: "Teacher is already a member of this tenant.",
          });
        }
        await User.updateOne(
          { _id: existingTeacher._id },
          { $addToSet: { tenantIds: tenantId } },
        );
        return res.status(200).json({
          success: true,
          message: "Teacher added to tenant",
          user: {
            id: existingTeacher._id,
            email: existingTeacher.email,
            username: existingTeacher.username,
            role: existingTeacher.role,
            tenantId: existingTeacher.tenantId,
            tenantIds: [...(existingTeacher.tenantIds || []), tenantId],
            user_code: existingTeacher.user_code,
          },
        });
      }
    } else {
      // Single-tenant constraint for ADMIN and STUDENT
      const tenantConflict = await enforceSingleTenant(
        emailLower,
        upperRole,
        tenantId,
      );
      if (tenantConflict)
        return res.status(409).json({ message: tenantConflict });
    }

    // Check duplicate in same tenant
    const existing = await User.findOne({
      tenantId,
      email: emailLower,
      ...baseNotDeletedFilter(),
    }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ message: "User with this email already exists in this tenant." });
    }

    const derivedUsername =
      String(username || "").trim() ||
      emailLower.split("@")[0].replace(/[^a-z0-9._-]/g, "_");

    // Ensure username is unique
    let finalUsername = derivedUsername;
    const usernameConflict = await User.findOne({
      username: finalUsername,
    }).lean();
    if (usernameConflict) {
      finalUsername = `${derivedUsername}_${Date.now().toString(36)}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      tenantId,
      tenantIds: [tenantId],
      username: finalUsername,
      email: emailLower,
      password: hashedPassword,
      firstName,
      lastName,
      gender,
      role: upperRole,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser._id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        tenantId: newUser.tenantId,
        user_code: newUser.user_code,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res
        .status(409)
        .json({ message: `${field} already exists`, success: false });
    }
    console.error("Create User Error:", error);
    return res.status(500).json({
      message: "Failed to create user",
      error: error.message,
    });
  }
}

/**
 * POST /api/admin/createAdmin
 * tenant-scoped (superadmin may pass tenantId in body)
 */
export async function createAdmin(req, res) {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      gender,
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "username, email and password are required",
      });
    }

    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const emailLower = normalizeEmail(email);

    // Admins are single-tenant
    const tenantConflict = await enforceSingleTenant(emailLower, "ADMIN", tenantId);
    if (tenantConflict) return res.status(409).json({ message: tenantConflict });

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
      tenantId,
      tenantIds: [tenantId],
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
 * Accepts optional explicit password; generates temp password if not provided.
 */
export async function inviteUser(req, res) {
  try {
    const tenantId = resolveTenantId(req, { allowSuperadminOverride: true });
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const {
      name = "",
      email,
      role = "STUDENT",
      password: explicitPassword,
      firstName = "",
      lastName = "",
      username: providedUsername,
    } = req.body;

    if (!String(email || "").trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailLower = normalizeEmail(email);
    const upperRole = String(role || "STUDENT").toUpperCase();

    // Single-tenant constraint for ADMIN and STUDENT
    const tenantConflict = await enforceSingleTenant(
      emailLower,
      upperRole,
      tenantId,
    );
    if (tenantConflict) return res.status(409).json({ message: tenantConflict });

    const exists = await User.findOne({
      tenantId,
      email: emailLower,
      ...baseNotDeletedFilter(),
    }).lean();

    if (exists) return res.status(409).json({ message: "User already exists in this tenant" });

    const plainPassword = explicitPassword || Math.random().toString(36).slice(2, 10) + "A1!";
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const derivedUsername =
      String(providedUsername || "").trim() ||
      emailLower.split("@")[0].replace(/[^a-z0-9._-]/g, "_");

    let finalUsername = derivedUsername;
    const usernameConflict = await User.findOne({ username: finalUsername }).lean();
    if (usernameConflict) {
      finalUsername = `${derivedUsername}_${Date.now().toString(36)}`;
    }

    const user = await User.create({
      tenantId,
      tenantIds: [tenantId],
      name,
      firstName,
      lastName,
      username: finalUsername,
      email: emailLower,
      role: upperRole,
      password: passwordHash,
    });

    return res.status(201).json({
      success: true,
      message: "User created",
      userId: user._id,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        user_code: user.user_code,
      },
      // Only return tempPassword if no explicit password was provided
      ...(explicitPassword ? {} : { tempPassword: plainPassword }),
    });
  } catch (e) {
    if (e?.code === 11000) {
      const field = Object.keys(e.keyPattern || {})[0] || "field";
      return res
        .status(409)
        .json({ message: `${field} already exists`, success: false });
    }
    return res
      .status(500)
      .json({ message: "Failed to create user", error: String(e) });
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
      { disabled: !enabled, blocked: !enabled },
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
      { role: role.toUpperCase() },
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
    const { newPassword } = req.body;

    const plainPassword = newPassword || Math.random().toString(36).slice(2, 10) + "A1!";
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId, ...baseNotDeletedFilter() },
      { password: passwordHash },
      { new: true },
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      message: "Password reset successfully",
      ...(newPassword ? {} : { tempPassword: plainPassword }),
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to reset password", error: String(e) });
  }
}
