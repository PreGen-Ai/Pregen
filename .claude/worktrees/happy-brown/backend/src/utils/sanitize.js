/**
 * Keep logs safe: no prompts, no raw PII.
 * Store only safe metadata.
 */
export function safeMeta(meta) {
  if (!meta || typeof meta !== "object") return undefined;

  const clone = {};
  const allow = [
    "assignmentId",
    "userId",
    "feature",
    "status",
    "latencyMs",
    "requestId",
  ];
  for (const k of allow) {
    if (k in meta) clone[k] = meta[k];
  }
  return clone;
}
