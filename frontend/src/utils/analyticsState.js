export function hasMetricValue(metric) {
  return metric?.value !== null && metric?.value !== undefined;
}

export function formatMetricValue(metric, formatter, fallbackLabel = "No data available") {
  if (hasMetricValue(metric)) {
    return formatter(metric.value);
  }
  return metric?.label || fallbackLabel;
}

export function metricDescription(metric, fallback = "") {
  if (!metric) return fallback;
  return metric.label || fallback;
}

export function metricState(metric, fallback = "no_data") {
  return metric?.state || fallback;
}

export function collectionItems(collectionState) {
  return Array.isArray(collectionState?.items) ? collectionState.items : [];
}

export function chartHasData(chart) {
  return chart?.state === "ok" && Array.isArray(chart?.points) && chart.points.length > 0;
}

export function formatChartPoints(chart) {
  if (!Array.isArray(chart?.points)) return [];
  return chart.points.map((point, index) => ({
    ...point,
    id: point.bucket || point.label || String(index),
  }));
}

export function sourceBadgeClass(stateValue) {
  const state = String(stateValue || "").toLowerCase();
  if (state === "ok" || state === "healthy") return "bg-success-subtle text-success";
  if (state === "partial" || state === "partial_telemetry" || state === "zero" || state === "warn" || state === "warning") {
    return "bg-warning-subtle text-warning-emphasis";
  }
  if (state === "degraded" || state === "error" || state === "unavailable" || state === "security") {
    return "bg-danger-subtle text-danger";
  }
  if (state === "misconfigured" || state === "logging_inactive" || state === "no_data") {
    return "bg-secondary-subtle text-secondary-emphasis";
  }
  return "bg-light text-dark";
}
