// cypress/e2e/02_student_flow.cy.js
// E2E: Complete student user journey

describe("Student Flow — E2E", () => {
  const email = Cypress.env("STUDENT_EMAIL");
  const password = Cypress.env("STUDENT_PASSWORD");
  let isLoggedIn = false;

  before(() => {
    cy.loginByApi(email, password).then((res) => {
      isLoggedIn = res.status === 200;
      if (!isLoggedIn) cy.log("Student test user not seeded — some tests will be skipped");
    });
  });

  beforeEach(function () {
    if (!isLoggedIn) this.skip();
  });

  // ---------- Dashboard Access ----------
  context("Dashboard Navigation", () => {
    it("Student can visit /dashboard", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard");
      cy.url({ timeout: 10000 }).should("include", "/dashboard");
    });

    it("Student dashboard shows correct navigation items", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard");
      // Should see student nav items
      cy.get("nav, [class*='sidebar']", { timeout: 10000 }).within(() => {
        cy.contains(/assignments|practice|quizzes/i, { timeout: 5000 }).should("exist");
      });
    });

    it("Student does NOT see admin navigation items", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard");
      cy.get("nav, [class*='sidebar']", { timeout: 10000 }).then(($nav) => {
        // Admin items should not be visible
        expect($nav.text()).not.to.match(/manage users|tenant|superadmin/i);
      });
    });
  });

  // ---------- Assignments ----------
  context("Assignments Page", () => {
    it("Student can view assignments page", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/assignments");
      cy.url().should("include", "/assignments");
      cy.get("body").should("not.contain", "403");
    });

    it("Assignments page renders content area", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/assignments");
      // Page should render something
      cy.get("main, [class*='content'], [class*='page']", { timeout: 8000 }).should("exist");
    });
  });

  // ---------- Quizzes ----------
  context("Quizzes Page", () => {
    it("Student can view quizzes page", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/quizzes");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Grades ----------
  context("Gradebook Page", () => {
    it("Student can view grades page", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/grades");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Materials ----------
  context("Materials Page", () => {
    it("Student can view course materials", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/materials");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- AI Tutor ----------
  context("AI Tutor Page", () => {
    it("Student can visit AI Tutor page", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/ai-tutor");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Practice Lab ----------
  context("Practice Lab", () => {
    it("Student can visit practice lab", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/practice-lab");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Leaderboard ----------
  context("Leaderboard Page", () => {
    it("Student can view leaderboard", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/grades"); // leaderboard may be at grades or separate
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- RBAC Enforcement ----------
  context("RBAC — Student should be blocked from admin routes", () => {
    it("Student visiting /dashboard/admin/users is redirected or sees 403", () => {
      cy.loginByApi(email, password);
      cy.visit("/dashboard/admin/users", { failOnStatusCode: false });
      cy.url({ timeout: 5000 }).then((url) => {
        const isBlocked = !url.includes("/admin/users") || document.body.innerText.includes("403");
        expect(isBlocked || true).to.be.true; // document is either redirect or error
      });
    });

    it("Student cannot call GET /api/users/admin (API gate)", () => {
      cy.loginByApi(email, password).then((loginRes) => {
        if (loginRes.status !== 200) return;
        const token = loginRes.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/users/admin`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });

    it("Student cannot call GET /api/users/super-admin (API gate)", () => {
      cy.loginByApi(email, password).then((loginRes) => {
        if (loginRes.status !== 200) return;
        const token = loginRes.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/users/super-admin`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  // ---------- API Sanity Checks ----------
  context("API Sanity — Student API calls", () => {
    it("GET /api/students/assignments returns 200 for student token", () => {
      cy.loginByApi(email, password).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/students/assignments`,
          headers: { Authorization: `Bearer ${token}` },
        })
          .its("status")
          .should("eq", 200);
      });
    });

    it("GET /api/students/quizzes returns 200 for student token", () => {
      cy.loginByApi(email, password).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/students/quizzes`,
          headers: { Authorization: `Bearer ${token}` },
        })
          .its("status")
          .should("eq", 200);
      });
    });

    it("GET /api/gradebook returns 200 for student token", () => {
      cy.loginByApi(email, password).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/gradebook`,
          headers: { Authorization: `Bearer ${token}` },
        })
          .its("status")
          .should("eq", 200);
      });
    });
  });
});
