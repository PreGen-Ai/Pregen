/**
 * backend/src/seeds/setup-tenants.js
 *
 * One-time setup: creates tenants, subjects, classrooms, and courses for the
 * existing production/staging users found in MongoDB, then assigns teachers and
 * enrols students.
 *
 * Safe to run multiple times — all operations are upserts.
 *
 * Usage (from backend/ directory):
 *   node src/seeds/setup-tenants.js
 */

import { connectMongo, disconnectMongo } from "../config/mongo.js";
import bcrypt from "bcryptjs";
import Tenant from "../models/Tenant.js";
import TenantSettings from "../models/TenantSettings.js";
import User from "../models/userModel.js";
import Subject from "../models/Subject.js";
import Classroom from "../models/Classroom.js";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";

// ─── Known tenants from the screenshot ───────────────────────────────────────
const TENANTS = [
  { tenantId: "pregen-main",                  name: "PreGen Main School" },
  { tenantId: "commit8-live-mnlwx8dr",         name: "Alpha Academy" },
  { tenantId: "commit8-live-mnlwseom",         name: "Beta Institute" },
  { tenantId: "commit8-live-mnlwovpw",         name: "Gamma College" },
  { tenantId: "commit8-live-mnlwkmb4",         name: "Delta High School" },
];

// ─── Subjects per tenant ──────────────────────────────────────────────────────
const SUBJECTS_TEMPLATE = [
  { name: "Mathematics",     code: "MATH" },
  { name: "Computer Science", code: "CS" },
  { name: "Physics",         code: "PHY" },
  { name: "English",         code: "ENG" },
];

// ─── Test users to create if they don't exist ────────────────────────────────
// (Per tenant: 1 ADMIN, 1 TEACHER, 2 STUDENTS)
const EXTRA_USERS = [
  // pregen-main
  { email: "admin@pregen-main.test",    username: "admin_pregen_main",    role: "ADMIN",   tenantId: "pregen-main",          password: "Admin@1234",   firstName: "Alice",   lastName: "Admin" },
  { email: "teacher@pregen-main.test",  username: "teacher_pregen_main",  role: "TEACHER", tenantId: "pregen-main",          password: "Teacher@1234", firstName: "Tom",     lastName: "Teach" },
  { email: "student1@pregen-main.test", username: "student1_pregen_main", role: "STUDENT", tenantId: "pregen-main",          password: "Student@1234", firstName: "Sara",    lastName: "Student" },
  { email: "student2@pregen-main.test", username: "student2_pregen_main", role: "STUDENT", tenantId: "pregen-main",          password: "Student@1234", firstName: "Sam",     lastName: "Student" },
  // alpha
  { email: "admin@alpha.test",          username: "admin_alpha",          role: "ADMIN",   tenantId: "commit8-live-mnlwx8dr", password: "Admin@1234",   firstName: "Ana",     lastName: "Alpha" },
  { email: "teacher@alpha.test",        username: "teacher_alpha",        role: "TEACHER", tenantId: "commit8-live-mnlwx8dr", password: "Teacher@1234", firstName: "Ted",     lastName: "Alpha" },
  { email: "student1@alpha.test",       username: "student1_alpha",       role: "STUDENT", tenantId: "commit8-live-mnlwx8dr", password: "Student@1234", firstName: "Sue",     lastName: "Alpha" },
  { email: "student2@alpha.test",       username: "student2_alpha",       role: "STUDENT", tenantId: "commit8-live-mnlwx8dr", password: "Student@1234", firstName: "Sol",     lastName: "Alpha" },
  // beta
  { email: "admin@beta.test",           username: "admin_beta",           role: "ADMIN",   tenantId: "commit8-live-mnlwseom", password: "Admin@1234",   firstName: "Beth",    lastName: "Beta" },
  { email: "teacher@beta.test",         username: "teacher_beta",         role: "TEACHER", tenantId: "commit8-live-mnlwseom", password: "Teacher@1234", firstName: "Tim",     lastName: "Beta" },
  { email: "student1@beta.test",        username: "student1_beta",        role: "STUDENT", tenantId: "commit8-live-mnlwseom", password: "Student@1234", firstName: "Bella",   lastName: "Beta" },
  { email: "student2@beta.test",        username: "student2_beta",        role: "STUDENT", tenantId: "commit8-live-mnlwseom", password: "Student@1234", firstName: "Ben",     lastName: "Beta" },
  // gamma
  { email: "admin@gamma.test",          username: "admin_gamma",          role: "ADMIN",   tenantId: "commit8-live-mnlwovpw", password: "Admin@1234",   firstName: "Gina",    lastName: "Gamma" },
  { email: "teacher@gamma.test",        username: "teacher_gamma",        role: "TEACHER", tenantId: "commit8-live-mnlwovpw", password: "Teacher@1234", firstName: "Greg",    lastName: "Gamma" },
  { email: "student1@gamma.test",       username: "student1_gamma",       role: "STUDENT", tenantId: "commit8-live-mnlwovpw", password: "Student@1234", firstName: "Grace",   lastName: "Gamma" },
  { email: "student2@gamma.test",       username: "student2_gamma",       role: "STUDENT", tenantId: "commit8-live-mnlwovpw", password: "Student@1234", firstName: "Gavin",   lastName: "Gamma" },
  // delta
  { email: "admin@delta.test",          username: "admin_delta",          role: "ADMIN",   tenantId: "commit8-live-mnlwkmb4", password: "Admin@1234",   firstName: "Diana",   lastName: "Delta" },
  { email: "teacher@delta.test",        username: "teacher_delta",        role: "TEACHER", tenantId: "commit8-live-mnlwkmb4", password: "Teacher@1234", firstName: "Dan",     lastName: "Delta" },
  { email: "student1@delta.test",       username: "student1_delta",       role: "STUDENT", tenantId: "commit8-live-mnlwkmb4", password: "Student@1234", firstName: "Daisy",   lastName: "Delta" },
  { email: "student2@delta.test",       username: "student2_delta",       role: "STUDENT", tenantId: "commit8-live-mnlwkmb4", password: "Student@1234", firstName: "Dean",    lastName: "Delta" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortCode(str) {
  return str.replace(/\s+/g, "").toUpperCase().slice(0, 6) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function upsertTenant({ tenantId, name }) {
  const existing = await Tenant.findOne({ tenantId }).lean();
  if (existing) {
    console.log(`  tenant exists:   ${tenantId}`);
    return existing;
  }
  const doc = await Tenant.create({ tenantId, name, status: "active", plan: "basic" });
  console.log(`  tenant created:  ${tenantId} — "${name}"`);
  return doc.toObject();
}

async function upsertTenantSettings(tenantId) {
  const existing = await TenantSettings.findOne({ tenantId }).lean();
  if (existing) return existing;
  const doc = await TenantSettings.create({
    tenantId,
    features: { aiEnabled: true, reportsEnabled: true },
    limits: { maxStudents: 500, maxTeachers: 50 },
  });
  console.log(`  settings:        ${tenantId}`);
  return doc.toObject();
}

async function upsertUser(u) {
  const existing = await User.findOne({ email: u.email }).lean();
  if (existing) {
    // Fix invalid tenantId (e.g. "1") if found
    if (existing.tenantId === "1" || !existing.tenantId) {
      await User.updateOne({ _id: existing._id }, {
        $set: { tenantId: u.tenantId, tenantIds: [u.tenantId] },
      });
      console.log(`  fixed tenantId:  ${u.email} → ${u.tenantId}`);
    }
    return await User.findOne({ email: u.email }).lean();
  }
  const hash = await bcrypt.hash(u.password, 10);
  const doc = await User.create({
    email: u.email,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    tenantId: u.tenantId,
    tenantIds: [u.tenantId],
    password: hash,
    isActive: true,
  });
  console.log(`  user created:    ${u.email} (${u.role})`);
  return doc.toObject();
}

async function upsertSubject(tenantId, subjectDef, teacherId) {
  const filter = { tenantId, nameKey: subjectDef.name.toLowerCase() };
  const existing = await Subject.findOne(filter).lean();
  if (existing) return existing;
  const doc = await Subject.create({
    tenantId,
    name: subjectDef.name,
    nameKey: subjectDef.name.toLowerCase(),
    code: subjectDef.code + "_" + tenantId.slice(-4).toUpperCase(),
    description: `${subjectDef.name} curriculum`,
    teacherIds: teacherId ? [teacherId] : [],
    status: "active",
  });
  console.log(`  subject:         ${subjectDef.name} [${tenantId}]`);
  return doc.toObject();
}

async function upsertClassroom(tenantId, teacherId, subjectName, grade) {
  const name = `${subjectName} - ${grade}`;
  const filter = { tenantId, name };
  const existing = await Classroom.findOne(filter).lean();
  if (existing) return existing;
  const doc = await Classroom.create({
    tenantId,
    name,
    grade,
    teacherId,
    studentIds: [],
  });
  console.log(`  classroom:       "${name}" [${tenantId}]`);
  return doc.toObject();
}

async function upsertCourse(tenantId, teacherId, subjectId, classroomId, subjectName, grade) {
  const title = `${subjectName} — ${grade} Fundamentals`;
  const filter = { tenantId, title };
  const existing = await Course.findOne(filter).lean();
  if (existing) return existing;
  const doc = await Course.create({
    tenantId,
    title,
    description: `Core ${subjectName} course for ${grade}`,
    subjectId,
    classroomId,
    createdBy: teacherId,
    code: shortCode(subjectName),
    visibility: "private",
  });
  console.log(`  course:          "${title}" [${tenantId}]`);
  return doc.toObject();
}

async function enrollStudentInCourse(courseId, studentId) {
  const filter = { courseId, userId: studentId };
  const existing = await CourseMember.findOne(filter).lean();
  if (existing) return existing;
  const doc = await CourseMember.create({
    courseId,
    userId: studentId,
    role: "student",
    status: "active",
  });
  console.log(`  enrolled student: ${studentId} → course ${courseId}`);
  return doc.toObject();
}

async function addStudentsToClassroom(classroomId, studentIds) {
  if (!studentIds.length) return;
  await Classroom.updateOne(
    { _id: classroomId },
    { $addToSet: { studentIds: { $each: studentIds } } },
  );
}

// ─── Fix sphinx@teacher.test ──────────────────────────────────────────────────
async function fixSphinxUser() {
  const sphinx = await User.findOne({ email: "sphinx@teacher.test" }).lean();
  if (!sphinx) return;
  if (sphinx.tenantId && sphinx.tenantId !== "1") {
    console.log(`  sphinx ok:       tenantId=${sphinx.tenantId}`);
    return;
  }
  // Assign to pregen-main as TEACHER
  await User.updateOne({ _id: sphinx._id }, {
    $set: { tenantId: "pregen-main", tenantIds: ["pregen-main"] },
  });
  console.log(`  fixed sphinx:    sphinx@teacher.test → pregen-main`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await connectMongo();
  console.log("\n=== PreGen Tenant Setup ===\n");

  // 1. Fix invalid users
  console.log("--- Fixing invalid users ---");
  await fixSphinxUser();

  // 2. Upsert tenants + settings
  console.log("\n--- Tenants ---");
  for (const t of TENANTS) {
    await upsertTenant(t);
    await upsertTenantSettings(t.tenantId);
  }

  // 3. Upsert extra users
  console.log("\n--- Users ---");
  const userMap = {}; // email → user doc
  for (const u of EXTRA_USERS) {
    userMap[u.email] = await upsertUser(u);
  }

  // 4. Per tenant: subjects, classrooms, courses, enrolments
  for (const tenant of TENANTS) {
    console.log(`\n--- Structure: ${tenant.tenantId} ---`);
    const tid = tenant.tenantId;

    // Find teacher and students for this tenant (prefer extra users, fallback to DB)
    let teacher = EXTRA_USERS.find(u => u.tenantId === tid && u.role === "TEACHER");
    let teacherDoc = teacher ? userMap[teacher.email] : await User.findOne({ tenantId: tid, role: "TEACHER" }).lean();
    if (!teacherDoc) {
      console.log(`  no teacher found for ${tid}, skipping`);
      continue;
    }

    const studentDocs = await User.find({ tenantId: tid, role: "STUDENT" }).lean();
    if (!studentDocs.length) {
      console.log(`  no students found for ${tid}`);
    }

    // Create subjects + one classroom + one course per subject
    for (const subjectDef of SUBJECTS_TEMPLATE) {
      const subject = await upsertSubject(tid, subjectDef, teacherDoc._id);
      const classroom = await upsertClassroom(tid, teacherDoc._id, subjectDef.name, "Grade 10");
      const course = await upsertCourse(tid, teacherDoc._id, subject._id, classroom._id, subjectDef.name, "Grade 10");

      // Enrol students
      const studentIds = studentDocs.map(s => s._id);
      await addStudentsToClassroom(classroom._id, studentIds);
      for (const s of studentDocs) {
        await enrollStudentInCourse(course._id, s._id);
      }
    }
  }

  console.log("\n=== Setup complete ===\n");
  await disconnectMongo();
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
