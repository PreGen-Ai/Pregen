// Stage A — baseline: 100 VUs, verify p95 < 800ms on all CRUD endpoints
export const STAGE_A = [
  { duration: '1m', target: 30 },
  { duration: '5m', target: 100 },
  { duration: '3m', target: 0 },
];

// Stage B — moderate production: 500 VUs, error rate < 1%
export const STAGE_B = [
  { duration: '2m', target: 100 },
  { duration: '5m', target: 300 },
  { duration: '5m', target: 500 },
  { duration: '5m', target: 500 },
  { duration: '3m', target: 0 },
];

// Stage C — heavy school peak: 1500 VUs, AI mocked, submission-heavy
export const STAGE_C = [
  { duration: '3m', target: 300 },
  { duration: '5m', target: 800 },
  { duration: '10m', target: 1500 },
  { duration: '5m', target: 1500 },
  { duration: '5m', target: 0 },
];

// Stage D — extreme spike: 3000 VUs for 10 minutes, degrade gracefully
export const STAGE_D = [
  { duration: '3m', target: 500 },
  { duration: '5m', target: 1500 },
  { duration: '10m', target: 3000 },
  { duration: '5m', target: 0 },
];

// Stage E — soak: 200–400 VUs for 4+ hours, detect memory leaks / pool exhaustion
export const STAGE_E = [
  { duration: '5m', target: 200 },
  { duration: '4h', target: 300 },
  { duration: '30m', target: 400 },
  { duration: '10m', target: 0 },
];

// Submission storm — 1000 VUs submit within a 3-minute window
export const STAGE_STORM = [
  { duration: '30s', target: 100 },
  { duration: '2m', target: 500 },
  { duration: '3m', target: 1000 },
  { duration: '2m', target: 200 },
  { duration: '1m', target: 0 },
];

export function getStages(name) {
  const map = {
    A: STAGE_A, a: STAGE_A,
    B: STAGE_B, b: STAGE_B,
    C: STAGE_C, c: STAGE_C,
    D: STAGE_D, d: STAGE_D,
    E: STAGE_E, e: STAGE_E,
    storm: STAGE_STORM, STORM: STAGE_STORM,
  };
  return map[name] || STAGE_A;
}
