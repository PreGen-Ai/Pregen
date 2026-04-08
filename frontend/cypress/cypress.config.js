const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx}",
    supportFile: "cypress/support/e2e.js",
    video: false,
    screenshotOnRunFailure: true,
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    env: {
      apiUrl: "http://localhost:5000",
      // Seeded test credentials — set these in cypress.env.json (gitignored)
      STUDENT_EMAIL: "student@pregen.test",
      STUDENT_PASSWORD: "Password1!",
      TEACHER_EMAIL: "teacher@pregen.test",
      TEACHER_PASSWORD: "Password1!",
      ADMIN_EMAIL: "admin@pregen.test",
      ADMIN_PASSWORD: "Password1!",
      SUPERADMIN_EMAIL: "superadmin@pregen.test",
      SUPERADMIN_PASSWORD: "Password1!",
    },
  },
});
