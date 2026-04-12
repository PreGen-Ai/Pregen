/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  transform: {},
  moduleFileExtensions: ["js", "json"],
  globalSetup: "./tests/helpers/globalSetup.cjs",
  globalTeardown: "./tests/helpers/globalTeardown.cjs",
  setupFilesAfterEnv: ["./tests/helpers/setup.js"],
  testTimeout: 30000,
  forceExit: true,
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/seeds/**",
    "!src/cron/**",
    "!src/config/env.js",
    "!src/server.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};
