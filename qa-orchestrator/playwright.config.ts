import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

// When no external URL is provided we spin up Python's built-in HTTP server
// (always available on ubuntu-latest and macOS/Windows dev machines).
// The sample smoke test only needs a responding HTTP 200, so this is enough.
const webServer =
  process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "python3 -m http.server 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 15_000,
      };

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  fullyParallel: true,
  ...(webServer ? { webServer } : {}),
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/playwright/results.json" }],
    ["junit", { outputFile: "reports/playwright/junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
