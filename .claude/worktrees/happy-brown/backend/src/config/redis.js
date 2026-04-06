// backend/src/redis.js
import { createClient } from "redis";
import { REDIS_URL, IS_PROD } from "./env.js";

let redisClient = null;

export async function connectRedis() {
  if (!REDIS_URL) {
    console.warn(" Redis disabled (REDIS_URL not set)");
    return null;
  }

  if (redisClient) return redisClient;

  redisClient = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
    },
  });

  redisClient.on("error", (err) => {
    console.error(" Redis error:", err.message);
  });

  redisClient.on("connect", () => {
    console.log(" Redis connected");
  });

  redisClient.on("reconnecting", () => {
    console.log(" Redis reconnecting...");
  });

  await redisClient.connect();
  return redisClient;
}

export function getRedis() {
  return redisClient;
}

export async function disconnectRedis() {
  if (!redisClient) return;

  await redisClient.quit();
  redisClient = null;
  console.log("! Redis disconnected");
}
