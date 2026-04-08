// cypress/support/e2e.js
// Global support file — runs before every spec

import "./commands";

// Suppress uncaught exceptions that come from React dev mode / external scripts
Cypress.on("uncaught:exception", (err) => {
  // Ignore ResizeObserver and chunk errors from CRA
  if (
    err.message.includes("ResizeObserver loop") ||
    err.message.includes("Loading chunk") ||
    err.message.includes("ChunkLoadError")
  ) {
    return false;
  }
  return true; // fail on all other unexpected errors
});

// Print current user before each test (if logged in)
beforeEach(() => {
  const user = Cypress.env("currentUser");
  if (user) {
    Cypress.log({ name: "user", message: `${user.role}: ${user.email}` });
  }
});
