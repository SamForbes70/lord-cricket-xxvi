import { expect, test } from "@playwright/test";

test("Stage 2 persistent world completes Season 1, rolls into Season 2, preserves Roll of Honour + all-time stats + ball-by-ball replay, and round-trips .lcxxvi", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)");

  // Complete all 14 managed rounds of Season 1.
  for (let round = 1; round <= 14; round += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) {
      await advance.click();
      await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
    }
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  }

  const rolloverBtn = page.getByTestId("rollover-next-season-btn");
  await expect(rolloverBtn).toBeVisible();
  await expect(rolloverBtn).toContainText("Close season & advance to Season 2 (2028)");
  await rolloverBtn.click();

  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", { timeout: 30_000 });
  await expect(page.getByText("0/14 managed-team fixtures complete.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("persistent-world-progress")).toContainText("1 completed season");

  // Complete Round 1 of Season 2 so all-time career stats span 2 seasons (56 + 4 = 60 matches or >= 57).
  const advanceS2 = page.getByRole("button", { name: "Advance to match day" });
  if (await advanceS2.isVisible().catch(() => false)) await advanceS2.click();
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });

  // Inspect Roll of Honour & archived Season 1 table + historical replay on Career tab.
  await page.getByRole("button", { name: "Career", exact: true }).click();
  const historyPanel = page.getByTestId("completed-seasons-history");
  await expect(historyPanel).toBeVisible();
  await expect(historyPanel).toContainText("2027");
  await historyPanel.getByRole("button", { name: "Inspect Season 1" }).click();
  const season1Detail = page.getByTestId("archived-season-detail-1");
  await expect(season1Detail).toBeVisible();
  await season1Detail.getByRole("button", { name: "View replay" }).first().click();
  await expect(page.getByTestId("career-replay-viewer")).toBeVisible();
  await expect(page.getByTestId("replay-archive-meta")).toContainText("LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1");
  await page.getByTestId("career-replay-viewer").getByRole("button", { name: "Close replay" }).click();

  // Inspect All-time career statistics & archived Season 1 scope.
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  const scopeBar = page.getByTestId("statistics-scope-bar");
  await expect(scopeBar).toBeVisible();
  await scopeBar.getByRole("button", { name: /All-time career/i }).click();
  await expect(page.getByTestId("all-time-career-statistics")).toBeVisible();
  await expect(page.getByTestId("all-time-career-statistics")).toContainText("All-time club honours & records");

  // Inspect player season-by-season breakdown across Season 1 and Season 2.
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("button.player-link").first().click();
  await expect(page.getByTestId("player-career-history")).toBeVisible();
  await expect(page.getByTestId("player-career-history")).toContainText("Season 1 · 2027");
  await expect(page.getByTestId("player-career-history")).toContainText("Completed");
  await expect(page.getByTestId("player-career-history")).toContainText("Season 2 · 2028");
  await expect(page.getByTestId("player-career-history")).toContainText("Active");

  // Export persistent-world .lcxxvi archive and verify clean import in an isolated context.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .lcxxvi" }).click(),
  ]);
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();

  const importedContext = await browser.newContext();
  try {
    const importedPage = await importedContext.newPage();
    importedPage.on("pageerror", (err) => pageErrors.push(err.message));
    await importedPage.goto("/#career");
    await importedPage.getByLabel("Choose .lcxxvi archive").setInputFiles(archivePath!);
    await expect(importedPage.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
    await expect(importedPage.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)");
    await importedPage.getByRole("button", { name: "Career", exact: true }).click();
    await expect(importedPage.getByTestId("completed-seasons-history")).toContainText("2027");
  } finally {
    await importedContext.close();
  }

  expect(pageErrors).toEqual([]);
});
