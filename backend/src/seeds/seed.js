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

const TENANT_ID = "tnt_test_001";
const TENANT_NAME = "Test School";

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
];

async function upsertTenant() {
  const existing = await Tenant.findOne({ tenantId: TENANT_ID }).lean();
  if (existing) {
    console.log(`[seed] tenant exists:   ${TENANT_ID}`);
    return existing;
  }
  const doc = await Tenant.create({
    tenantId: TENANT_ID,
    name: TENANT_NAME,
    status: "active",
    plan: "basic",
  });
  console.log(`[seed] tenant created:  ${TENANT_ID} — "${TENANT_NAME}"`);
  return doc.toObject();
}

async function upsertTenantSettings() {
  const filter = { tenantId: TENANT_ID };
  const existing = await TenantSettings.findOne(filter).lean();
  if (existing) {
    console.log(`[seed] settings exist:  tenantId=${TENANT_ID}`);
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
  console.log(`[seed] settings created: tenantId=${TENANT_ID}`);
  return doc.toObject();
}

async function upsertUser(spec) {
  const existing = await User.findOne({ email: spec.email }).lean();
  if (existing) {
    console.log(`[seed] user exists:     ${spec.email} (${spec.role})`);
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
  console.log(`[seed] user created:    ${spec.email} (${spec.role})`);
  return user.toObject();
}

async function main() {
  console.log("[seed] connecting to MongoDB…");
  await connectMongo();
  console.log("[seed] connected\n");

  await upsertTenant();
  await upsertTenantSettings();
  console.log();
  for (const u of SEED_USERS) {
    await upsertUser(u);
  }

  console.log("\n[seed] complete. Test credentials:");
  for (const u of SEED_USERS) {
    console.log(
      `  ${u.role.padEnd(12)}  ${u.email.padEnd(32)} pw: ${u.password}`,
    );
  }
  console.log(`  tenantId (admin/teacher/student): ${TENANT_ID}`);
  console.log();

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
