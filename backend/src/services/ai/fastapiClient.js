import { AI_SERVICE_URL } from "../../config/env.js";

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

export async function callAiService({
  path,
  method = "GET",
  body,
  query,
  headers = {},
  responseType = "json",
  timeoutMs = 45000,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let preparedBody = body;
  const preparedHeaders = { ...headers };

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

  try {
    const response = await fetch(buildAiServiceUrl(path, query), {
      method,
      headers: preparedHeaders,
      body: preparedBody,
      signal: controller.signal,
      redirect: "follow",
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());
    const data = await parseResponseBody(response, responseType);

    if (!response.ok) {
      throw new AiUpstreamError({
        message: extractMessage(
          data,
          `AI service request failed with status ${response.status}`,
        ),
        status: response.status >= 500 ? 502 : response.status,
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
