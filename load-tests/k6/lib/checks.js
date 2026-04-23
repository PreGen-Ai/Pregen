import { check } from 'k6';

export function ok(res, label) {
  return check(res, {
    [`${label} 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}

export function okJson(res, label) {
  return check(res, {
    [`${label} 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} json`]: (r) => (r.headers['Content-Type'] || '').includes('application/json'),
  });
}

export function okList(res, field, label) {
  return check(res, {
    [`${label} 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} has ${field}`]: (r) => {
      try {
        const v = r.json(field);
        return Array.isArray(v);
      } catch {
        return false;
      }
    },
  });
}

export function okCreated(res, label) {
  return check(res, {
    [`${label} created`]: (r) => r.status === 200 || r.status === 201,
  });
}

export function notError(res, label) {
  return check(res, {
    [`${label} no 5xx`]: (r) => r.status < 500,
  });
}
