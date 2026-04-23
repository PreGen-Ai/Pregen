/**
 * PreGen LMS — k6 Load Test Orchestrator
 *
 * Runs all 6 scenarios simultaneously with a shared setup() that seeds test data.
 *
 * Required env vars:
 *   BASE_URL        - API base URL (default: http://localhost:5000)
 *   SA_EMAIL        - Superadmin email (must already exist)
 *   SA_PASSWORD     - Superadmin password
 *
 * Optional env vars:
 *   STAGE           - Load stage A|B|C|D|E|storm (default: A)
 *   TENANT_COUNT    - How many tenants to create in setup (default: 5)
 *   STUDENTS_PER    - Students per tenant (default: 30)
 *   TEACHERS_PER    - Teachers per tenant (default: 5)
 *   STUB_AI         - Skip real AI calls; set true in non-AI scenarios (default: true)
 *   TEST_PASSWORD   - Password given to all seeded users (default: LoadTest#1234)
 *   SCENARIO        - Run a single scenario (1–6); omit to run all
 *
 * Usage:
 *   k6 run -e BASE_URL=https://api.pregen.io \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=B \
 *          k6/run.js
 *
 * Run only the submission storm:
 *   k6 run -e STAGE=storm -e SCENARIO=5 ... k6/run.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

import { getStages } from './config/stages.js';
import { getThresholds } from './config/thresholds.js';

import { loginNavigationScenario }  from './scenarios/01_login_navigation.js';
import { studentFlowScenario }       from './scenarios/02_student_flow.js';
import { teacherWorkflowScenario }   from './scenarios/03_teacher_workflow.js';
import { adminTenantScenario }       from './scenarios/04_admin_tenant.js';
import { submissionStormScenario }   from './scenarios/05_submission_storm.js';
import { multiTenantScenario }       from './scenarios/06_multi_tenant.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE         = __ENV.BASE_URL       || 'http://localhost:5000';
const SA_EMAIL     = __ENV.SA_EMAIL;
const SA_PASSWORD  = __ENV.SA_PASSWORD;
const STAGE        = __ENV.STAGE          || 'A';
const TENANT_COUNT = parseInt(__ENV.TENANT_COUNT   || '5', 10);
const STUDENTS_PER = parseInt(__ENV.STUDENTS_PER   || '30', 10);
const TEACHERS_PER = parseInt(__ENV.TEACHERS_PER   || '5', 10);
const TEST_PWD     = __ENV.TEST_PASSWORD  || 'LoadTest#1234';
const ONLY         = __ENV.SCENARIO       ? parseInt(__ENV.SCENARIO, 10) : null;

const setupErrors = new Counter('setup_errors');

// ---------------------------------------------------------------------------
// Traffic weights per scenario (must sum to ~100)
// Students: 70%, Teachers: 15%, Admins: 10%, SuperAdmin/analytics: 5%
//   S1 login  S2 student  S3 teacher  S4 admin  S5 storm  S6 multi
//     10         45          20          15         5         5
// ---------------------------------------------------------------------------
function makeScenarios(stages) {
  const all = {
    login_navigation: {
      executor: 'ramping-vus',
      exec: 'scenario1',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.10) })),
      gracefulRampDown: '30s',
    },
    student_flow: {
      executor: 'ramping-vus',
      exec: 'scenario2',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.45) })),
      gracefulRampDown: '30s',
    },
    teacher_workflow: {
      executor: 'ramping-vus',
      exec: 'scenario3',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.20) })),
      gracefulRampDown: '30s',
    },
    admin_tenant: {
      executor: 'ramping-vus',
      exec: 'scenario4',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.15) })),
      gracefulRampDown: '30s',
    },
    submission_storm: {
      executor: 'ramping-vus',
      exec: 'scenario5',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.05) })),
      gracefulRampDown: '30s',
    },
    multi_tenant: {
      executor: 'ramping-vus',
      exec: 'scenario6',
      startVUs: 0,
      stages: stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * 0.05) })),
      gracefulRampDown: '30s',
    },
  };

  if (!ONLY) return all;

  // Single-scenario mode: run all VUs under the selected scenario
  const keys = ['login_navigation', 'student_flow', 'teacher_workflow', 'admin_tenant', 'submission_storm', 'multi_tenant'];
  const chosen = keys[ONLY - 1];
  return {
    [chosen]: {
      executor: 'ramping-vus',
      exec: `scenario${ONLY}`,
      startVUs: 0,
      stages,
      gracefulRampDown: '30s',
    },
  };
}

const stages = getStages(STAGE);
export const options = {
  scenarios: makeScenarios(stages),
  thresholds: {
    ...getThresholds(STAGE),
    setup_errors: ['count<1'],
  },
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
};

// ---------------------------------------------------------------------------
// Helpers used only in setup()
// ---------------------------------------------------------------------------
function safeJson(res) {
  try { return res.json(); } catch { return null; }
}

function mustOk(res, label) {
  if (res.status < 200 || res.status >= 300) {
    setupErrors.add(1);
    console.error(`[setup] ${label} failed: ${res.status} — ${res.body}`);
    return false;
  }
  return true;
}

function saHeader(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}

function createTenant(saToken, idx) {
  const tenantId = `lt_tenant_${idx}_${Date.now()}`;
  const res = http.post(
    `${BASE}/api/admin/system/super/tenants`,
    JSON.stringify({
      tenantId,
      name: `LoadTest School ${idx}`,
      status: 'active',
      plan: 'standard',
      limits: { studentLimit: STUDENTS_PER + 10, aiHardCapTokensPerMonth: 1000000 },
    }),
    saHeader(saToken),
  );
  if (!mustOk(res, `createTenant ${idx}`)) return null;
  const body = safeJson(res);
  return body?.tenant || body;
}

function createAdmin(saToken, tenantId, idx) {
  const email = `lt_admin_${tenantId}_${idx}@loadtest.pregen.io`;
  const res = http.post(
    `${BASE}/api/admin/system/createAdmin`,
    JSON.stringify({ tenantId, email, name: `LT Admin ${idx}`, password: TEST_PWD }),
    saHeader(saToken),
  );
  if (!mustOk(res, `createAdmin ${tenantId}`)) return null;
  const body = safeJson(res);
  return { email, password: TEST_PWD, tenantId, role: 'ADMIN', ...(body?.user || {}) };
}

function inviteUser(adminToken, tenantId, role, idx) {
  const prefix = role === 'TEACHER' ? 'lt_teacher' : 'lt_student';
  const email = `${prefix}_${tenantId}_${idx}_${Date.now()}@loadtest.pregen.io`;
  const res = http.post(
    `${BASE}/api/admin/users/invite`,
    JSON.stringify({ email, role, name: `LT ${role} ${idx}`, tenantId }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId } },
  );
  if (!mustOk(res, `invite ${role} ${idx} @ ${tenantId}`)) return null;
  const body = safeJson(res);
  const password = body?.tempPassword || TEST_PWD;
  return { email, password, tenantId, role };
}

function loginUser(email, password, tenantId) {
  const h = { headers: { 'Content-Type': 'application/json' } };
  if (tenantId) h.headers['x-tenant-id'] = tenantId;
  const res = http.post(`${BASE}/api/users/login`, JSON.stringify({ email, password }), h);
  if (res.status !== 200) return null;
  return res.json('token');
}

function createCourse(adminToken, tenantId, idx) {
  const res = http.post(
    `${BASE}/api/courses`,
    JSON.stringify({
      name: `LT Course ${idx}`,
      subject: ['Math', 'Science', 'History', 'English'][idx % 4],
      description: `Load test course ${idx}`,
      grade: `${(idx % 12) + 1}`,
      courseCode: `LTC${idx}_${Date.now()}`,
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId } },
  );
  if (!mustOk(res, `createCourse ${idx} @ ${tenantId}`)) return null;
  const body = safeJson(res);
  return body?.course || body;
}

function createAssignment(teacherToken, tenantId, courseId, idx) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const res = http.post(
    `${BASE}/api/teachers/assignments`,
    JSON.stringify({
      courseId,
      title: `LT Assignment ${idx}`,
      description: 'Describe the topic in 2–3 sentences.',
      dueDate: tomorrow,
      totalMarks: 100,
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}`, 'x-tenant-id': tenantId } },
  );
  if (!mustOk(res, `createAssignment ${idx} @ ${tenantId}`)) return null;
  const body = safeJson(res);
  return body?.assignment || body;
}

// ---------------------------------------------------------------------------
// setup() — runs once before all VUs start
// ---------------------------------------------------------------------------
export function setup() {
  if (!SA_EMAIL || !SA_PASSWORD) {
    throw new Error('SA_EMAIL and SA_PASSWORD environment variables are required');
  }

  // 1. Superadmin login
  const saToken = loginUser(SA_EMAIL, SA_PASSWORD, null);
  if (!saToken) throw new Error(`Superadmin login failed for ${SA_EMAIL}`);

  const tenants = [];
  const allStudents = [];
  const allTeachers = [];
  const allAdmins = [];
  const allCourses = [];
  const allAssignments = [];

  for (let t = 0; t < TENANT_COUNT; t++) {
    // 2. Create tenant
    const tenant = createTenant(saToken, t);
    if (!tenant) continue;
    const tenantId = tenant.tenantId || tenant._id || tenant.id;

    // 3. Create admin for this tenant
    const admin = createAdmin(saToken, tenantId, t);
    if (!admin) continue;

    const adminToken = loginUser(admin.email, admin.password, tenantId);
    if (!adminToken) {
      console.error(`[setup] Admin login failed for ${admin.email}`);
      continue;
    }
    allAdmins.push(admin);

    // 4. Create teachers
    const teachers = [];
    for (let i = 0; i < TEACHERS_PER; i++) {
      const teacher = inviteUser(adminToken, tenantId, 'TEACHER', i);
      if (teacher) {
        teachers.push(teacher);
        allTeachers.push(teacher);
      }
    }

    // 5. Create students
    const students = [];
    for (let i = 0; i < STUDENTS_PER; i++) {
      const student = inviteUser(adminToken, tenantId, 'STUDENT', i);
      if (student) {
        students.push(student);
        allStudents.push(student);
      }
    }

    // 6. Create 2 courses
    const courses = [];
    for (let i = 0; i < 2; i++) {
      const course = createCourse(adminToken, tenantId, t * 10 + i);
      if (course) {
        courses.push(course);
        allCourses.push(course);
      }
    }

    // 7. Create 2 assignments per course using first teacher
    const assignments = [];
    const teacherToken = teachers.length ? loginUser(teachers[0].email, teachers[0].password, tenantId) : null;
    if (teacherToken) {
      for (const course of courses) {
        const cid = course._id || course.id;
        for (let i = 0; i < 2; i++) {
          const asgn = createAssignment(teacherToken, tenantId, cid, i);
          if (asgn) {
            assignments.push(asgn);
            allAssignments.push(asgn);
          }
        }
      }
    }

    tenants.push({ id: tenantId, students, teachers, admin, courses, assignments });

    // Brief pause to avoid overwhelming the server during seeding
    sleep(0.5);
  }

  console.log(`[setup] Seeded: ${tenants.length} tenants, ${allStudents.length} students, ${allTeachers.length} teachers, ${allAssignments.length} assignments`);

  return {
    tenants,
    students: allStudents,
    teachers: allTeachers,
    admins: allAdmins,
    courses: allCourses,
    assignments: allAssignments,
    superadminToken: saToken,
  };
}

// ---------------------------------------------------------------------------
// teardown() — clean up seeded data (best-effort, non-blocking on failure)
// ---------------------------------------------------------------------------
export function teardown(data) {
  if (!data?.superadminToken) return;
  const saToken = data.superadminToken;

  for (const tenant of (data.tenants || [])) {
    const tenantId = tenant.id;
    if (!tenantId) continue;
    const res = http.del(
      `${BASE}/api/admin/system/super/tenants/${tenantId}`,
      null,
      saHeader(saToken),
    );
    if (res.status >= 400) {
      console.warn(`[teardown] Failed to delete tenant ${tenantId}: ${res.status}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario exec functions — delegate to imported scenario functions
// ---------------------------------------------------------------------------
export function scenario1(data) { loginNavigationScenario(data); }
export function scenario2(data) { studentFlowScenario(data); }
export function scenario3(data) { teacherWorkflowScenario(data); }
export function scenario4(data) { adminTenantScenario(data); }
export function scenario5(data) { submissionStormScenario(data); }
export function scenario6(data) { multiTenantScenario(data); }

// Default export required by k6 (used when no scenario executor specifies exec)
export default function(data) { studentFlowScenario(data); }
