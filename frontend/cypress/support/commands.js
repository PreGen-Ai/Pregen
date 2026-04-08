// cypress/support/commands.js
// Custom Cypress commands for PreGen LMS tests

/**
 * cy.login(email, password)
 * Logs in via the UI form and waits for the dashboard to load.
 */
Cypress.Commands.add("login", (email, password) => {
  cy.session(
    [email, password],
    () => {
      cy.visit("/");
      // Handle redirect to /login or landing page with login link
      cy.get('input[type="email"], input[name="email"], input[placeholder*="email" i]', {
        timeout: 10000,
      }).type(email);
      cy.get('input[type="password"], input[name="password"]').type(password);
      cy.get('button[type="submit"], button:contains("Login"), button:contains("Sign in")').click();
      // Wait for dashboard to load
      cy.url({ timeout: 15000 }).should("include", "/dashboard");
    },
    {
      validate: () => {
        // Validate session is still active
        cy.getCookies().then((cookies) => {
          const hasSession = cookies.some(
            (c) => c.name === "pregen.sid" || c.name === "token"
          );
          // If no cookie, check localStorage for JWT
          if (!hasSession) {
            cy.window().then((win) => {
              const token = win.localStorage.getItem("token");
              expect(token).to.exist;
            });
          }
        });
      },
    }
  );
});

/**
 * cy.loginByApi(email, password)
 * Logs in via direct API call (faster, for tests that don't need to test the login UI itself)
 */
Cypress.Commands.add("loginByApi", (email, password) => {
  cy.request({
    method: "POST",
    url: `${Cypress.env("apiUrl")}/api/users/login`,
    body: { email, password },
    failOnStatusCode: false,
  }).then((response) => {
    if (response.status === 200) {
      const token = response.body.token;
      if (token) {
        window.localStorage.setItem("token", token);
        cy.setCookie("token", token);
      }
      Cypress.env("currentUser", response.body.user);
    }
    return response;
  });
});

/**
 * cy.logout()
 * Logs out via API and clears session.
 */
Cypress.Commands.add("logout", () => {
  cy.clearCookies();
  cy.clearLocalStorage();
  Cypress.env("currentUser", null);
});

/**
 * cy.apiRequest(method, path, body)
 * Makes an authenticated API request using stored token.
 */
Cypress.Commands.add("apiRequest", (method, path, body = {}) => {
  const token = Cypress.env("currentUser")?.token;
  cy.request({
    method,
    url: `${Cypress.env("apiUrl")}${path}`,
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    failOnStatusCode: false,
  });
});

/**
 * cy.navigateToDashboard()
 * Navigates to /dashboard and waits for sidebar to load.
 */
Cypress.Commands.add("navigateToDashboard", () => {
  cy.visit("/dashboard");
  cy.get('[class*="sidebar"], [class*="nav"], nav', { timeout: 10000 }).should("exist");
});

/**
 * cy.waitForPageLoad()
 * Waits for no loading spinners to be visible.
 */
Cypress.Commands.add("waitForPageLoad", () => {
  cy.get('[class*="loading"], [class*="spinner"]', { timeout: 10000 }).should("not.exist");
});

/**
 * cy.getByTestId(testId)
 * Selects element by data-testid attribute.
 */
Cypress.Commands.add("getByTestId", (testId) => {
  return cy.get(`[data-testid="${testId}"]`);
});

/**
 * cy.checkApiHealth()
 * Verifies the backend API is reachable.
 */
Cypress.Commands.add("checkApiHealth", () => {
  cy.request(`${Cypress.env("apiUrl")}/api/health`).its("status").should("eq", 200);
});
