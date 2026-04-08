// cypress/e2e/04_admin_flow.cy.js
// E2E: Admin panel — users, classes, subjects, branding, AI controls

describe("Admin Flow — E2E", () => {
  const email = Cypress.env("ADMIN_EMAIL");
  const password = Cypress.env("ADMIN_PASSWORD");
  let adminToken = null;
  let isLoggedIn = false;

  before(() => {
    cy.loginByApi(email, password).then((res) => {
      isLoggedIn = res.status === 200;
      if (isLoggedIn) adminToken = res.body.token;
    });
  });

  beforeEach(function () {
    if (!isLoggedIn) this.skip();
    cy.loginByApi(email, password);
  });

  // ---------- Admin Dashboard ----------
  context("Admin Dashboard", () => {
    it("Admin can access /dashboard", () => {
      cy.visit("/dashboard");
      cy.url({ timeout: 10000 }).should("include", "/dashboard");
    });

    it("GET /api/admin/dashboard returns 200 for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/dashboard`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("Admin dashboard navigation shows admin items", () => {
      cy.visit("/dashboard");
      cy.get("nav, [class*='sidebar']", { timeout: 10000 }).then(($nav) => {
        expect($nav.text()).to.match(/users|classes|subjects|branding/i);
      });
    });
  });

  // ---------- User Management ----------
  context("Admin User Management", () => {
    it("Admin can visit user management page", () => {
      cy.visit("/dashboard/admin/users");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/users returns list for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/users`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("Admin can create a new user via API", () => {
      const ts = Date.now();
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/admin/users/create`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          username: `cypress_student_${ts}`,
          email: `cypress_student_${ts}@test.com`,
          password: "Password1!",
          role: "STUDENT",
          tenantId: "tenant_test",
        },
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [200, 201]);
    });
  });

  // ---------- Classes ----------
  context("Admin Classes", () => {
    it("Admin can visit classes page", () => {
      cy.visit("/dashboard/admin/workspace");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/classes returns 200 for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/classes`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("Admin can create a class via API", () => {
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/admin/classes`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { name: `Cypress Class ${Date.now()}`, tenantId: "tenant_test" },
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [200, 201]);
    });
  });

  // ---------- Subjects ----------
  context("Admin Subjects", () => {
    it("Admin can visit subjects page", () => {
      cy.visit("/dashboard/admin/subjects");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/subjects returns 200 for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/subjects`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  // ---------- Branding ----------
  context("Admin Branding", () => {
    it("Admin can visit branding page", () => {
      cy.visit("/dashboard/admin/branding");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/branding returns 200 for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/branding`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  // ---------- AI Controls ----------
  context("Admin AI Controls", () => {
    it("Admin can visit AI controls page", () => {
      cy.visit("/dashboard/admin/ai-controls");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/ai/settings returns 200 for admin", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/ai/settings`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("Admin can update AI settings via API", () => {
      cy.request({
        method: "PUT",
        url: `${Cypress.env("apiUrl")}/api/admin/ai/settings`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          enabled: true,
          feedbackTone: "encouraging",
          features: { aiGrading: true, aiQuizGen: true, aiTutor: true, aiSummaries: true },
        },
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [200, 204]);
    });
  });

  // ---------- RBAC — Admin Blocked from SuperAdmin Routes ----------
  context("RBAC — Admin blocked from superadmin routes", () => {
    it("Admin cannot call /api/users/super-admin (API gate)", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/super-admin`,
        headers: { Authorization: `Bearer ${adminToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });

    it("Admin cannot call /api/admin/system/super/overview (API gate)", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/overview`,
        headers: { Authorization: `Bearer ${adminToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });

    it("Admin cannot access /api/users/all (super-admin only)", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/all`,
        headers: { Authorization: `Bearer ${adminToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });
  });
});
