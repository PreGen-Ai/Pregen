/**
 * Scenario 4 — Admin Tenant Flow
 *
 * Exercises the admin dashboard and reporting paths that aggregate across many
 * users and AI events.  These are classic "break first under load" endpoints
 * because they hit MongoDB aggregation pipelines on every request.
 *
 * Run standalone:
 *   k6 run -e BASE_URL=http://localhost:5000 \
 *          -e SA_EMAIL=sa@pregen.io \
 *          -e SA_PASSWORD=secret \
 *          -e STAGE=A \
 *          scenarios/04_admin_tenant.js
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getStages } from '../config/stages.js';
import { getThresholds } from '../config/thresholds.js';
import { login, get } from '../lib/auth.js';
import { okJson, notError } from '../lib/checks.js';
import { thinkTime, pick } from '../lib/rng.js';

const dashboardLatency = new Trend('admin_dashboard_duration', true);
const loginErrors      = new Counter('admin_login_errors');

const STAGE = __ENV.STAGE || 'A';
export const options = {
  stages: getStages(STAGE),
  thresholds: {
    ...getThresholds(STAGE),
    // Admin dashboards should stay under 2s even at peak — they read cached summaries
    admin_dashboard_duration: ['p(95)<2000', 'p(99)<4000'],
  },
};

let _token = null;
let _user = null;
let _tenantId = null;
let _isSuperAdmin = false;

const RANGES = ['24h', '7d', '30d'];

export function setup() {
  const saEmail = __ENV.SA_EMAIL;
  const saPassword = __ENV.SA_PASSWORD;
  if (!saEmail || !saPassword) throw new Error('SA_EMAIL and SA_PASSWORD required');
  const admins = __ENV.TEST_ADMINS ? JSON.parse(__ENV.TEST_ADMINS) : null;
  return {
    admins: admins || [{ email: saEmail, password: saPassword, tenantId: null, role: 'SUPERADMIN' }],
  };
}

export function adminTenantScenario(data) {
  if (!_token) {
    _user = data.admins[(__VU - 1) % data.admins.length];
    _tenantId = _user.tenantId || null;
    _isSuperAdmin = _user.role === 'SUPERADMIN';
    _token = login(_user.email, _user.password, _tenantId);
    if (!_token) {
      loginErrors.add(1);
      return;
    }
  }

  const range = pick(RANGES);

  // --- Dashboard metrics ---
  const start = Date.now();
  const metrics = get(`/api/admin/dashboard/metrics?range=${range}`, _token, _tenantId);
  dashboardLatency.add(Date.now() - start);
  okJson(metrics, 'adminMetrics');
  sleep(thinkTime(1, 2));

  // --- Users list (paginated) ---
  const users = get('/api/admin/users?limit=20&page=1', _token, _tenantId);
  okJson(users, 'adminUsers');
  sleep(thinkTime(0.5, 1.5));

  // --- Analytics summary ---
  const analytics = get(`/api/admin/analytics/summary?range=${range}`, _token, _tenantId);
  okJson(analytics, 'adminAnalytics');
  sleep(thinkTime(0.5, 1));

  // --- AI usage summary ---
  const aiSummary = get('/api/ai-usage/summary', _token, _tenantId);
  okJson(aiSummary, 'aiUsageSummary');
  sleep(thinkTime(0.5, 1));

  // --- AI settings (read-only) ---
  const aiSettings = get('/api/admin/ai/settings', _token, _tenantId);
  okJson(aiSettings, 'aiSettings');
  sleep(thinkTime(0.5, 1));

  // --- Superadmin-only paths ---
  if (_isSuperAdmin) {
    // System overview
    const sysOverview = get('/api/admin/system/super/overview', _token, null);
    notError(sysOverview, 'superOverview');
    sleep(thinkTime(0.5, 1));

    // AI cost aggregation — most expensive aggregation in the system
    const aiCost = get(`/api/admin/system/super/ai-cost?range=${range}&limit=50`, _token, null);
    notError(aiCost, 'superAiCost');
    sleep(thinkTime(0.5, 1));

    // Tenants list
    const tenants = get('/api/admin/system/super/tenants?limit=20', _token, null);
    notError(tenants, 'superTenants');
    sleep(thinkTime(0.5, 1));

    // Recent system logs
    const logs = get('/api/admin/system/logs/recent', _token, null);
    notError(logs, 'systemLogs');
  }

  sleep(thinkTime(2, 4));
}

export default adminTenantScenario;
