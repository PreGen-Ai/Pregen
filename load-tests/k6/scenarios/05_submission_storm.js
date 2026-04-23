/**
 * Scenario 5 — Submission Storm
 *
 * Simulates the highest-risk real-world event for a school LMS:
 * an entire class submitting within a 2–5 minute window (exam end, homework deadline).
 *
 * All VUs are students; they ramp to peak concurrency quickly and all hit
 * POST /api/students/assignments/submit at near-simultaneous wall-clock time.
 *
 * This scenario deliberately pushes the AI-triggering submission path to find:
 *   - DB write contention on the Submission collection
 *   - AI queue saturation or back-pressure failures
 *   - Rate-limit circuit-breaker behavior
 *   - File-upload path pressure (separate run with INCLUDE_FILES=true)
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=storm \
 *          -e STUB_AI=true \
 *          scenarios/05_submission_storm.js
 */

import { sleep, check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { login, get, post } from '../lib/auth.js';
import { notError, okCreated } from '../lib/checks.js';
import { thinkTime, submissionText, randInt } from '../lib/rng.js';

// Tight latency budget — the acceptance message must come back fast even
// when the AI grading work is queued async.
export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m',  target: 500 },
    { duration: '3m',  target: 1000 },
    { duration: '2m',  target: 200 },
    { duration: '1m',  target: 0 },
  ],
  thresholds: {
    // Submission accepted must be fast — AI grading is async
    http_req_duration:      ['p(95)<4000', 'p(99)<10000'],
    http_req_failed:        ['rate<0.10'],
    submission_storm_rt:    ['p(95)<4000'],
    submission_storm_errors: ['rate<0.10'],
  },
};

const stormRT     = new Trend('submission_storm_rt', true);
const stormErrors = new Rate('submission_storm_errors');
const loginErrors = new Counter('storm_login_errors');

let _loginFailed = false;

let _token = null;
let _user = null;
let _tenantId = null;
let _assignmentId = null;

export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) throw new Error('SA_EMAIL and SA_PASSWORD required');
  const students    = __ENV.TEST_STUDENTS    ? JSON.parse(__ENV.TEST_STUDENTS)    : null;
  const assignments = __ENV.TEST_ASSIGNMENTS ? JSON.parse(__ENV.TEST_ASSIGNMENTS) : null;
  return {
    students:    students    || [{ email: saEmail, password: saPassword, tenantId: null }],
    assignments: assignments || [],
  };
}

export function submissionStormScenario(data) {
  if (_loginFailed) { sleep(5); return; }

  if (!_token) {
    _user = data.students[(__VU - 1) % data.students.length];
    _tenantId = _user.tenantId || null;
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      _loginFailed = true;
      sleep(5);
      return;
    }

    if (data.assignments.length) {
      // Each VU picks a different assignment to spread DB write contention
      const asgn = data.assignments[(__VU - 1) % data.assignments.length];
      _assignmentId = asgn._id || asgn.id;
    }
  }

  // Resolve assignment ID dynamically if not seeded
  let assignmentId = _assignmentId;
  if (!assignmentId) {
    const asgnList = get('/api/students/assignments', _token, _tenantId);
    try {
      const items = asgnList.json('assignments') || asgnList.json('items');
      if (Array.isArray(items) && items.length) {
        assignmentId = items[randInt(0, items.length - 1)].assignmentId || items[0]._id;
      }
    } catch { /* fall through */ }
  }

  if (!assignmentId) {
    // No assignment to submit — just measure login path
    sleep(thinkTime(1, 2));
    return;
  }

  // Minimal think-time: this is the storm window
  sleep(thinkTime(0.2, 1));

  const start = Date.now();
  const res = post(
    '/api/students/assignments/submit',
    {
      assignmentId,
      content: submissionText(),
      submissionType: 'text',
    },
    _token,
    _tenantId,
  );
  const elapsed = Date.now() - start;
  stormRT.add(elapsed);

  const failed = !notError(res, 'stormSubmit');
  stormErrors.add(failed ? 1 : 0);

  if (!failed) {
    // 202 Accepted or 200 OK — either is correct depending on whether
    // the backend queues async or processes inline
    check(res, {
      'submit accepted or ok': (r) => r.status === 200 || r.status === 201 || r.status === 202,
    });
  }

  sleep(thinkTime(0.5, 1.5));
}

export default submissionStormScenario;
