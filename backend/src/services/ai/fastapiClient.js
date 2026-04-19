import {
  AI_SERVICE_SHARED_SECRET,
  AI_SERVICE_URL,
} from "../../config/env.js";

export class AiUpstreamError extends Error {
  constructor({
    message,
    status = 502,
    upstreamStatus = null,
    data = null,
    headers = {},
    cause = null,
  }) {
    super(message || "AI service request failed");
    this.name = "AiUpstreamError";
    this.status = status;
    this.upstreamStatus = upstreamStatus;
    this.data = data;
    this.headers = headers;
    this.cause = cause;
  }
}

function normalizePath(path) {
  const value = String(path || "").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

export function buildAiServiceUrl(path, query) {
  const url = new URL(normalizePath(path), AI_SERVICE_URL);

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/** Returns true if a string is an HTML document (e.g. Render/nginx 502 pages) */
function looksLikeHtml(s) {
  const t = String(s || "").trimStart();
  return t.startsWith("<!") || /^<html[\s>]/i.test(t);
}

function extractMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") {
    // Don't surface raw HTML error pages (e.g. Render.com 502 gateway page)
    return looksLikeHtml(data) ? fallback : data;
  }
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  if (Array.isArray(data?.detail) && data.detail.length) {
    return data.detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join("; ");
  }
  return fallback;
}

async function parseResponseBody(response, responseType) {
  if (responseType === "binary") {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!raw) return null;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  return raw;
}

// How long to wait before retrying a cold-start 502 (Render waking the service).
const COLD_START_RETRY_DELAY_MS = 35000;
// Only retry 502s from the upstream (not 4xx or other errors).
const COLD_START_MAX_RETRIES = 1;

async function _doFetch({ url, method, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });

    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AiUpstreamError({
        message: "AI service timed out",
        status: 504,
        cause: error,
      });
    }
    throw new AiUpstreamError({
      message: "Unable to reach AI service",
      status: 502,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function callAiService({
  path,
  method = "GET",
  body,
  query,
  headers = {},
  responseType = "json",
  timeoutMs = 45000,
}) {
  let preparedBody = body;
  const preparedHeaders = {
    ...(AI_SERVICE_SHARED_SECRET
      ? { "x-internal-api-key": AI_SERVICE_SHARED_SECRET }
      : {}),
    ...headers,
  };

  if (
    preparedBody &&
    !(preparedBody instanceof FormData) &&
    !Buffer.isBuffer(preparedBody) &&
    typeof preparedBody === "object"
  ) {
    preparedHeaders["Content-Type"] =
      preparedHeaders["Content-Type"] || "application/json";
    preparedBody = JSON.stringify(preparedBody);
  }

  const url = buildAiServiceUrl(path, query);

  for (let attempt = 0; attempt <= COLD_START_MAX_RETRIES; attempt++) {
    try {
      const response = await _doFetch({
        url,
        method,
        headers: preparedHeaders,
        body: preparedBody,
        timeoutMs,
      });

      const responseHeaders = Object.fromEntries(response.headers.entries());
      const data = await parseResponseBody(response, responseType);

      if (!response.ok) {
        const isColdStart502 =
          response.status === 502 && attempt < COLD_START_MAX_RETRIES;

        if (isColdStart502) {
          // Render's proxy returns 502 while the service wakes from sleep.
          // Wait for the service to finish starting, then retry once.
          console.warn(
            `[ai-client] upstream 502 on attempt ${attempt + 1} — service may be starting up, retrying in ${COLD_START_RETRY_DELAY_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, COLD_START_RETRY_DELAY_MS));
          continue;
        }

        throw new AiUpstreamError({
          message: extractMessage(
            data,
            `AI service request failed with status ${response.status}`,
          ),
          // User auth is enforced in the Node app. A 401/403 from the internal
          // AI bridge is almost always a deployment/config problem, so surface
          // it as an upstream failure instead of pretending the LMS user is
          // unauthenticated.
          status:
            response.status >= 500 || response.status === 401 || response.status === 403
              ? 502
              : response.status,
          upstreamStatus: response.status,
          data,
          headers: responseHeaders,
        });
      }

      return {
        status: response.status,
        headers: responseHeaders,
        data,
      };
    } catch (error) {
      if (error instanceof AiUpstreamError) {
        throw error;
      }
      throw new AiUpstreamError({
        message: "Unable to reach AI service",
        status: 502,
        cause: error,
      });
    }
  }

  // Exhausted retries (should not be reached in practice)
  throw new AiUpstreamError({
    message: "AI service unavailable after retries",
    status: 502,
  });
}
