import { expect, test } from "@playwright/test";

test("115 percent match text fits the narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#exhibition");
  await page.getByLabel("Text scale").selectOption("115");
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
