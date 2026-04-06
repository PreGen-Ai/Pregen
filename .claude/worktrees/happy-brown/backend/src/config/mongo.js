// backend/src/mongo.js
import mongoose from "mongoose";
import { MONGO_URI, MONGO_DB_NAME } from "./env.js";

mongoose.set("strictQuery", true);

let isConnected = false;

export async function connectMongo() {
  if (isConnected) return mongoose.connection;

  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME,
      autoIndex: false, // safer in prod
    });

    isConnected = true;

    console.log(" MongoDB connected");
    console.log(` Database: ${mongoose.connection.name}`);

    return mongoose.connection;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

export async function disconnectMongo() {
  if (!isConnected) return;

  await mongoose.disconnect();
  isConnected = false;
  console.log("! MongoDB disconnected");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await disconnectMongo();
  process.exit(0);
});
