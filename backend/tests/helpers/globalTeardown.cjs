// tests/helpers/globalTeardown.cjs
module.exports = async function globalTeardown() {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
    console.log("\n[globalTeardown] MongoDB in-memory server stopped.");
  }
};
