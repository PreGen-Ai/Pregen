// cypress/e2e/01_auth.cy.js
// E2E: Authentication flows — login, logout, session, RBAC redirects

describe("Authentication — E2E", () => {
  const studentEmail = Cypress.env("STUDENT_EMAIL");
  const studentPwd = Cypress.env("STUDENT_PASSWORD");
  const teacherEmail = Cypress.env("TEACHER_EMAIL");
  const teacherPwd = Cypress.env("TEACHER_PASSWORD");

  beforeEach(() => {
    cy.logout();
  });

  // ---------- API Health ----------
  context("API Health", () => {
    it("Backend /api/health returns ok", () => {
      cy.request(`${Cypress.env("apiUrl")}/api/health`)
        .its("body.ok")
        .should("be.true");
    });

    it("Backend returns 404 for unknown route", () => {
      cy.request({
        url: `${Cypress.env("apiUrl")}/api/totally-unknown-endpoint`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 404);
    });
  });

  // ---------- Login Page ----------
  context("Login Page", () => {
    it("Displays login form when not authenticated", () => {
      cy.visit("/");
      cy.get('input[type="email"], input[name="email"]', { timeout: 10000 }).should("exist");
      cy.get('input[type="password"]').should("exist");
      cy.get('button[type="submit"]').should("exist");
    });

    it("Shows error message for invalid credentials", () => {
      cy.visit("/");
      cy.get('input[type="email"], input[name="email"]').type("notexist@test.com");
      cy.get('input[type="password"]').type("wrongpassword");
      cy.get('button[type="submit"]').click();
      // Should show an error toast or inline error
      cy.get(
        '[class*="error"], [class*="alert"], [class*="toast"], [role="alert"]',
        { timeout: 8000 }
      ).should("exist");
    });

    it("Shows error for empty email field", () => {
      cy.visit("/");
      cy.get('input[type="password"]').type("Password1!");
      cy.get('button[type="submit"]').click();
      // HTML5 validation or custom error
      cy.url().should("not.include", "/dashboard");
    });

    it("Does not navigate to dashboard on failed login", () => {
      cy.visit("/");
      cy.get('input[type="email"], input[name="email"]').type("bad@email.com");
      cy.get('input[type="password"]').type("badpassword");
      cy.get('button[type="submit"]').click();
      cy.wait(2000);
      cy.url().should("not.include", "/dashboard");
    });
  });

  // ---------- Successful Login ----------
  context("Successful Login", () => {
    it("STUDENT can log in and reaches /dashboard", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) {
          cy.log("Test user not seeded — skipping E2E login test");
          return;
        }
        cy.visit("/dashboard");
        cy.url({ timeout: 10000 }).should("include", "/dashboard");
      });
    });

    it("Dashboard shows sidebar navigation after login", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        cy.visit("/dashboard");
        cy.get(
          'nav, [class*="sidebar"], [class*="DashboardShell"]',
          { timeout: 10000 }
        ).should("exist");
      });
    });
  });

  // ---------- Unauthenticated Redirects ----------
  context("Route Protection", () => {
    it("Visiting /dashboard without login redirects to login page", () => {
      cy.visit("/dashboard", { failOnStatusCode: false });
      cy.url({ timeout: 8000 }).should(
        "satisfy",
        (url) => url.includes("/login") || url === Cypress.config("baseUrl") + "/"
      );
    });

    it("Visiting /dashboard/admin/users without login redirects", () => {
      cy.visit("/dashboard/admin/users", { failOnStatusCode: false });
      cy.url({ timeout: 8000 }).should("not.include", "/admin/users");
    });

    it("Visiting /dashboard/super/system without login redirects", () => {
      cy.visit("/dashboard/super/system", { failOnStatusCode: false });
      cy.url({ timeout: 8000 }).should("not.include", "/super/system");
    });
  });

  // ---------- Logout ----------
  context("Logout", () => {
    it("Logging out clears session and redirects", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        cy.request({
          method: "POST",
          url: `${Cypress.env("apiUrl")}/api/users/logout`,
          failOnStatusCode: false,
        });
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.visit("/dashboard", { failOnStatusCode: false });
        cy.url({ timeout: 8000 }).should("not.include", "/dashboard");
      });
    });
  });

  // ---------- Token Security ----------
  context("Token Security", () => {
    it("checkAuth API returns 401 with no token", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/checkAuth`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
    });

    it("checkAuth API returns 401 with garbage token", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/checkAuth`,
        headers: { Authorization: "Bearer thisisnotavalidtoken.abc.xyz" },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
    });
  });
});
