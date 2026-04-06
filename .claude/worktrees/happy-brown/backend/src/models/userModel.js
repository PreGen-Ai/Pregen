import mongoose from "mongoose";
import { generateUserCode } from "../utils/generateUserCode.js";

const { Schema } = mongoose;

/**
 * Unified User Schema
 * - Supports multi-tenant (tenantId) + school ownership (schoolId)
 * - Normalizes role enums (UPPERCASE) to match your requireRole("ADMIN","SUPERADMIN")
 * - Keeps safety (password select:false) + soft delete
 * - Keeps both "blocked/disabled" compatibility
 */
const UserSchema = new Schema(
  {
    // Multi-tenant scope (string tenant key; can be null for internal superadmins if you want)
    tenantId: { type: String, index: true, default: null },

    // Teachers can belong to multiple tenants (tenantIds tracks all memberships)
    // For ADMIN and STUDENT roles, only tenantId is used (single-tenant constraint enforced at API layer)
    tenantIds: { type: [String], index: true, default: [] },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9._-]+$/,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    // Store only hashed passwords here (argon2/bcrypt).
    password: {
      type: String,
      required: true,
      select: false,
    },

    firstName: { type: String, default: "", trim: true, maxlength: 60 },
    lastName: { type: String, default: "", trim: true, maxlength: 60 },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "other",
      index: true,
    },

    /**
     * Roles (normalized)
     * - Your older schema used lowercase ("admin", "superadmin"...)
     * - Your newer schema + middleware used uppercase ("ADMIN","SUPERADMIN"...)
     * We store UPPERCASE and accept lowercase at write-time via hook.
     */
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"],
      default: "STUDENT",
      index: true,
    },

    // Optional school ownership (your earlier "School" reference)
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      default: null,
      index: true,
    },

    // Status flags (compat: blocked vs disabled)
    blocked: { type: Boolean, default: false, index: true }, // legacy name
    disabled: { type: Boolean, default: false, index: true }, // newer name

    receiveNotifications: { type: Boolean, default: true },
    profilePhoto: { type: String, default: "" },

    lastLogin: { type: Date, default: null, index: true },
    lastActiveAt: { type: Date, default: null, index: true }, // newer name
    lastIP: { type: String, default: "" },

    // IMPORTANT: can grow big; consider moving to separate collection if heavy usage
    activityLog: [
      {
        action: { type: String, default: "", trim: true, maxlength: 200 },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Soft delete
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    // Unified role-based ID: STU_... TEA_... ADM_... SUP_...
    user_code: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true },
);

/** -------------------------
 * Indexes (query-driven)
 * ------------------------ */
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });

// tenant / school filtering
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ schoolId: 1, role: 1 });

// common lists
UserSchema.index({ tenantId: 1, createdAt: -1 });
UserSchema.index({ schoolId: 1, createdAt: -1 });

// soft delete filtering
UserSchema.index({ deleted: 1, createdAt: -1 });

/** -------------------------
 * Hooks
 * ------------------------ */

// Normalize + role mapping + compat flags
UserSchema.pre("save", function (next) {
  if (this.username) this.username = this.username.trim().toLowerCase();
  if (this.email) this.email = this.email.trim().toLowerCase();

  // Accept lowercase roles written by older code, store uppercase
  if (this.role) {
    const r = String(this.role).trim();
    const upper = r.toUpperCase();
    const map = {
      SUPERADMIN: "SUPERADMIN",
      ADMIN: "ADMIN",
      TEACHER: "TEACHER",
      STUDENT: "STUDENT",
      PARENT: "PARENT",
      // legacy lowercase variants:
      superadmin: "SUPERADMIN",
      admin: "ADMIN",
      teacher: "TEACHER",
      student: "STUDENT",
      parent: "PARENT",
    };
    this.role = map[r] || map[upper] || upper;
  }

  // Keep blocked/disabled consistent if either is set
  if (this.isModified("blocked") && !this.isModified("disabled")) {
    this.disabled = !!this.blocked;
  }
  if (this.isModified("disabled") && !this.isModified("blocked")) {
    this.blocked = !!this.disabled;
  }

  // Maintain lastActiveAt when lastLogin updates (optional)
  if (this.isModified("lastLogin") && !this.isModified("lastActiveAt")) {
    this.lastActiveAt = this.lastLogin;
  }

  next();
});

// Auto-generate role-based ID
UserSchema.pre("save", async function (next) {
  if (this.isNew && !this.user_code) {
    this.user_code = await generateUserCode(this.role);
  }
  next();
});

/** -------------------------
 * Output safety
 * ------------------------ */
UserSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.password; // should already be excluded by select:false
    return ret;
  },
});
UserSchema.set("toObject", {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  },
});

/** -------------------------
 * Query helper: exclude deleted users
 * ------------------------ */
UserSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

const User = mongoose.model("User", UserSchema);
export default User;
