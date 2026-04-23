/**
 * Scenario 1 — Login & Navigation
 *
 * Tests auth throughput and first-page backend pressure with a mixed role mix:
 *   70 % students, 20 % teachers, 10 % admins
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=A \
 *          scenarios/01_login_navigation.js
 */

import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { getStages } from '../config/stages.js';
import { getThresholds } from '../config/thresholds.js';
import { login, get } from '../lib/auth.js';
import { okJson, okList } from '../lib/checks.js';
import { pick, thinkTime } from '../lib/rng.js';

const loginErrors = new Counter('login_errors');

let _loginFailed = false;

const STAGE = __ENV.STAGE || 'A';
export const options = {
  stages: getStages(STAGE),
  thresholds: getThresholds(STAGE),
};

// ---------------------------------------------------------------------------
// Per-VU state (not shared across VUs)
// ---------------------------------------------------------------------------
let _token = null;
let _user = null;
let _tenantId = null;

// ---------------------------------------------------------------------------
// Standalone setup — when run without run.js
// ---------------------------------------------------------------------------
export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) {
    throw new Error('SA_EMAIL and SA_PASSWORD env vars required');
  }

  const saToken = login(saEmail, saPassword);
  if (!saToken) throw new Error('Superadmin login failed in setup');

  // Return pre-seeded user lists from env (JSON arrays) or fall back to a
  // minimal single-tenant setup using the superadmin itself.
  const rawStudents = __ENV.TEST_STUDENTS ? JSON.parse(__ENV.TEST_STUDENTS) : null;
  const rawTeachers = __ENV.TEST_TEACHERS ? JSON.parse(__ENV.TEST_TEACHERS) : null;
  const rawAdmins   = __ENV.TEST_ADMINS   ? JSON.parse(__ENV.TEST_ADMINS)   : null;

  return {
    students: rawStudents || [{ email: saEmail, password: saPassword, tenantId: null }],
    teachers: rawTeachers || [{ email: saEmail, password: saPassword, tenantId: null }],
    admins:   rawAdmins   || [{ email: saEmail, password: saPassword, tenantId: null }],
  };
}

// ---------------------------------------------------------------------------
// VU function — used both standalone and by run.js
// ---------------------------------------------------------------------------
export function loginNavigationScenario(data) {
  if (_loginFailed) { sleep(5); return; }

  if (!_token) {
    const role = (__VU % 10) < 7 ? 'students'
               : (__VU % 10) < 9 ? 'teachers'
               : 'admins';

    const pool = data[role] || data.students;
    _user = pool[(__VU - 1) % pool.length];
    _tenantId = _user.tenantId || null;
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      _loginFailed = true;
      sleep(5);
      return;
    }
  }

  const role = _user.role || 'STUDENT';

  // GET /api/users/profile
  const profile = get('/api/users/profile', _token, _tenantId);
  okJson(profile, 'profile');
  sleep(thinkTime(0.5, 1.5));

  // GET /api/users/checkAuth
  const auth = get('/api/users/checkAuth', _token, _tenantId);
  okJson(auth, 'checkAuth');
  sleep(thinkTime(0.5, 1));

  if (role === 'TEACHER' || role === 'ADMIN' || role === 'SUPERADMIN') {
    const dashboard = get('/api/teachers/dashboard', _token, _tenantId);
    okJson(dashboard, 'teacherDashboard');
    sleep(thinkTime(1, 2));

    const assignments = get('/api/teachers/assignments', _token, _tenantId);
    okJson(assignments, 'teacherAssignments');
  } else if (role === 'ADMIN' || role === 'SUPERADMIN') {
    const metrics = get('/api/admin/dashboard/metrics', _token, _tenantId);
    okJson(metrics, 'adminMetrics');
    sleep(thinkTime(1, 2));

    const users = get('/api/admin/users?limit=20', _token, _tenantId);
    okJson(users, 'adminUsers');
  } else {
    // Student
    const courses = get('/api/courses', _token, _tenantId);
    okList(courses, 'courses', 'courses');
    sleep(thinkTime(1, 2));

    const assignments = get('/api/students/assignments', _token, _tenantId);
    okJson(assignments, 'studentAssignments');
  }

  sleep(thinkTime(1, 3));
}

export default loginNavigationScenario;
