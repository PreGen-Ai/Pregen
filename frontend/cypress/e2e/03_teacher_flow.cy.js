// cypress/e2e/03_teacher_flow.cy.js
// E2E: Teacher journey — assignments, quizzes, gradebook, content

describe("Teacher Flow — E2E", () => {
  const email = Cypress.env("TEACHER_EMAIL");
  const password = Cypress.env("TEACHER_PASSWORD");
  let teacherToken = null;
  let isLoggedIn = false;

  before(() => {
    cy.loginByApi(email, password).then((res) => {
      isLoggedIn = res.status === 200;
      if (isLoggedIn) teacherToken = res.body.token;
    });
  });

  beforeEach(function () {
    if (!isLoggedIn) this.skip();
    cy.loginByApi(email, password);
  });

  // ---------- Dashboard ----------
  context("Teacher Dashboard", () => {
    it("Teacher can access /dashboard without redirect to login", () => {
      cy.visit("/dashboard");
      cy.url({ timeout: 10000 }).should("include", "/dashboard");
      cy.get("body").should("not.contain", "Unauthorized");
    });

    it("Teacher dashboard shows teacher-specific nav items", () => {
      cy.visit("/dashboard");
      cy.get("nav, [class*='sidebar']", { timeout: 10000 }).then(($nav) => {
        expect($nav.text()).to.match(/assignment|quiz|grade|content/i);
      });
    });
  });

  // ---------- Assignments Management ----------
  context("Teacher Assignments", () => {
    it("Teacher can visit assignments management page", () => {
      cy.visit("/dashboard/teacher/assignments");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/teachers/assignments returns 200 for teacher", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/teachers/assignments`,
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
        .its("status")
        .should("eq", 200);
    });

    it("Teacher can create an assignment via API", () => {
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/teachers/assignments`,
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: {
          title: `E2E Assignment ${Date.now()}`,
          description: "Created by Cypress E2E test",
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          type: "text_submission",
          tenantId: "tenant_test",
        },
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [200, 201]);
    });
  });

  // ---------- Quiz Management ----------
  context("Teacher Quizzes", () => {
    it("Teacher can visit quiz management page", () => {
      cy.visit("/dashboard/teacher/quizzes");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/teachers/quizzes returns 200 for teacher", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/teachers/quizzes`,
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  // ---------- Gradebook ----------
  context("Teacher Gradebook", () => {
    it("Teacher can view gradebook page", () => {
      cy.visit("/dashboard/grades");
      cy.get("body").should("not.contain", "403");
    });

    it("GET /api/gradebook returns 200 for teacher", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/gradebook`,
        headers: { Authorization: `Bearer ${teacherToken}` },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  // ---------- Content Management ----------
  context("Teacher Content (Lessons)", () => {
    it("Teacher can visit content/lessons page", () => {
      cy.visit("/dashboard/teacher/content");
      cy.get("body").should("not.contain", "403");
    });
  });

  // ---------- Announcements ----------
  context("Teacher Announcements", () => {
    it("Teacher can create announcement via API", () => {
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/announcements`,
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: {
          title: `E2E Announcement ${Date.now()}`,
          content: "This is a test announcement from Cypress E2E",
          tenantId: "tenant_test",
        },
        failOnStatusCode: false,
      })
        .its("status")
        .should("be.oneOf", [200, 201]);
    });
  });

  // ---------- RBAC Enforcement ----------
  context("RBAC — Teacher blocked from student-only routes", () => {
    it("Teacher cannot access /api/students/assignments (API gate)", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/students/assignments`,
        headers: { Authorization: `Bearer ${teacherToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });

    it("Teacher cannot access /api/users/super-admin (API gate)", () => {
      cy.request({
        method: "GET",
        url: `${Cypress.env("apiUrl")}/api/users/super-admin`,
        headers: { Authorization: `Bearer ${teacherToken}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });
  });
});
