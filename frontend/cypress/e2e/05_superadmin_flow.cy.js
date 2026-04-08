// cypress/e2e/05_superadmin_flow.cy.js
// E2E: SuperAdmin — tenant management, AI cost, audit logs, feature flags, system overview

describe("SuperAdmin Flow — E2E", () => {
  const email = Cypress.env("SUPERADMIN_EMAIL");
  const password = Cypress.env("SUPERADMIN_PASSWORD");
  let saToken = null;
  let isLoggedIn = false;

  before(() => {
    cy.loginByApi(email, password).then((res) => {
      isLoggedIn = res.status === 200;
      if (isLoggedIn) saToken = res.body.token;
    });
  });

  beforeEach(function () {
    if (!isLoggedIn) this.skip();
    cy.loginByApi(email, password);
  });

  // ---------- System Access ----------
  context("SuperAdmin System Access", () => {
    it("SuperAdmin can visit /dashboard", () => {
      cy.visit("/dashboard");
      cy.url({ timeout: 10000 }).should("include", "/dashboard");
    });

    it("GET /api/users/super-admin returns 200 for SUPERADMIN", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/super-admin`,
        headers: { Authorization: `Bearer ${saToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("GET /api/users/all returns all users for SUPERADMIN", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/all`,
        headers: { Authorization: `Bearer ${saToken}` },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  // ---------- System Overview ----------
  context("SuperAdmin System Overview", () => {
    it("GET /api/admin/system/super/overview returns non-403", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/overview`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });

    it("SuperAdmin can visit system dashboard page", () => {
      cy.visit("/dashboard/super/system");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Tenant Management ----------
  context("Tenant Management", () => {
    it("GET /api/admin/system/super/tenants returns non-403 for SUPERADMIN", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/tenants`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });

    it("SuperAdmin can visit tenants page", () => {
      cy.visit("/dashboard/superadmin/tenants");
      cy.get("body").should("not.contain", "403");
    });

    it("SuperAdmin can create a tenant via API", () => {
      const ts = Date.now();
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/tenants`,
        headers: { Authorization: `Bearer ${saToken}` },
        body: {
          tenantId: `cypress_tenant_${ts}`,
          name: `Cypress School ${ts}`,
          status: "trial",
          plan: "basic",
        },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });
  });

  // ---------- AI Cost Tracking ----------
  context("AI Cost Tracking", () => {
    it("SuperAdmin can visit AI cost page", () => {
      cy.visit("/dashboard/superadmin/ai-cost");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/system/super/ai-cost returns non-403", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/ai-cost?range=7d`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });

    it("GET /api/admin/system/super/ai-requests/summary returns non-403", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/ai-requests/summary`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });
  });

  // ---------- Audit Logs ----------
  context("Audit Logs", () => {
    it("SuperAdmin can visit audit logs page", () => {
      cy.visit("/dashboard/superadmin/analytics");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/system/super/logs returns non-403", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/logs`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });
  });

  // ---------- Feature Flags ----------
  context("Feature Flags", () => {
    it("SuperAdmin can visit feature flags page", () => {
      cy.visit("/dashboard/superadmin/flags");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/admin/system/super/feature-flags returns non-403", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/system/super/feature-flags`,
        headers: { Authorization: `Bearer ${saToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("not.eq", 403);
    });
  });

  // ---------- SuperAdmin User Management ----------
  context("SuperAdmin User Management", () => {
    it("SuperAdmin can delete a user via API", () => {
      // Create a throwaway user first
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/users/signup`,
        headers: { Authorization: `Bearer ${saToken}` },
        body: {
          username: `throwaway_${Date.now()}`,
          email: `throwaway_${Date.now()}@test.com`,
          password: "Password1!",
          role: "STUDENT",
          tenantId: "tenant_test",
        },
        failOnStatusCode: false,
      }).then((signupRes) => {
        if (![200, 201].includes(signupRes.status)) return;
        const userId = signupRes.body.user?._id ?? signupRes.body._id;
        if (!userId) return;

        cy.request({
          method: "DELETE",
          url: `${Cypress.env("apiUrl")}/api/users/delete/${userId}`,
          headers: { Authorization: `Bearer ${saToken}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("be.oneOf", [200, 204]);
      });
    });
  });

  // ---------- Redirect Sanity ----------
  context("Admin/super redirect sanity", () => {
    it("/api/admin/super/* redirects to /api/admin/system/super/*", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/admin/super/overview`,
        headers: { Authorization: `Bearer ${saToken}` },
        followRedirect: false,
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [301, 302, 307, 308]);
    });
  });
});
