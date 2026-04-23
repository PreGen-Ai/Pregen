/**
 * Scenario 3 — Teacher Workflow
 *
 * Teacher opens assigned course → reviews submission → adds draft feedback →
 * optionally approves grade.  Covers the full submission review pipeline
 * including the gradebook write path.
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=A \
 *          scenarios/03_teacher_workflow.js
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getStages } from '../config/stages.js';
import { getThresholds } from '../config/thresholds.js';
import { login, get, post, patch } from '../lib/auth.js';
import { okJson, okList, notError } from '../lib/checks.js';
import { thinkTime, randInt } from '../lib/rng.js';

const reviewLatency = new Trend('teacher_review_duration', true);
const loginErrors   = new Counter('teacher_login_errors');

let _loginFailed = false;

const STAGE = __ENV.STAGE || 'A';
export const options = {
  stages: getStages(STAGE),
  thresholds: {
    ...getThresholds(STAGE),
    teacher_review_duration: ['p(95)<3000'],
  },
};

let _token = null;
let _user = null;
let _tenantId = null;
let _assignmentId = null;

export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) throw new Error('SA_EMAIL and SA_PASSWORD required');
  const teachers     = __ENV.TEST_TEACHERS    ? JSON.parse(__ENV.TEST_TEACHERS)    : null;
  const assignments  = __ENV.TEST_ASSIGNMENTS ? JSON.parse(__ENV.TEST_ASSIGNMENTS) : null;
  return {
    teachers:    teachers    || [{ email: saEmail, password: saPassword, tenantId: null }],
    assignments: assignments || [],
  };
}

export function teacherWorkflowScenario(data) {
  if (_loginFailed) { sleep(5); return; }

  if (!_token) {
    _user = data.teachers[(__VU - 1) % data.teachers.length];
    _tenantId = _user.tenantId || null;
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      _loginFailed = true;
      sleep(5);
      return;
    }
    if (data.assignments.length) {
      _assignmentId = data.assignments[(__VU - 1) % data.assignments.length]._id;
    }
  }

  // --- Teacher dashboard ---
  const dashboard = get('/api/teachers/dashboard', _token, _tenantId);
  okJson(dashboard, 'teacherDashboard');
  sleep(thinkTime(1, 2));

  // --- List assignments ---
  const asgnList = get('/api/teachers/assignments', _token, _tenantId);
  okJson(asgnList, 'teacherAssignments');
  sleep(thinkTime(0.5, 1));

  // Resolve assignment ID
  let assignmentId = _assignmentId;
  if (!assignmentId) {
    try {
      const items = asgnList.json('assignments') || asgnList.json('items');
      if (Array.isArray(items) && items.length) assignmentId = items[0]._id || items[0].id;
    } catch { /* no data */ }
  }

  if (!assignmentId) {
    sleep(thinkTime(2, 3));
    return;
  }

  // --- Fetch submissions for this assignment ---
  const submissions = get(`/api/teachers/assignments/${assignmentId}/submissions`, _token, _tenantId);
  okJson(submissions, 'submissions');
  sleep(thinkTime(1, 3)); // reading submissions takes time

  let submissionId = null;
  try {
    const items = submissions.json('submissions') || submissions.json('items');
    if (Array.isArray(items) && items.length) {
      // Pick a pending submission (not yet teacher_reviewed)
      const pending = items.filter((s) => s.status === 'ai_graded' || s.status === 'submitted');
      submissionId = (pending.length ? pending[0] : items[0])._id || (pending.length ? pending[0] : items[0]).id;
    }
  } catch { /* no submissions yet */ }

  if (!submissionId) {
    sleep(thinkTime(2, 3));
    return;
  }

  // --- Draft review (teacher_reviewed, not yet released to student) ---
  const start = Date.now();
  const reviewRes = patch(
    `/api/teachers/assignments/submissions/${submissionId}/review`,
    {
      score: randInt(60, 100),
      feedback: 'Good work! Consider expanding your explanation with more examples.',
      rubricEvaluation: { clarity: 4, depth: 3, accuracy: 4 },
    },
    _token,
    _tenantId,
  );
  reviewLatency.add(Date.now() - start);
  notError(reviewRes, 'review');
  sleep(thinkTime(1, 2));

  // --- Approve 50% of the time (release grade to student) ---
  if (Math.random() < 0.5) {
    const approveRes = post(
      `/api/teachers/assignments/submissions/${submissionId}/approve`,
      { finalScore: randInt(60, 100) },
      _token,
      _tenantId,
    );
    notError(approveRes, 'approve');
    sleep(thinkTime(0.5, 1));
  }

  // --- Quizzes tab (read-only) ---
  const quizzes = get('/api/teachers/quizzes', _token, _tenantId);
  okJson(quizzes, 'teacherQuizzes');

  sleep(thinkTime(2, 4));
}

export default teacherWorkflowScenario;
