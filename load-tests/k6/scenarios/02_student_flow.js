/**
 * Scenario 2 — Student Learning Flow
 *
 * Exercises the core student value path end-to-end:
 *   login → list courses → open course → list assignments → submit → check results
 *
 * Submissions use submissionType=text (no file uploads) so the test focuses on
 * the API and queue layer, not multipart bandwidth.
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=B \
 *          scenarios/02_student_flow.js
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getStages } from '../config/stages.js';
import { getThresholds } from '../config/thresholds.js';
import { login, get, post } from '../lib/auth.js';
import { okJson, okList, okCreated, notError } from '../lib/checks.js';
import { thinkTime, submissionText } from '../lib/rng.js';

const submitLatency   = new Trend('student_submit_duration', true);
const submitErrors    = new Counter('student_submit_errors');
const loginErrors     = new Counter('student_login_errors');

const STAGE = __ENV.STAGE || 'B';
export const options = {
  stages: getStages(STAGE),
  thresholds: {
    ...getThresholds(STAGE),
    student_submit_duration: ['p(95)<5000'],
  },
};

let _token = null;
let _user = null;
let _tenantId = null;
let _courseId = null;
let _assignmentId = null;

export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) throw new Error('SA_EMAIL and SA_PASSWORD required');
  const students     = __ENV.TEST_STUDENTS    ? JSON.parse(__ENV.TEST_STUDENTS)    : null;
  const courses      = __ENV.TEST_COURSES     ? JSON.parse(__ENV.TEST_COURSES)     : null;
  const assignments  = __ENV.TEST_ASSIGNMENTS ? JSON.parse(__ENV.TEST_ASSIGNMENTS) : null;
  return {
    students:    students    || [{ email: saEmail, password: saPassword, tenantId: null }],
    courses:     courses     || [],
    assignments: assignments || [],
  };
}

export function studentFlowScenario(data) {
  if (!_token) {
    _user = data.students[(__VU - 1) % data.students.length];
    _tenantId = _user.tenantId || null;
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      return;
    }
    // Pick a stable course and assignment for this VU's lifetime
    if (data.courses.length) {
      const course = data.courses[(__VU - 1) % data.courses.length];
      _courseId = course._id || course.id || null;
    }
    if (data.assignments.length) {
      const asgn = data.assignments[(__VU - 1) % data.assignments.length];
      _assignmentId = asgn._id || asgn.id || null;
    }
  }

  // --- List courses ---
  const courses = get('/api/courses', _token, _tenantId);
  okList(courses, 'courses', 'courses');
  sleep(thinkTime(1, 2));

  // --- Open a specific course if available ---
  let resolvedCourseId = _courseId;
  if (!resolvedCourseId) {
    try {
      const list = courses.json('courses');
      if (Array.isArray(list) && list.length) resolvedCourseId = list[0]._id || list[0].id;
    } catch { /* no course data available */ }
  }

  if (resolvedCourseId) {
    const course = get(`/api/courses/${resolvedCourseId}`, _token, _tenantId);
    okJson(course, 'courseDetail');
    sleep(thinkTime(1, 2));
  }

  // --- List assignments ---
  const asgnList = get('/api/students/assignments', _token, _tenantId);
  okJson(asgnList, 'studentAssignments');
  sleep(thinkTime(2, 5)); // simulate reading the assignment

  // --- Submit ---
  let resolvedAssignmentId = _assignmentId;
  if (!resolvedAssignmentId) {
    try {
      const items = asgnList.json('assignments') || asgnList.json('items');
      if (Array.isArray(items) && items.length) {
        resolvedAssignmentId = items[0].assignmentId || items[0]._id || items[0].id;
      }
    } catch { /* no data */ }
  }

  if (resolvedAssignmentId) {
    const start = Date.now();
    const submitRes = post(
      '/api/students/assignments/submit',
      {
        assignmentId: resolvedAssignmentId,
        content: submissionText(),
        submissionType: 'text',
      },
      _token,
      _tenantId,
    );
    submitLatency.add(Date.now() - start);

    if (!notError(submitRes, 'submit')) {
      submitErrors.add(1);
    } else {
      okCreated(submitRes, 'submit');
    }
    sleep(thinkTime(1, 2));
  }

  // --- Check results ---
  const results = get('/api/students/results', _token, _tenantId);
  okJson(results, 'studentResults');

  sleep(thinkTime(2, 4));
}

export default studentFlowScenario;
