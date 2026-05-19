const { expect, test } = require("@playwright/test");

const users = {
  STUDENT: {
    _id: "student-smoke",
    firstName: "Smoke",
    lastName: "Student",
    email: "student-smoke@pregen.test",
    role: "STUDENT",
    tenantId: "tenant-smoke",
  },
  TEACHER: {
    _id: "teacher-smoke",
    firstName: "Smoke",
    lastName: "Teacher",
    email: "teacher-smoke@pregen.test",
    role: "TEACHER",
    tenantId: "tenant-smoke",
  },
  ADMIN: {
    _id: "admin-smoke",
    firstName: "Smoke",
    lastName: "Admin",
    email: "admin-smoke@pregen.test",
    role: "ADMIN",
    tenantId: "tenant-smoke",
  },
  SUPERADMIN: {
    _id: "super-smoke",
    firstName: "Smoke",
    lastName: "Super",
    email: "super-smoke@pregen.test",
    role: "SUPERADMIN",
  },
};

const routes = [
  { name: "student assignments", role: "STUDENT", path: "/dashboard/assignments" },
  { name: "student practice lab", role: "STUDENT", path: "/dashboard/practice-lab" },
  { name: "student quizzes", role: "STUDENT", path: "/dashboard/quizzes" },
  { name: "student AI tutor", role: "STUDENT", path: "/dashboard/ai-tutor" },
  { name: "teacher dashboard", role: "TEACHER", path: "/dashboard/teacher" },
  { name: "teacher quiz builder", role: "TEACHER", path: "/dashboard/teacher/quizzes" },
  { name: "teacher gradebook", role: "TEACHER", path: "/dashboard/grades" },
  { name: "admin users", role: "ADMIN", path: "/dashboard/admin/users" },
  { name: "admin reports", role: "ADMIN", path: "/dashboard/admin/analytics" },
  { name: "super admin analytics", role: "SUPERADMIN", path: "/dashboard/superadmin/analytics" },
  { name: "super admin schools", role: "SUPERADMIN", path: "/dashboard/superadmin/tenants" },
];

function responseForUrl(url) {
  const pathname = new URL(url).pathname;

  if (pathname.includes("/ai/tutor/session/")) {
    return { success: true, session: { id: "session-smoke" } };
  }

  if (pathname.includes("/teachers/dashboard")) {
    return {
      success: true,
      data: {
        courses: [],
        pendingReviews: [],
        recentActivity: [],
        stats: {},
      },
    };
  }

  if (pathname.includes("/gradebook")) {
    return {
      success: true,
      items: [],
      data: [],
      summary: {},
    };
  }

  if (pathname.includes("/super/overview")) {
    return {
      success: true,
      metrics: {},
      alerts: [],
      sourceStatus: {},
      health: { state: "healthy", label: "Healthy" },
    };
  }

  if (pathname.includes("/super/tenants")) {
    return { success: true, items: [], tenants: [], data: [], count: 0 };
  }

  if (pathname.includes("/super/ai-cost")) {
    return {
      success: true,
      summary: {},
      byTenant: [],
      byFeature: [],
      charts: {},
      sourceStatus: {},
    };
  }

  if (pathname.includes("/feature-flags")) {
    return { success: true, items: [] };
  }

  if (pathname.includes("/logs")) {
    return { success: true, items: [] };
  }

  if (pathname.includes("/courses")) {
    return { success: true, items: [], courses: [] };
  }

  if (pathname.includes("/assignments")) {
    return { success: true, items: [], assignments: [], submissions: [], summary: {} };
  }

  if (pathname.includes("/quizzes")) {
    return { success: true, items: [], quizzes: [], questions: [] };
  }

  if (pathname.includes("/announcements")) {
    return { success: true, items: [], announcements: [] };
  }

  if (pathname.includes("/ai/assignments")) {
    return { success: true, data: [], items: [], assignments: [], status: "healthy" };
  }

  if (pathname.includes("/admin/system")) {
    return { success: true, items: [], data: [], summary: {}, metrics: {} };
  }

  return {
    success: true,
    data: [],
    items: [],
    assignments: [],
    courses: [],
    practices: [],
    quizzes: [],
    modules: [],
    announcements: [],
    summary: {},
  };
}

async function installAuthenticatedMocks(page, user) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.includes("/api/users/checkAuth")
      ? { user, token: "smoke-token" }
      : pathname.includes("/api/users/logout")
        ? { success: true }
        : responseForUrl(route.request().url());

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.addInitScript((authUser) => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("user", JSON.stringify({ user: authUser, token: "smoke-token" }));
  }, user);
}

async function expectSidebarFigmaColors(page) {
  const sidebar = page.locator(".pg-sidebar");
  const logoMark = page.locator(".pg-sidebar__mark");
  const inactiveNavItems = page.locator(".pg-nav-item:not(.is-active):not(.is-disabled)");
  const activeNavItems = page.locator(".pg-nav-item.is-active");
  const topbarProfileButtons = page.locator(".pg-topbar__actions .pg-icon-button");

  await expect(sidebar).toHaveCSS("background-color", "rgb(21, 19, 15)");
  await expect(logoMark).toHaveCSS("background-color", "rgb(241, 90, 59)");

  const inactiveStyles = await inactiveNavItems.evaluateAll((items) =>
    items
      .filter((item) => item.isConnected)
      .map((item) => {
        const icon = item.querySelector(".pg-nav-item__icon svg");
        return {
          itemColor: window.getComputedStyle(item).color,
          iconColor: icon ? window.getComputedStyle(icon).color : null,
        };
      })
      .filter((style) => style.itemColor && style.iconColor),
  );
  for (const inactiveStyle of inactiveStyles) {
    expect(inactiveStyle.itemColor).toBe("rgb(229, 231, 235)");
    expect(inactiveStyle.iconColor).toBe("rgb(229, 231, 235)");
  }

  const activeStyles = await activeNavItems.evaluateAll((items) =>
    items
      .filter((item) => item.isConnected)
      .map((item) => ({
        backgroundColor: window.getComputedStyle(item).backgroundColor,
        color: window.getComputedStyle(item).color,
      }))
      .filter((style) => style.backgroundColor && style.color),
  );
  for (const activeStyle of activeStyles) {
    expect(activeStyle.backgroundColor).toBe("rgb(52, 120, 246)");
    expect(activeStyle.color).toBe("rgb(255, 255, 255)");
  }

  const topbarProfileColors = await topbarProfileButtons.evaluateAll((buttons) =>
    buttons.map((button) => window.getComputedStyle(button).color),
  );
  for (const topbarProfileColor of topbarProfileColors) {
    expect(topbarProfileColor).toBe("rgb(107, 114, 128)");
  }
}

for (const routeCase of routes) {
  test(`${routeCase.name} renders one authenticated shell`, async ({ page }) => {
    const fatalConsole = [];
    page.on("console", (message) => {
      const text = message.text();
      const expectedRealtimeFallback =
        text.includes("WebSocket connection") && text.includes("/socket.io/");
      if (message.type() === "error" && !expectedRealtimeFallback) {
        fatalConsole.push(text);
      }
    });
    page.on("pageerror", (error) => fatalConsole.push(error.message));

    await installAuthenticatedMocks(page, users[routeCase.role]);
    await page.goto(routeCase.path);

    await expect(page.locator(".pg-sidebar")).toHaveCount(1);
    await expect(page.locator(".pg-topbar")).toHaveCount(1);
    await expect(page.locator("main h1, main h2, main h3").first()).toBeVisible();
    await expect(page.locator(".pg-topbar").locator("text=PreGen")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Gemini");
    await expectSidebarFigmaColors(page);

    expect(fatalConsole).toEqual([]);
  });
}
