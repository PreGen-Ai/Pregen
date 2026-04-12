// tests/helpers/globalSetup.cjs
// Runs once before all test suites in the main Jest process.
// Starts an in-memory MongoDB server and stores the URI in process.env
// so every test worker inherits it.
const { MongoMemoryServer } = require("mongodb-memory-server");
const path = require("path");
const fs = require("fs");

module.exports = async function globalSetup() {
  // Start in-memory MongoDB
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Expose to child processes via env (Jest workers inherit this env)
  process.env.MONGO_URI = uri;
  process.env.MONGO_URL = uri;
  process.env.MONGODB_URI = uri;
  process.env.MONGO_DB_NAME = "pregen_test";
  process.env.JWT_SECRET = "test_jwt_secret_pregen_lms_2024";
  process.env.SESSION_SECRET = "test_session_secret_pregen_lms_2024";
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:3000";
  process.env.AI_SERVICE_URL = "http://localhost:8000";
  process.env.AI_SERVICE_SHARED_SECRET = "test-ai-service-secret";
  process.env.PORT = "5001";

  // Persist the mongod instance ID for teardown
  const tempDir = path.join(__dirname, ".tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "mongod.json"),
    JSON.stringify({ uri, port: mongod.instanceInfo?.port })
  );

  // Store on global so globalTeardown can access it
  global.__MONGOD__ = mongod;

  console.log("\n[globalSetup] MongoDB in-memory server started:", uri);
};
