import {
  APP_NAME,
  ENV_FILE_FOUND,
  MONGO_URI,
  redactMongoUri,
  getMongoConfigSummary,
  getRuntimeConfigSummary,
} from "../src/config/env.js";

function print(label, value) {
  console.log(`[doctor] ${label}: ${value}`);
}

const mongoSummary = getMongoConfigSummary();
const runtimeSummary = getRuntimeConfigSummary();

print("app", APP_NAME);
print("envFile", ENV_FILE_FOUND ? runtimeSummary.envFile : `${runtimeSummary.envFile} (missing)`);
print("nodeEnv", runtimeSummary.nodeEnv);
print("port", runtimeSummary.port);
print("clientOrigin", runtimeSummary.clientOrigin || "(not set)");
print(
  "corsOrigins",
  runtimeSummary.corsOrigins.length
    ? runtimeSummary.corsOrigins.join(", ")
    : "(none configured)",
);
print("sessionSecret", runtimeSummary.sessionSecretSource);
print("aiService", `${runtimeSummary.aiServiceUrl} [${runtimeSummary.aiServiceSource}]`);
print("redis", runtimeSummary.redisEnabled ? "enabled" : "disabled");
print(
  "mongo",
  `source=${mongoSummary.source} mode=${mongoSummary.mode} scheme=${mongoSummary.scheme} db=${mongoSummary.dbName}`,
);
print(
  "mongoTargets",
  mongoSummary.targets.length ? mongoSummary.targets.join(", ") : "(none configured)",
);
print("mongoUri", redactMongoUri(MONGO_URI));
print(
  "mongoTimeouts",
  `connect=${mongoSummary.timeouts.connectMs}ms serverSelection=${mongoSummary.timeouts.serverSelectionMs}ms socket=${mongoSummary.timeouts.socketMs}ms retryAttempts=${mongoSummary.retryAttempts}`,
);

if (runtimeSummary.warnings.length) {
  for (const warning of runtimeSummary.warnings) {
    console.warn(`[doctor] warning: ${warning}`);
  }
} else {
  print("warnings", "none");
}
