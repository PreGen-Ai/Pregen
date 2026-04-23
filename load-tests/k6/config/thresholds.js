// SLOs per load stage — tighten as infra matures

export const THRESHOLDS_BASELINE = {
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
  http_req_failed: ['rate<0.01'],
};

export const THRESHOLDS_MODERATE = {
  http_req_duration: ['p(95)<1200', 'p(99)<3000'],
  http_req_failed: ['rate<0.02'],
};

export const THRESHOLDS_PEAK = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.05'],
};

export const THRESHOLDS_STORM = {
  // Submission queue adds latency; we tolerate higher p95 here
  http_req_duration: ['p(95)<4000', 'p(99)<10000'],
  http_req_failed: ['rate<0.10'],
};

// AI endpoints are slower — separate thresholds prevent them from
// masking CRUD regressions in aggregate numbers
export const THRESHOLDS_AI = {
  http_req_duration: ['p(95)<12000', 'p(99)<25000'],
  http_req_failed: ['rate<0.05'],
};

export const THRESHOLDS_SOAK = {
  http_req_duration: ['p(95)<1500'],
  http_req_failed: ['rate<0.02'],
  // Watch for p95 drift over time — memory leaks show up here
};

export function getThresholds(stage) {
  const map = {
    A: THRESHOLDS_BASELINE,    a: THRESHOLDS_BASELINE,
    B: THRESHOLDS_MODERATE,    b: THRESHOLDS_MODERATE,
    C: THRESHOLDS_PEAK,        c: THRESHOLDS_PEAK,
    D: THRESHOLDS_PEAK,        d: THRESHOLDS_PEAK,
    E: THRESHOLDS_SOAK,        e: THRESHOLDS_SOAK,
    storm: THRESHOLDS_STORM,   STORM: THRESHOLDS_STORM,
  };
  return map[stage] || THRESHOLDS_BASELINE;
}
