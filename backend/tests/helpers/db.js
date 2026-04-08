// tests/helpers/db.js
// Connects/disconnects mongoose in-process for each test file.
import mongoose from "mongoose";

let connected = false;

export async function connectTestDB() {
  if (connected) return;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set — globalSetup may not have run");
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME || "pregen_test" });
  connected = true;
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
  connected = false;
}

export async function clearCollection(...modelNames) {
  for (const name of modelNames) {
    const Model = mongoose.models[name];
    if (Model) await Model.deleteMany({});
  }
}

export async function clearAllCollections() {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    if (col.name !== "system.indexes") {
      await db.collection(col.name).deleteMany({});
    }
  }
}
