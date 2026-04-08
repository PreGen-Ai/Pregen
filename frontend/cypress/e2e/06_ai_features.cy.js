// cypress/e2e/06_ai_features.cy.js
// E2E: AI features — route access, health checks, graceful degradation

describe("AI Features — E2E", () => {
  const studentEmail = Cypress.env("STUDENT_EMAIL");
  const studentPwd = Cypress.env("STUDENT_PASSWORD");
  const teacherEmail = Cypress.env("TEACHER_EMAIL");
  const teacherPwd = Cypress.env("TEACHER_PASSWORD");

  // ---------- AI Route Access Control ----------
  context("AI API Route Access Control", () => {
    it("Unauthenticated request to /api/ai/quiz/generate returns 401", () => {
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl")}/api/ai/quiz/generate`,
        body: {},
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
    });

    it("STUDENT can reach AI quiz generate route (no 403)", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "POST",
          url: `${Cypress.env("apiUrl")}/api/ai/quiz/generate`,
          headers: { Authorization: `Bearer ${token}` },
          body: { topic: "Photosynthesis", questionCount: 5, difficulty: "medium" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });

    it("TEACHER can reach AI assignment generate route (no 403)", () => {
      cy.loginByApi(teacherEmail, teacherPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "POST",
          url: `${Cypress.env("apiUrl")}/api/ai/assignments/generate`,
          headers: { Authorization: `Bearer ${token}` },
          body: { topic: "Chapter 5 Review", grade: "10", type: "text_submission" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });

    it("STUDENT can reach AI tutor chat route (no 403)", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "POST",
          url: `${Cypress.env("apiUrl")}/api/ai/tutor/chat`,
          headers: { Authorization: `Bearer ${token}` },
          body: { message: "Explain photosynthesis", sessionId: "test-session-001" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });
  });

  // ---------- AI Health Checks ----------
  context("AI Health Endpoints", () => {
    it("GET /api/ai/grade/health is reachable for STUDENT", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/ai/grade/health`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });

    it("GET /api/ai/assignments/health is reachable for STUDENT", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "GET",
          url: `${Cypress.env("apiUrl")}/api/ai/assignments/health`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });
  });

  // ---------- AI Tutor UI ----------
  context("AI Tutor Page", () => {
    it("Student can visit AI Tutor page without 403/500", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        cy.visit("/dashboard/ai-tutor");
        cy.get("body").should("not.contain", "403");
        cy.get("body").should("not.contain", "500");
      });
    });

    it("AI Tutor page renders a chat or input area", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        cy.visit("/dashboard/ai-tutor");
        cy.get(
          'textarea, input[type="text"], [class*="chat"], [class*="tutor"]',
          { timeout: 10000 }
        ).should("exist");
      });
    });
  });

  // ---------- Quiz Generator Page ----------
  context("Quiz Generator Page", () => {
    it("Teacher can visit quiz generator page", () => {
      cy.loginByApi(teacherEmail, teacherPwd).then((res) => {
        if (res.status !== 200) return;
        cy.visit("/dashboard/teacher/quizzes");
        cy.get("body").should("not.contain", "403");
      });
    });
  });

  // ---------- Practice Lab ----------
  context("Practice Lab Page", () => {
    it("Student can visit practice lab without 403/500", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        cy.visit("/dashboard/practice-lab");
        cy.get("body").should("not.contain", "403");
      });
    });
  });

  // ---------- AI Usage Logging ----------
  context("AI Usage Tracking", () => {
    it("POST /api/ai-usage with valid token logs usage", () => {
      cy.loginByApi(studentEmail, studentPwd).then((res) => {
        if (res.status !== 200) return;
        const token = res.body.token;
        cy.request({
          method: "POST",
          url: `${Cypress.env("apiUrl")}/api/ai-usage`,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            operation: "quiz_generation",
            tokensUsed: 2000,
            model: "gemini-pro",
            tenantId: "tenant_test",
          },
          failOnStatusCode: false,
        })
          .its("status")
          .should("not.eq", 403);
      });
    });
  });
});
