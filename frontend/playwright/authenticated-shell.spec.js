const { expect, test } = require("@playwright/test");

const studentUser = {
  _id: "student-smoke",
  firstName: "Smoke",
  lastName: "Student",
  email: "student-smoke@pregen.test",
  role: "STUDENT",
  tenantId: "tenant-smoke",
};

test("student practice lab renders one authenticated shell", async ({ page }) => {
  await page.route("**/api/users/checkAuth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: studentUser, token: "smoke-token" }),
    });
  });

  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        items: [],
        assignments: [],
        courses: [],
        practices: [],
        quizzes: [],
      }),
    });
  });

  await page.addInitScript((user) => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("user", JSON.stringify({ user, token: "smoke-token" }));
  }, studentUser);

  await page.goto("/dashboard/practice-lab");

  await expect(page.getByRole("heading", { name: "Practice Lab" })).toBeVisible();
  await expect(page.locator(".pg-sidebar")).toHaveCount(1);
  await expect(page.locator(".pg-topbar")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /generate practice/i })).toBeVisible();
});
