import { test, expect } from "@playwright/test";

test("M6G management career creates, persists, navigates, progresses and completes", async ({ page, browser }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Start a Career/i })).toBeVisible();
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible();

  for (const name of ["Career", "Squad", "Fixtures", "Statistics", "Settings", "Home"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const firstTraining = page.locator('select[id^="training-"]').first();
  await firstTraining.selectOption("BATTING_PRACTICE");
  await expect(firstTraining).toHaveValue("BATTING_PRACTICE");
  await page.reload();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(page.locator('select[id^="training-"]').first()).toHaveValue("BATTING_PRACTICE");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("150");
  await expect(page.getByLabel("Text scale")).toHaveValue("150");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await testInfo.attach("career-home-150", { body: await page.screenshot(), contentType: "image/png" });

  for (let managed = 0; managed < 14; managed += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) await advance.click();
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(page.locator(".save-badge strong")).toHaveText("Saved");
  }
  await expect(page.getByText("Season complete", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "League table" })).toBeVisible();
  const completedTable = await page.getByRole("table").first().textContent();
  await testInfo.attach("completed-season", { body: await page.screenshot(), contentType: "image/png" });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .lcxxvi" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.lcxxvi$/);
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();

  // A fresh context proves the archive is sufficient without the source IndexedDB.
  const importedContext = await browser.newContext();
  try {
    const importedPage = await importedContext.newPage();
    await importedPage.goto(page.url());
    await expect(importedPage.getByRole("heading", { name: /Start a Career/i })).toBeVisible();
    await importedPage.getByLabel("Choose .lcxxvi archive").setInputFiles(archivePath!);
    await expect(importedPage.getByText("Season complete", { exact: true }).first()).toBeVisible();
    await importedPage.getByRole("button", { name: "Statistics", exact: true }).click();
    await expect(importedPage.getByRole("table").first()).toHaveText(completedTable!);
    await importedPage.reload();
    await expect(importedPage.getByRole("navigation", { name: "Career navigation" })).toBeVisible();
    await expect(importedPage.getByText("Season complete", { exact: true }).first()).toBeVisible();
  } finally {
    await importedContext.close();
  }
});

test("M6G primary career controls are keyboard reachable at 1366x768", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Start a Career/i })).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = await page.locator(":focus").evaluate((node) => ({ tag: node.tagName, text: node.textContent }));
  expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(focused.tag);
  await expect(page.locator("main")).toBeVisible();
});
