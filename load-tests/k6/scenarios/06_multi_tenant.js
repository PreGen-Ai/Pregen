/**
 * Scenario 6 — Multi-Tenant Noisy-Neighbor Test
 *
 * Verifies that one large tenant cannot degrade response times for others.
 *
 * Traffic distribution (matches __ENV.TENANT_COUNT tenants):
 *   Tenant 0 (heavy)  — 30 % of VUs
 *   Tenant 1 (heavy)  — 30 % of VUs
 *   Tenants 2–N (light) — 40 % split evenly
 *
 * Each VU hits the same flow as Scenario 2 (student learning path) so results
 * are directly comparable.  The test fails if p95 for light tenants exceeds
 * the threshold, indicating noisy-neighbor leakage.
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=B \
 *          -e TENANT_COUNT=20 \
 *          scenarios/06_multi_tenant.js
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getStages } from '../config/stages.js';
import { getThresholds } from '../config/thresholds.js';
import { login, get, post } from '../lib/auth.js';
import { okJson, notError } from '../lib/checks.js';
import { thinkTime, submissionText, randInt } from '../lib/rng.js';

const heavyRT = new Trend('mt_heavy_tenant_rt', true);
const lightRT = new Trend('mt_light_tenant_rt', true);
const crossTenantErrors = new Counter('mt_cross_tenant_errors');
const loginErrors = new Counter('mt_login_errors');

const STAGE = __ENV.STAGE || 'B';
export const options = {
  stages: getStages(STAGE),
  thresholds: {
    ...getThresholds(STAGE),
    mt_heavy_tenant_rt: ['p(95)<2000'],
    mt_light_tenant_rt: ['p(95)<2000'], // light tenants must not be starved
    mt_cross_tenant_errors: ['count<1'],  // any cross-tenant data leak = hard fail
  },
};

let _token = null;
let _user = null;
let _tenantId = null;
let _isHeavy = false;

export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) throw new Error('SA_EMAIL and SA_PASSWORD required');
  const tenants = __ENV.TEST_TENANTS ? JSON.parse(__ENV.TEST_TENANTS) : null;
  if (!tenants || tenants.length < 2) {
    // Degenerate fallback: single tenant, still useful for API baseline
    return {
      tenants: [{
        id: null,
        students: [{ email: saEmail, password: saPassword, tenantId: null }],
        assignments: [],
      }],
    };
  }
  return { tenants };
}

export function multiTenantScenario(data) {
  const { tenants } = data;
  const tenantCount = tenants.length;

  if (!_token) {
    // Assign VU to tenant based on noisy-neighbor distribution
    const vuPercent = (__VU % 100);
    let tenantIdx;
    if (tenantCount >= 2) {
      tenantIdx = vuPercent < 30 ? 0
                : vuPercent < 60 ? 1
                : 2 + ((__VU) % Math.max(1, tenantCount - 2));
    } else {
      tenantIdx = 0;
    }
    tenantIdx = Math.min(tenantIdx, tenantCount - 1);

    const tenant = tenants[tenantIdx];
    _tenantId = tenant.id || null;
    _isHeavy = tenantIdx < 2;

    const students = tenant.students || [];
    _user = students[(__VU - 1) % Math.max(1, students.length)];
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      return;
    }
  }

  const start = Date.now();

  // --- Standard student flow ---
  const courses = get('/api/courses', _token, _tenantId);
  okJson(courses, 'mt_courses');
  sleep(thinkTime(0.5, 1.5));

  const asgnList = get('/api/students/assignments', _token, _tenantId);
  okJson(asgnList, 'mt_assignments');

  // Cross-tenant leak check: the returned data must not contain a different tenantId
  try {
    const body = asgnList.json();
    const items = body.assignments || body.items || [];
    for (const item of items) {
      if (_tenantId && item.tenantId && item.tenantId !== _tenantId) {
        crossTenantErrors.add(1);
      }
    }
  } catch { /* ok */ }

  sleep(thinkTime(1, 3));

  // Submit every other iteration to avoid duplicate submission conflicts
  if (__ITER % 2 === 0) {
    const tenant = data.tenants.find((t) => t.id === _tenantId) || data.tenants[0];
    const assignments = tenant.assignments || [];
    if (assignments.length) {
      const asgn = assignments[__ITER % assignments.length];
      const submitRes = post(
        '/api/students/assignments/submit',
        {
          assignmentId: asgn._id || asgn.id,
          content: submissionText(),
          submissionType: 'text',
        },
        _token,
        _tenantId,
      );
      notError(submitRes, 'mt_submit');
    }
  }

  const elapsed = Date.now() - start;
  if (_isHeavy) heavyRT.add(elapsed);
  else          lightRT.add(elapsed);

  sleep(thinkTime(2, 4));
}

export default multiTenantScenario;
