// backend/src/seeds/seed.js
// Bootstrap minimal test data for regression and live-flow verification.
// Safe to run multiple times — uses upserts; never overwrites existing records.
//
// Usage (from backend/ directory):
//   npm run seed
//   node src/seeds/seed.js

// Load env config before anything else (env.js runs dotenv.config at module level
// via its own top-level code, which fires when mongo.js is imported below).
import { connectMongo, disconnectMongo } from "../config/mongo.js";
import bcrypt from "bcryptjs";
import Tenant from "../models/Tenant.js";
import User from "../models/userModel.js";
import TenantSettings from "../models/TenantSettings.js";
import Subject from "../models/Subject.js";
import Classroom from "../models/Classroom.js";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";

const TENANT_ID = "tnt_test_001";
const TENANT_NAME = "Test School";

// Secondary tenant seeded for QA / docs alignment
const TESTSCHOOL_TENANT_ID = "testschool";
const TESTSCHOOL_TENANT_NAME = "Test School (QA)";

const SEED_USERS = [
  {
    email: "superadmin@pregen.test",
    username: "superadmin_seed",
    firstName: "Super",
    lastName: "Admin",
    role: "SUPERADMIN",
    tenantId: null,
    tenantIds: [],
    password: "Admin@1234",
  },
  {
    email: "admin@pregen.test",
    username: "admin_seed",
    firstName: "Tenant",
    lastName: "Admin",
    role: "ADMIN",
    tenantId: TENANT_ID,
    tenantIds: [TENANT_ID],
    password: "Admin@1234",
  },
  {
    email: "teacher@pregen.test",
    username: "teacher_seed",
    firstName: "Test",
    lastName: "Teacher",
    role: "TEACHER",
    tenantId: TENANT_ID,
    tenantIds: [TENANT_ID],
    password: "Teacher@1234",
  },
  {
    email: "student@pregen.test",
    username: "student_seed",
    firstName: "Test",
    lastName: "Student",
    role: "STUDENT",
    tenantId: TENANT_ID,
    tenantIds: [TENANT_ID],
    password: "Student@1234",
  },
  // QA alias tenant — keeps docs/test-suites in sync
  {
    email: "admin@testschool.com",
    username: "admin_testschool",
    firstName: "School",
    lastName: "Admin",
    role: "ADMIN",
    tenantId: TESTSCHOOL_TENANT_ID,
    tenantIds: [TESTSCHOOL_TENANT_ID],
    password: "Admin@1234",
  },
];

async function upsertTenantById(tenantId, name, plan = "basic") {
  const existing = await Tenant.findOne({ tenantId }).lean();
  if (existing) {
    console.log(`[seed] tenant exists:      ${tenantId}`);
    return existing;
  }
  const doc = await Tenant.create({
    tenantId,
    name,
    status: "active",
    plan,
  });
  console.log(`[seed] tenant created:     ${tenantId} — "${name}"`);
  return doc.toObject();
}

async function upsertTenant() {
  return upsertTenantById(TENANT_ID, TENANT_NAME);
}

async function upsertTenantSettings() {
  const filter = { tenantId: TENANT_ID };
  const existing = await TenantSettings.findOne(filter).lean();
  if (existing) {
    console.log(`[seed] settings exist:     tenantId=${TENANT_ID}`);
    return existing;
  }
  const doc = await TenantSettings.create({
    tenantId: TENANT_ID,
    branding: {
      institutionName: TENANT_NAME,
      primaryColor: "#D4AF37",
      logoUrl: "",
    },
    ai: {
      enabled: true,
      feedbackTone: "neutral",
      softCapDaily: 50000,
      softCapWeekly: 250000,
      features: {
        aiGrading: true,
        aiQuizGen: true,
        aiTutor: true,
        aiSummaries: true,
      },
    },
  });
  console.log(`[seed] settings created:   tenantId=${TENANT_ID}`);
  return doc.toObject();
}

async function upsertUser(spec) {
  const existing = await User.findOne({ email: spec.email }).lean();
  if (existing) {
    console.log(`[seed] user exists:        ${spec.email} (${spec.role})`);
    return existing;
  }
  const hashed = await bcrypt.hash(spec.password, 10);
  const user = await User.create({
    email: spec.email,
    username: spec.username,
    firstName: spec.firstName,
    lastName: spec.lastName,
    role: spec.role,
    tenantId: spec.tenantId || null,
    tenantIds: spec.tenantIds || [],
    password: hashed,
    gender: "other",
  });
  console.log(`[seed] user created:       ${spec.email} (${spec.role})`);
  return user.toObject();
}

async function upsertSubject(teacherDoc) {
  const nameKey = "mathematics";
  const existing = await Subject.findOne({
    tenantId: TENANT_ID,
    nameKey,
    deleted: false,
  }).lean();
  if (existing) {
    console.log(`[seed] subject exists:     Mathematics (${TENANT_ID})`);
    return existing;
  }
  const doc = await Subject.create({
    tenantId: TENANT_ID,
    name: "Mathematics",
    code: "MATH",
    description: "Core mathematics curriculum",
    teacherIds: teacherDoc ? [teacherDoc._id] : [],
  });
  console.log(`[seed] subject created:    Mathematics (${TENANT_ID})`);
  return doc.toObject();
}

async function upsertClassroom(teacherDoc, studentDoc) {
  const existing = await Classroom.findOne({
    tenantId: TENANT_ID,
    name: "Class 10A",
    deletedAt: null,
  }).lean();
  if (existing) {
    console.log(`[seed] classroom exists:   Class 10A (${TENANT_ID})`);
    return existing;
  }
  const doc = await Classroom.create({
    tenantId: TENANT_ID,
    name: "Class 10A",
    grade: "10",
    section: "A",
    teacherId: teacherDoc?._id || null,
    studentIds: studentDoc ? [studentDoc._id] : [],
  });
  console.log(`[seed] classroom created:  Class 10A (${TENANT_ID})`);
  return doc.toObject();
}

async function upsertCourse(teacherDoc, subjectDoc, classroomDoc) {
  const existing = await Course.findOne({
    tenantId: TENANT_ID,
    title: "Introduction to Algebra",
    deleted: false,
  }).lean();
  if (existing) {
    console.log(`[seed] course exists:      Introduction to Algebra (${TENANT_ID})`);
    return existing;
  }
  const doc = await Course.create({
    title: "Introduction to Algebra",
    description: "Foundational algebra concepts for secondary school students.",
    tenantId: TENANT_ID,
    type: "course",
    createdBy: teacherDoc._id,
    subjectId: subjectDoc?._id || null,
    classroomId: classroomDoc?._id || null,
    visibility: "private",
  });
  console.log(`[seed] course created:     Introduction to Algebra (code: ${doc.code})`);
  return doc.toObject();
}

async function upsertCourseMember(courseDoc, userDoc, role) {
  const existing = await CourseMember.findOne({
    courseId: courseDoc._id,
    userId: userDoc._id,
  }).lean();
  if (existing) {
    console.log(
      `[seed] member exists:      ${userDoc.email} as ${role} in course`,
    );
    return existing;
  }
  const doc = await CourseMember.create({
    courseId: courseDoc._id,
    userId: userDoc._id,
    role,
    status: "active",
  });
  console.log(
    `[seed] member created:     ${userDoc.email} as ${role} in course`,
  );
  return doc.toObject();
}

async function main() {
  console.log("[seed] connecting to MongoDB…");
  await connectMongo();
  console.log("[seed] connected\n");

  await upsertTenant();
  await upsertTenantById(TESTSCHOOL_TENANT_ID, TESTSCHOOL_TENANT_NAME);
  await upsertTenantSettings();

  console.log();
  const userDocs = {};
  for (const u of SEED_USERS) {
    userDocs[u.role] = await upsertUser(u);
  }

  console.log();
  const subjectDoc = await upsertSubject(userDocs.TEACHER);
  const classroomDoc = await upsertClassroom(userDocs.TEACHER, userDocs.STUDENT);
  const courseDoc = await upsertCourse(userDocs.TEACHER, subjectDoc, classroomDoc);
  await upsertCourseMember(courseDoc, userDocs.TEACHER, "teacher");
  await upsertCourseMember(courseDoc, userDocs.STUDENT, "student");

  console.log("\n[seed] complete.\n");
  console.log("  Test credentials:");
  for (const u of SEED_USERS) {
    console.log(
      `    ${u.role.padEnd(12)}  ${u.email.padEnd(36)}  pw: ${u.password}`,
    );
  }
  console.log();
  console.log(`  Primary tenant:    ${TENANT_ID}  ("${TENANT_NAME}")`);
  console.log(`  QA alias tenant:   ${TESTSCHOOL_TENANT_ID}  ("${TESTSCHOOL_TENANT_NAME}")`);
  console.log(`  Subject:   Mathematics  (MATH)`);
  console.log(`  Classroom: Class 10A  (grade 10, section A)`);
  console.log(`  Course:    Introduction to Algebra  (code: ${courseDoc.code})`);
  console.log();

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
