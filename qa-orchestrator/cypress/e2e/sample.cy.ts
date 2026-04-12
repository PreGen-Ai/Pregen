describe("qa orchestrator smoke", () => {
  it("loads the configured base url", () => {
    cy.visit("/");
    cy.location("href").should("include", "/");
  });
});
