import http from 'k6/http';
import { check } from 'k6';

const BASE = () => __ENV.BASE_URL || 'http://localhost:5000';

export function login(email, password, tenantId) {
  const headers = { 'Content-Type': 'application/json' };
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const res = http.post(
    `${BASE()}/api/users/login`,
    JSON.stringify({ email, password }),
    { headers, tags: { name: 'POST /api/users/login' } },
  );

  const ok = check(res, {
    'login 200': (r) => r.status === 200,
    'login has token': (r) => !!r.json('token'),
  });

  return ok ? res.json('token') : null;
}

export function headers(token, tenantId) {
  const h = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (tenantId) h['x-tenant-id'] = tenantId;
  return h;
}

export function get(path, token, tenantId, tags = {}) {
  return http.get(`${BASE()}${path}`, {
    headers: headers(token, tenantId),
    tags: { name: `GET ${path.replace(/\/[a-f0-9]{24}/g, '/:id')}`, ...tags },
  });
}

export function post(path, body, token, tenantId, tags = {}) {
  return http.post(`${BASE()}${path}`, JSON.stringify(body), {
    headers: headers(token, tenantId),
    tags: { name: `POST ${path.replace(/\/[a-f0-9]{24}/g, '/:id')}`, ...tags },
  });
}

export function patch(path, body, token, tenantId, tags = {}) {
  return http.patch(`${BASE()}${path}`, JSON.stringify(body), {
    headers: headers(token, tenantId),
    tags: { name: `PATCH ${path.replace(/\/[a-f0-9]{24}/g, '/:id')}`, ...tags },
  });
}

// Login used inside setup() — returns {token, email, password}
export function setupLogin(email, password, tenantId) {
  const token = login(email, password, tenantId);
  if (!token) throw new Error(`setup login failed for ${email}`);
  return token;
}

// Superadmin helper (no tenant scope)
export function adminPost(path, body, token) {
  return http.post(`${BASE()}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { name: `POST ${path}` },
  });
}

export function adminGet(path, token) {
  return http.get(`${BASE()}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { name: `GET ${path}` },
  });
}

export function adminPatch(path, body, token) {
  return http.patch(`${BASE()}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { name: `PATCH ${path}` },
  });
}
