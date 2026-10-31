import { expect, test } from "@playwright/test";

test("115 percent career text persists across navigation and roster careers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("115");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto("/#roster-career");
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("invalid career text scale falls back to 100 percent", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lcxxvi-career-scale", "unsupported"));
  await page.goto("/#roster-career");
  await expect(page.getByLabel("Text scale")).toHaveValue("100");
});
