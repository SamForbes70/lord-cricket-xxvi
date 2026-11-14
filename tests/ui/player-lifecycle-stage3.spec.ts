import { expect, test } from "@playwright/test";

test("Stage 3 player lifecycle promotes youth prospects, runs off-season ageing/development/retirement, preserves retired alumni pages, and round-trips V2 .lcxxvi", async ({
  page,
  browser,
}) => {
  test.setTimeout(210_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)");

  // Open Squad and verify Youth Academy pathway with fictional model version.
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const academyPanel = page.getByTestId("youth-academy-panel");
  await expect(academyPanel).toBeVisible();
  await expect(academyPanel).toContainText("LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1");

  const prospectRows = academyPanel.locator("tbody tr");
  await expect(prospectRows).toHaveCount(3);
  const firstProspectName = (await prospectRows.nth(0).locator("strong").innerText()).trim();
  const secondProspectName = (await prospectRows.nth(1).locator("strong").innerText()).trim();

  // Update academy focus and promote first prospect directly before Round 1.
  await prospectRows.nth(0).locator("select").selectOption("BATTING_PRACTICE");
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await prospectRows.nth(0).getByRole("button", { name: `Promote ${firstProspectName} now` }).click();
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await expect(prospectRows).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: `View ${firstProspectName}`, exact: true }),
  ).toBeVisible();

  // Queue second prospect for automatic off-season graduation.
  const queueCheckbox = prospectRows
    .nth(0)
    .getByRole("checkbox", { name: `Queue ${secondProspectName} for off-season promotion` });
  await queueCheckbox.click();
  await expect(queueCheckbox).toBeChecked({ timeout: 30_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });

  // Return to Home and simulate all 14 rounds of Season 1.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  for (let round = 1; round <= 14; round += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) {
      await advance.click();
      await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
    }
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(
      page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  }

  // Close Season 1 and run off-season ageing, training development, retirements, and youth intake into Season 2.
  const rolloverBtn = page.getByTestId("rollover-next-season-btn");
  await expect(rolloverBtn).toBeVisible();
  await rolloverBtn.click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", {
    timeout: 30_000,
  });

  // Inspect Off-season lifecycle report and Season 1 lifecycle replay on Career tab.
  await page.getByRole("button", { name: "Career", exact: true }).click();
  const transitionPanel = page.getByTestId("offseason-lifecycle-report");
  await expect(transitionPanel).toBeVisible();
  await expect(transitionPanel).toContainText("Off-season lifecycle report · Season 1 to Season 2 (2028)");
  await expect(transitionPanel).toContainText("LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1");
  await expect(transitionPanel).toContainText(/\d+ new academy prospects/);

  const historyPanel = page.getByTestId("completed-seasons-history");
  await historyPanel.getByRole("button", { name: "Inspect Season 1" }).click();
  const season1Detail = page.getByTestId("archived-season-detail-1");
  await expect(season1Detail).toBeVisible();
  await season1Detail.getByRole("button", { name: "View replay" }).first().click();
  await expect(page.getByTestId("career-replay-viewer")).toBeVisible();
  await expect(page.getByTestId("replay-archive-meta")).toContainText(
    "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE",
  );
  await page.getByTestId("career-replay-viewer").getByRole("button", { name: "Close replay" }).click();

  // Inspect Squad -> Retired alumni directory and open retired veteran's preserved player page.
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `View ${secondProspectName}`, exact: true }),
  ).toBeVisible();
  const retiredPanel = page.getByTestId("retired-players-panel");
  await expect(retiredPanel).toBeVisible();
  const retiredLink = retiredPanel.locator("button.player-link").first();
  const retiredName = (await retiredLink.innerText()).trim();
  await retiredLink.click();
  await expect(page.getByText("Retired alumni record")).toBeVisible();
  await expect(page.getByText(/Retired at age \d+ after Season 1/)).toBeVisible();
  await expect(page.getByTestId("player-skill-ledger")).toBeVisible();

  // Export V2 .lcxxvi archive and verify clean import in an isolated browser context.
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
    await expect(
      importedPage.getByRole("navigation", { name: "Career navigation" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(importedPage.getByTestId("career-masthead-subtitle")).toContainText(
      "Season 2 (2028)",
    );
    await importedPage.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(importedPage.getByTestId("retired-players-panel")).toContainText(retiredName);
  } finally {
    await importedContext.close();
  }

  expect(pageErrors).toEqual([]);
});
