// tests/helpers/factory.js
// Creates real DB documents for use across test suites.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../../src/models/userModel.js";
import Course from "../../src/models/CourseModel.js";

const JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_pregen_lms_2024";

// ---------- Tokens ----------
export function makeToken(user) {
  return jwt.sign(
    { id: user._id, _id: user._id, role: user.role, tenantId: user.tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

export function makeExpiredToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "-1s" }
  );
}

// ---------- Users ----------
let _counter = 0;
function uid() {
  return `${Date.now()}${++_counter}`;
}

export async function createUser(overrides = {}) {
  const id = uid();
  const defaults = {
    username: `user_${id}`,
    email: `user${id}@test.com`,
    password: await bcrypt.hash("Password1!", 10),
    firstName: "Test",
    lastName: "User",
    role: "STUDENT",
    tenantId: "tenant_test",
    disabled: false,
    blocked: false,
    deleted: false,
  };
  const data = { ...defaults, ...overrides };
  const user = await User.create(data);
  const token = makeToken(user);
  return { user, token };
}

export async function createStudent(overrides = {}) {
  return createUser({ role: "STUDENT", ...overrides });
}

export async function createTeacher(overrides = {}) {
  return createUser({ role: "TEACHER", ...overrides });
}

export async function createAdmin(overrides = {}) {
  return createUser({ role: "ADMIN", ...overrides });
}

export async function createSuperAdmin(overrides = {}) {
  return createUser({ role: "SUPERADMIN", tenantId: null, ...overrides });
}

export async function createParent(overrides = {}) {
  return createUser({ role: "PARENT", ...overrides });
}

// ---------- Courses ----------
export async function createCourse(creator, overrides = {}) {
  const id = uid();
  const defaults = {
    title: `Course ${id}`,
    description: "A test course",
    tenantId: creator.tenantId || "tenant_test",
    createdBy: creator._id,
    code: `CODE${id}`.slice(0, 10).toUpperCase(),
    type: "course",
    visibility: "private",
  };
  return Course.create({ ...defaults, ...overrides });
}

// ---------- Auth headers ----------
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
