import { expect, test } from "@playwright/test";

test("115 percent match text fits the narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#exhibition");
  await page.getByLabel("Text scale").selectOption("115");
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  await page.getByLabel("Commentary").selectOption("brief");
  await page.getByLabel("Layout").selectOption("compact");
  await page.reload();
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  await expect(page.getByLabel("Commentary")).toHaveValue("brief");
  await expect(page.getByLabel("Layout")).toHaveValue("compact");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("invalid saved match preferences fall back to supported values", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("lcxxvi-match-scale", "unsupported");
    localStorage.setItem("lcxxvi-match-commentary", "unsupported");
    localStorage.setItem("lcxxvi-match-density", "unsupported");
  });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Text scale")).toHaveValue("100");
  await expect(page.getByLabel("Commentary")).toHaveValue("full");
  await expect(page.getByLabel("Layout")).toHaveValue("comfortable");
});
