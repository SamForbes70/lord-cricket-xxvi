import { expect, test } from "@playwright/test";

// Pavilion B2: these checks drive whole matches with their own loop, so routine picks (which can restart an advance
// the loop is about to press) are turned off here; tests/ui/pavilion-routine-picks.spec.ts covers routine picks.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("lcxxvi-routine-picks", "off"); } catch { /* storage blocked */ } });
});

test("Stage 10 exhibition match award displays Player of the Match, formula breakdown, and Game award provenance", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Bat first" }).click();

  for (let step = 0; step < 400; step += 1) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
      timeout: 30_000,
    });
    const phase = await page.locator("#decision").getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    if (phase === "TOSS") {
      await page.getByRole("button", { name: "Call heads" }).click();
    } else if (phase === "AWAITING_INNINGS") {
      await page.getByRole("button", { name: "Bat first" }).click();
    } else if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") {
      await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
    } else {
      await page.getByRole("button", { name: "Finish match", exact: true }).click();
    }
  }

  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "COMPLETE", {
    timeout: 60_000,
  });
  const matchAwardPanel = page.getByTestId("match-award-panel");
  await expect(matchAwardPanel).toBeVisible();
  await expect(matchAwardPanel).toContainText("Player of the Match");
  await expect(matchAwardPanel).toContainText("Game award");
  await expect(page.getByTestId("match-award-winner")).toBeVisible();
  await expect(matchAwardPanel).toContainText("Bat");
  await expect(matchAwardPanel).toContainText("not an official ICC or broadcast formula");

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("Stage 10 career season awards, roll of honour, player honours, replay awards, reload persistence, and .lcxxvi export/import", async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)");

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

  await page.getByTestId("rollover-next-season-btn").click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", {
    timeout: 30_000,
  });

  // Career Roll of Honour shows Season 1 awards
  await page.getByRole("button", { name: "Season", exact: true }).click();
  await page.getByRole("button", { name: "Stories", exact: true }).click();
  const s1AwardsCell = page.getByTestId("season-awards-cell-1");
  await expect(s1AwardsCell).toBeVisible({ timeout: 30_000 });
  await expect(s1AwardsCell).toContainText("Player of the Season", { timeout: 30_000 });

  // Statistics Season Awards panel renders all 5 categories with resolved names and provenance
  await page.getByRole("button", { name: "Season", exact: true }).click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  const seasonAwardsPanel = page.getByTestId("season-awards-panel");
  await expect(seasonAwardsPanel).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("season-awards-provenance")).toContainText("Game award");
  for (const cat of [
    "PLAYER_OF_THE_SEASON",
    "LEADING_RUN_SCORER",
    "LEADING_WICKET_TAKER",
    "BEST_FIELDER",
    "EMERGING_YOUTH_PLAYER",
  ]) {
    await expect(page.getByTestId(`season-award-card-${cat}`)).toBeVisible();
  }
  await expect(page.getByTestId("season-award-card-BEST_FIELDER")).not.toContainText("p001 (");
  await expect(seasonAwardsPanel).toContainText("not an official ICC or broadcast formula");

  // Open Player of the Season winner -> verify PlayerPage Awards & honours
  const potsCard = page.getByTestId("season-award-card-PLAYER_OF_THE_SEASON");
  const potsWinnerName = (await potsCard.locator("button.player-link").textContent())?.trim() ?? "";
  expect(potsWinnerName.length).toBeGreaterThan(0);
  await potsCard.locator("button.player-link").click();
  await expect(page.getByTestId("player-awards-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("player-potm-count")).toBeVisible();
  await expect(page.getByTestId("player-season-awards-table")).toContainText(
    "Player of the Season",
  );
  await page.getByRole("button", { name: "Back to statistics" }).click();

  // Switch to All-time career -> open archived replay -> verify Player of the Match in replay viewer
  await page
    .getByTestId("statistics-scope-bar")
    .getByRole("button", { name: /All-time career/i })
    .click();
  await expect(page.getByTestId("historical-leaderboard-table").locator("tbody tr").first()).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByTestId("historical-leaderboard-table")
    .locator("button.replay-btn")
    .first()
    .click();
  await expect(page.getByTestId("career-replay-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("replay-match-award-panel")).toBeVisible();
  await expect(page.getByTestId("replay-match-award-winner")).toBeVisible();
  await expect(page.getByTestId("replay-match-award-panel")).toContainText("Game award");

  // Reload page -> verify Season awards persist idempotently
  await page.reload();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Season", exact: true }).click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page.getByTestId("season-awards-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("season-award-card-PLAYER_OF_THE_SEASON")).toContainText(
    potsWinnerName,
  );

  // Export .lcxxvi archive and verify awards round-trip cleanly in a fresh browser context
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .lcxxvi" }).click(),
  ]);
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();

  const importedContext = await browser.newContext();
  try {
    const importedPage = await importedContext.newPage();
    const importConsoleErrors: string[] = [];
    const importPageErrors: string[] = [];
    importedPage.on("console", (msg) => {
      if (msg.type() === "error") importConsoleErrors.push(msg.text());
    });
    importedPage.on("pageerror", (err) => importPageErrors.push(err.message));

    await importedPage.goto("/#career");
    await importedPage.getByLabel("Choose .lcxxvi archive").setInputFiles(archivePath!);
    await expect(importedPage.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(importedPage.getByTestId("career-masthead-subtitle")).toContainText(
      "Season 2 (2028)",
      { timeout: 30_000 },
    );
    await importedPage.getByRole("button", { name: "Season", exact: true }).click();
    await importedPage.getByRole("button", { name: "Statistics", exact: true }).click();
    await expect(importedPage.getByTestId("season-awards-panel")).toBeVisible({ timeout: 30_000 });
    await expect(
      importedPage.getByTestId("season-award-card-PLAYER_OF_THE_SEASON"),
    ).toContainText(potsWinnerName);
    expect(importConsoleErrors).toEqual([]);
    expect(importPageErrors).toEqual([]);
  } finally {
    await importedContext.close();
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
