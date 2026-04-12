import { expect, test } from "@playwright/test";

test("homepage responds", async ({ page, baseURL }) => {
  await page.goto(baseURL ?? "/");
  await expect(page).toHaveURL(/.*/);
});
