module.exports = {
  testDir: "./playwright",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node playwright/static-server.cjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30000,
  },
};
