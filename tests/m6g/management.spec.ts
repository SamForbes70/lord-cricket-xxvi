import { test, expect } from "@playwright/test";

test("M6G management career creates, persists, navigates, progresses and completes", async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
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

  // A delayed hash keeps the real save path pending beyond the old five-second assertion deadline.
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args: Parameters<SubtleCrypto["digest"]>) => {
      crypto.subtle.digest = digest;
      const result = await digest(...args);
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return result;
    };
  });

  for (let managed = 0; managed < 14; managed += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) await advance.click();
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(page.getByText(`${managed + 1}/14 managed-team fixtures complete.`, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 60_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (managed === 0) {
      await page.reload();
      await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 60_000 });
      await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible();
    }
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
    importedPage.on("pageerror", (error) => pageErrors.push(error.message));
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
  expect(pageErrors).toEqual([]);
});

test("M6G primary career controls are keyboard reachable at 1366x768", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Start a Career/i })).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = await page.locator(":focus").evaluate((node) => ({ tag: node.tagName, text: node.textContent }));
  expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(focused.tag);
  await expect(page.locator("main")).toBeVisible();
});
