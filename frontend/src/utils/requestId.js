function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export function createRequestId(prefix = "req") {
  const safePrefix = String(prefix || "req")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }

  return `${safePrefix}-${Date.now()}-${randomSuffix()}`;
}

export function withRequestId(config = {}, prefix = "req") {
  const requestId = createRequestId(prefix);

  return {
    requestId,
    config: {
      ...config,
      headers: {
        ...(config.headers || {}),
        "x-request-id": requestId,
      },
    },
  };
}
