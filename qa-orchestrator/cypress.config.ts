import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.E2E_BASE_URL || "http://127.0.0.1:3000", // Optional local dev fallback.
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: false,
    screenshotsFolder: "cypress/screenshots",
    videosFolder: "cypress/videos",
  },
  reporter: "junit",
  reporterOptions: {
    mochaFile: "cypress/results/junit-[hash].xml",
    toConsole: true,
  },
  video: true,
});
