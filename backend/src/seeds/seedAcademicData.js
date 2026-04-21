// backend/src/seeds/seedAcademicData.js
// Seed comprehensive academic data for every active tenant.
//
// Per tenant creates:
//   • 5 teachers   (teacher.1.{tenantSlug}@pregen.test … teacher.5.{tenantSlug}@pregen.test)
//   • 20 students  (student.01.{tenantSlug}@pregen.test … student.20.{tenantSlug}@pregen.test)
//   • 5 classrooms (Grade 7A, Grade 7B, Grade 8A, Grade 8B, Grade 9A)
//   • 5 subjects   (Mathematics, Science, Biology, English, History)
//
// Wires:
//   teacher_i  → classroom_i  (Classroom.teacherId + CourseMember)
//   subject_i  → classroom_i  (Subject.classroomIds + Course workspace)
//   students 1-4  → classroom 1, students 5-8 → classroom 2, etc.
//
// All new users get password: 12345678
// Idempotent — safe to run multiple times.
//
// Usage (from backend/ directory):
//   npm run seed:academic
//   node src/seeds/seedAcademicData.js

import { connectMongo, disconnectMongo } from "../config/mongo.js";
import bcrypt from "bcryptjs";
import Tenant from "../models/Tenant.js";
import User from "../models/userModel.js";
import Subject from "../models/Subject.js";
import Classroom from "../models/Classroom.js";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const SEED_PASSWORD = "12345678";

const CLASS_SPECS = [
  { name: "Grade 7A", grade: "7", section: "A" },
  { name: "Grade 7B", grade: "7", section: "B" },
  { name: "Grade 8A", grade: "8", section: "A" },
  { name: "Grade 8B", grade: "8", section: "B" },
  { name: "Grade 9A", grade: "9", section: "A" },
];

const SUBJECT_SPECS = [
  { name: "Mathematics", code: "MATH", description: "Core mathematics curriculum" },
  { name: "Science",     code: "SCI",  description: "General science and experiments" },
  { name: "Biology",     code: "BIO",  description: "Life sciences and ecology" },
  { name: "English",     code: "ENG",  description: "English language and literature" },
  { name: "History",     code: "HIST", description: "World and regional history" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Slugify tenantId → safe for email/username fragments */
function slug(tenantId) {
  return String(tenantId || "tenant")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase()
    .slice(0, 20);
}

/** Upsert user by email; never overwrites existing users */
async function upsertUser(spec) {
  const existing = await User.findOne({ email: spec.email }).lean();
  if (existing) {
    process.stdout.write(`    skip  ${spec.role.padEnd(8)} ${spec.email}\n`);
    return existing;
  }
  const hashed = await bcrypt.hash(SEED_PASSWORD, 10);
  const user = await User.create({
    email:     spec.email,
    username:  spec.username,
    firstName: spec.firstName,
    lastName:  spec.lastName,
    role:      spec.role,
    tenantId:  spec.tenantId,
    tenantIds: spec.tenantIds || [spec.tenantId].filter(Boolean),
    password:  hashed,
    gender:    "other",
  });
  process.stdout.write(`    new   ${spec.role.padEnd(8)} ${spec.email}\n`);
  return user.toObject();
}

/** Upsert classroom by (tenantId, name); never recreates existing */
async function upsertClassroom(tenantId, spec) {
  const existing = await Classroom.findOne({
    tenantId,
    name: spec.name,
    deletedAt: null,
  }).lean();
  if (existing) {
    process.stdout.write(`    skip  classroom  "${spec.name}"\n`);
    return existing;
  }
  const doc = await Classroom.create({
    tenantId,
    name:       spec.name,
    grade:      spec.grade,
    section:    spec.section,
    studentIds: [],
    deletedAt:  null,
  });
  process.stdout.write(`    new   classroom  "${spec.name}"\n`);
  return doc.toObject();
}

/** Upsert subject by (tenantId, nameKey); never recreates existing */
async function upsertSubject(tenantId, spec, teacherDoc) {
  const nameKey = spec.name.toLowerCase();
  const existing = await Subject.findOne({ tenantId, nameKey, deleted: false }).lean();
  if (existing) {
    process.stdout.write(`    skip  subject    "${spec.name}" (${spec.code})\n`);
    return existing;
  }
  const doc = await Subject.create({
    tenantId,
    name:         spec.name,
    code:         spec.code,
    description:  spec.description,
    teacherIds:   teacherDoc ? [teacherDoc._id] : [],
    classroomIds: [],
    deleted:      false,
    deletedAt:    null,
  });
  process.stdout.write(`    new   subject    "${spec.name}" (${spec.code})\n`);
  return doc.toObject();
}

/** Assign teacher to classroom (idempotent) */
async function assignTeacherToClass(classroom, teacher, tenantId) {
  if (String(classroom.teacherId || "") === String(teacher._id)) return; // already set
  await Classroom.updateOne({ _id: classroom._id }, { teacherId: teacher._id });
  // Teachers can be multi-tenant
  await User.updateOne({ _id: teacher._id }, { $addToSet: { tenantIds: tenantId } });
}

/**
 * Upsert a Course workspace linking subject + classroom.
 * Returns plain object.
 */
async function upsertCourse(tenantId, subject, classroom, actorUserId) {
  const existing = await Course.findOne({
    tenantId,
    subjectId:   subject._id,
    classroomId: classroom._id,
    deleted:     false,
  }).lean();

  if (existing) {
    process.stdout.write(
      `    skip  course     "${subject.name} – ${classroom.name}"\n`,
    );
    return existing;
  }

  const classLabel = [classroom.name, classroom.grade, classroom.section]
    .filter(Boolean)
    .join(" ");
  const title     = classLabel ? `${subject.name} - ${classLabel}` : subject.name;
  const shortName = `${subject.code || subject.name} - ${classroom.name}`.slice(0, 50);

  const doc = await Course.create({
    title,
    shortName,
    description: subject.description || "",
    tenantId,
    subjectId:   subject._id,
    classroomId: classroom._id,
    createdBy:   actorUserId,
    visibility:  "private",
    type:        "course",
  });

  process.stdout.write(
    `    new   course     "${doc.title}" (code: ${doc.code})\n`,
  );
  return doc.toObject ? doc.toObject() : doc;
}

/** Upsert a single CourseMember record */
async function upsertMember(courseId, userId, role) {
  await CourseMember.findOneAndUpdate(
    { courseId, userId },
    {
      $set:         { role, status: "active" },
      $setOnInsert: { joinedAt: new Date() },
    },
    { upsert: true, new: false },
  );
}

/**
 * Enroll a batch of students into a classroom.
 * Adds to Classroom.studentIds and syncs CourseMember for every linked course.
 */
async function enrollStudents(tenantId, classroom, studentDocs) {
  const studentIds = studentDocs.map((s) => s._id);
  await Classroom.updateOne(
    { _id: classroom._id },
    { $addToSet: { studentIds: { $each: studentIds } } },
  );

  const linkedCourses = await Course.find({
    classroomId: classroom._id,
    tenantId,
    deleted:     false,
  })
    .select("_id")
    .lean();

  for (const course of linkedCourses) {
    for (const student of studentDocs) {
      await upsertMember(course._id, student._id, "student");
    }
  }
}

// ─── Per-tenant seeding ───────────────────────────────────────────────────────

async function seedTenant(tenant) {
  const { tenantId } = tenant;
  const s = slug(tenantId);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Tenant: ${tenantId}`);
  console.log("═".repeat(60));

  // ── 1. Teachers ────────────────────────────────────────────────
  console.log("\n  Teachers (5):");
  const teachers = [];
  for (let i = 1; i <= 5; i++) {
    const teacher = await upsertUser({
      email:     `teacher.${i}.${s}@pregen.test`,
      username:  `tch_${i}_${s}`.slice(0, 30),
      firstName: `Teacher${i}`,
      lastName:  `(${tenantId})`,
      role:      "TEACHER",
      tenantId,
      tenantIds: [tenantId],
    });
    teachers.push(teacher);
  }

  // ── 2. Students ────────────────────────────────────────────────
  console.log("\n  Students (20):");
  const students = [];
  for (let i = 1; i <= 20; i++) {
    const n = String(i).padStart(2, "0");
    const student = await upsertUser({
      email:     `student.${n}.${s}@pregen.test`,
      username:  `stu_${n}_${s}`.slice(0, 30),
      firstName: `Student${n}`,
      lastName:  `(${tenantId})`,
      role:      "STUDENT",
      tenantId,
      tenantIds: [tenantId],
    });
    students.push(student);
  }

  // ── 3. Classrooms ──────────────────────────────────────────────
  console.log("\n  Classrooms (5):");
  const classrooms = [];
  for (const spec of CLASS_SPECS) {
    const cls = await upsertClassroom(tenantId, spec);
    classrooms.push(cls);
  }

  // ── 4. Subjects ────────────────────────────────────────────────
  console.log("\n  Subjects (5):");
  const subjects = [];
  for (let i = 0; i < SUBJECT_SPECS.length; i++) {
    const subj = await upsertSubject(tenantId, SUBJECT_SPECS[i], teachers[i]);
    subjects.push(subj);
  }

  // ── 5. Teacher → Classroom ─────────────────────────────────────
  console.log("\n  Assigning teachers → classrooms:");
  for (let i = 0; i < 5; i++) {
    await assignTeacherToClass(classrooms[i], teachers[i], tenantId);
    console.log(`    teacher_${i + 1} → "${classrooms[i].name}"`);
  }

  // ── 6. Subject → Classroom + Course workspace ──────────────────
  // Each class gets 2 subjects: subject_i and subject_{(i+1)%5}
  // This ensures every class has at least 2 subjects as required.
  console.log("\n  Linking subjects → classrooms + provisioning courses (2 subjects per class):");
  const courses = [];
  for (let i = 0; i < 5; i++) {
    const primarySubjectIdx = i;
    const secondarySubjectIdx = (i + 1) % 5;

    for (const subjectIdx of [primarySubjectIdx, secondarySubjectIdx]) {
      // Add classroom to subject.classroomIds (idempotent)
      await Subject.updateOne(
        { _id: subjects[subjectIdx]._id },
        { $addToSet: { classroomIds: classrooms[i]._id } },
      );

      // Re-read classroom to guarantee fresh grade/section fields
      const freshClass =
        (await Classroom.findById(classrooms[i]._id).lean()) || classrooms[i];

      const course = await upsertCourse(
        tenantId,
        subjects[subjectIdx],
        freshClass,
        teachers[i]._id,
      );
      courses.push(course);

      // Teacher is a CourseMember in their own course
      await upsertMember(course._id, teachers[i]._id, "teacher");

      console.log(
        `    "${subjects[subjectIdx].name}" (${subjects[subjectIdx].code}) → "${classrooms[i].name}"`,
      );
    }
  }

  // ── 7. Enroll students: 4 per class ───────────────────────────
  console.log("\n  Enrolling students (4 per class):");
  for (let i = 0; i < 5; i++) {
    const batch = students.slice(i * 4, i * 4 + 4);
    await enrollStudents(tenantId, classrooms[i], batch);
    console.log(
      `    "${classrooms[i].name}" ← students ${i * 4 + 1}–${i * 4 + 4}`,
    );
  }

  console.log(`\n  ✓ ${tenantId}: seeded ${teachers.length} teachers, ${students.length} students, ${classrooms.length} classes, ${subjects.length} subjects, ${courses.length} course workspaces (2 subjects per class)`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed:academic] Connecting to MongoDB…");
  await connectMongo();
  console.log("[seed:academic] Connected.\n");

  const tenants = await Tenant.find({}).lean();

  if (!tenants.length) {
    console.log(
      "[seed:academic] No tenants found. Run `npm run seed` first to create tenants.",
    );
    await disconnectMongo();
    process.exit(0);
  }

  console.log(
    `[seed:academic] Found ${tenants.length} tenant(s): ${tenants.map((t) => t.tenantId).join(", ")}`,
  );

  for (const tenant of tenants) {
    await seedTenant(tenant);
  }

  console.log("\n");
  console.log("═".repeat(60));
  console.log("  seed:academic complete");
  console.log("═".repeat(60));
  console.log("\n  Password for all seeded users : 12345678");
  console.log("  Teacher emails : teacher.{1-5}.{tenantSlug}@pregen.test");
  console.log("  Student emails : student.{01-20}.{tenantSlug}@pregen.test");
  console.log("\n  Class ↔ teacher ↔ subjects ↔ students mapping per tenant:");
  for (let i = 0; i < 5; i++) {
    const subj1 = SUBJECT_SPECS[i].code;
    const subj2 = SUBJECT_SPECS[(i + 1) % 5].code;
    console.log(
      `    ${CLASS_SPECS[i].name.padEnd(12)}  teacher_${i + 1}  ${subj1}+${subj2}  students ${String(i * 4 + 1).padStart(2)}-${i * 4 + 4}`,
    );
  }
  console.log();

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed:academic] Failed:", err);
  process.exit(1);
});
