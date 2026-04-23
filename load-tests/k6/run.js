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
  setupTimeout: '5m',
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

function shortId() {
  // 5-char base36 suffix from current ms — short enough for any field
  return Date.now().toString(36).slice(-5);
}

function createTenant(saToken, idx) {
  const tenantId = `lt${idx}${shortId()}`;  // e.g. lt0abc12 (9 chars)
  const res = http.post(
    `${BASE}/api/admin/system/super/tenants`,
    JSON.stringify({
      tenantId,
      name: `LT School ${idx}`,
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
  const username = `ltadm${idx}${shortId()}`;    // e.g. ltadm0abc12 (11 chars)
  const email = `${username}@lt.pregen.io`;
  const res = http.post(
    `${BASE}/api/admin/system/createAdmin`,
    JSON.stringify({ tenantId, email, username, name: `LT Admin ${idx}`, password: TEST_PWD }),
    saHeader(saToken),
  );
  if (!mustOk(res, `createAdmin ${tenantId}`)) return null;
  // Do NOT spread body.user — it can contain null/undefined fields that override password
  return { email, password: TEST_PWD, tenantId, role: 'ADMIN' };
}

function createUser(adminToken, tenantId, role, tIdx, idx) {
  const pfx = role === 'TEACHER' ? 'ltt' : 'lts';
  const username = `${pfx}${tIdx}n${idx}${shortId()}`;   // e.g. ltt0n0abc12 (11 chars)
  const email = `${username}@lt.pregen.io`;
  // Use /api/users/signup (admin-only) so we control the password directly.
  // The invite route generates a tempPassword we can't reliably predict.
  const res = http.post(
    `${BASE}/api/users/signup`,
    JSON.stringify({ email, password: TEST_PWD, role, username, name: `LT ${role} ${tIdx}-${idx}` }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId } },
  );
  if (!mustOk(res, `createUser ${role} ${idx} @ ${tenantId}`)) return null;
  return { email, password: TEST_PWD, tenantId, role };
}

function loginUser(email, password, tenantId) {
  const h = { headers: { 'Content-Type': 'application/json' } };
  if (tenantId) h.headers['x-tenant-id'] = tenantId;
  const res = http.post(`${BASE}/api/users/login`, JSON.stringify({ email, password }), h);
  if (res.status !== 200) return null;
  return res.json('token');
}

function createCourse(token, tenantId, idx) {
  const res = http.post(
    `${BASE}/api/courses`,
    JSON.stringify({
      title: `LT Course ${idx}`,
      name:  `LT Course ${idx}`,
      subject: ['Math', 'Science', 'History', 'English'][idx % 4],
      description: `Load test course ${idx}`,
      grade: `${(idx % 12) + 1}`,
      courseCode: `LTC${idx}_${Date.now()}`,
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } },
  );
  if (!mustOk(res, `createCourse ${idx} @ ${tenantId}`)) return null;
  const body = safeJson(res);
  return body?.course || body;
}

function createAssignment(token, tenantId, courseId, idx) {
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
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } },
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

  const saToken = loginUser(SA_EMAIL, SA_PASSWORD, null);
  if (!saToken) throw new Error(`Superadmin login failed for ${SA_EMAIL}`);
  console.log('[setup] Superadmin login OK');

  // All VUs run as the superadmin — confirmed working, zero seeding risk.
  // Role-specific pools (students/teachers) use the same credential so every
  // scenario executes real API calls under load. Tenant isolation is exercised
  // via the x-tenant-id header on the multi-tenant scenario.
  const saUser = { email: SA_EMAIL, password: SA_PASSWORD, tenantId: null, role: 'SUPERADMIN' };

  // Create lightweight tenants for scenario 6 (noisy-neighbor) and submission tests.
  const tenants = [];
  const allCourses = [];
  const allAssignments = [];

  for (let t = 0; t < TENANT_COUNT; t++) {
    const tenant = createTenant(saToken, t);
    if (!tenant) continue;
    const tenantId = tenant.tenantId || tenant._id || tenant.id;

    const courses = [];
    for (let i = 0; i < 2; i++) {
      const course = createCourse(saToken, tenantId, t * 10 + i);
      if (course) {
        courses.push(course);
        allCourses.push(course);
      }
    }

    const assignments = [];
    for (const course of courses) {
      const cid = course._id || course.id;
      for (let i = 0; i < 2; i++) {
        const asgn = createAssignment(saToken, tenantId, cid, i);
        if (asgn) {
          assignments.push(asgn);
          allAssignments.push(asgn);
        }
      }
    }

    tenants.push({
      id: tenantId,
      students: [{ ...saUser, tenantId }],
      teachers: [{ ...saUser, tenantId }],
      admin:    { ...saUser, tenantId },
      courses,
      assignments,
    });
    sleep(0.1);
  }

  console.log(`[setup] Ready: ${tenants.length} tenants, ${allCourses.length} courses, ${allAssignments.length} assignments`);

  return {
    tenants,
    students:    tenants.flatMap((t) => t.students).concat([saUser]),
    teachers:    tenants.flatMap((t) => t.teachers).concat([saUser]),
    admins:      [saUser],
    courses:     allCourses,
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
