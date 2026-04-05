import mongoose from "mongoose";
import {
  MONGO_URI,
  MONGO_DB_NAME,
  MONGO_CONNECT_TIMEOUT_MS,
  MONGO_SERVER_SELECTION_TIMEOUT_MS,
  MONGO_SOCKET_TIMEOUT_MS,
  MONGO_RETRY_ATTEMPTS,
  MONGO_RETRY_DELAY_MS,
  MONGO_USE_LOCAL_FALLBACK,
  getMongoConfigSummary,
} from "./env.js";

mongoose.set("strictQuery", true);

let isConnected = false;
let listenersBound = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindConnectionListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on("connected", () => {
    console.log("[mongo] connected");
  });

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    console.warn("[mongo] disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("[mongo] reconnected");
  });

  mongoose.connection.on("error", (error) => {
    console.error("[mongo] connection error:", error?.message || error);
  });
}

function getMongoFailureHints(error) {
  const message = String(error?.message || error || "");
  const hints = [];

  if (/querySrv/i.test(message)) {
    hints.push(
      "SRV DNS resolution failed. Verify the URI scheme and make sure the selected env file is the one you expect.",
    );
    hints.push(
      "If Atlas SRV lookup fails locally but the resolved shard hosts are reachable, temporarily use a direct-host replica-set URI in MONGO_URL for local verification.",
    );
  }

  if (/ETIMEDOUT|ECONNREFUSED|Could not connect to any servers/i.test(message)) {
    hints.push(
      MONGO_USE_LOCAL_FALLBACK
        ? "Local Mongo fallback is enabled, but the local Mongo server is not reachable on the configured host/port."
        : "Mongo is not reachable from this machine. For Atlas, verify current IP allowlisting, VPN/firewall rules, and outbound TCP access to port 27017.",
    );
  }

  if (/Authentication failed|bad auth/i.test(message)) {
    hints.push(
      "Mongo authentication failed. Verify the username, password, and authSource in the configured URI.",
    );
  }

  if (/TLS|SSL/i.test(message)) {
    hints.push(
      "Mongo TLS negotiation failed. Check whether the selected URI and cluster require TLS and whether the local network is intercepting secure traffic.",
    );
  }

  if (!hints.length) {
    hints.push(
      "Review the selected Mongo URI, database name, and network reachability for the configured target.",
    );
  }

  return hints;
}

export async function connectMongo() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  bindConnectionListeners();

  const summary = getMongoConfigSummary();
  const attempts = Math.max(1, MONGO_RETRY_ATTEMPTS);
  let lastError = null;

  console.log(
    `[mongo] startup env=${summary.envFile} source=${summary.source} mode=${summary.mode} scheme=${summary.scheme} db=${summary.dbName}`,
  );
  console.log(
    `[mongo] targets=${summary.targets.join(", ") || "(none)"} timeouts=${summary.timeouts.connectMs}/${summary.timeouts.serverSelectionMs}/${summary.timeouts.socketMs}ms`,
  );

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`[mongo] connect attempt ${attempt}/${attempts}`);

      await mongoose.connect(MONGO_URI, {
        dbName: MONGO_DB_NAME,
        autoIndex: false,
        connectTimeoutMS: MONGO_CONNECT_TIMEOUT_MS,
        serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
        socketTimeoutMS: MONGO_SOCKET_TIMEOUT_MS,
      });

      isConnected = true;
      console.log(`[mongo] database=${mongoose.connection.name}`);
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      const hints = getMongoFailureHints(error);

      console.error(
        `[mongo] connection failed (${attempt}/${attempts}): ${error?.message || error}`,
      );
      for (const hint of hints) {
        console.error(`[mongo] hint: ${hint}`);
      }

      if (attempt < attempts) {
        console.log(`[mongo] retrying in ${MONGO_RETRY_DELAY_MS}ms`);
        await sleep(MONGO_RETRY_DELAY_MS);
      }
    }
  }

  const startupError = new Error(
    `MongoDB connection failed after ${attempts} attempt(s): ${lastError?.message || "Unknown error"}`,
  );
  startupError.cause = lastError;
  startupError.mongoConfig = summary;
  startupError.mongoHints = getMongoFailureHints(lastError);
  throw startupError;
}

export async function disconnectMongo() {
  if (!isConnected && mongoose.connection.readyState !== 1) return;

  await mongoose.disconnect();
  isConnected = false;
  console.log("[mongo] disconnected cleanly");
}

process.on("SIGINT", async () => {
  await disconnectMongo();
  process.exit(0);
});
