import { expect, test } from "@playwright/test";

test("Stage 9 historical statistics, filters, qualified leaderboards, fielding records, retired views, and match links work end-to-end", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)");

  // Complete Season 1 (14 rounds) and advance to Season 2 Round 1.
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

  const rolloverBtn = page.getByTestId("rollover-next-season-btn");
  await expect(rolloverBtn).toBeVisible();
  await rolloverBtn.click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", {
    timeout: 30_000,
  });

  const advanceS2 = page.getByRole("button", { name: "Advance to match day" });
  if (await advanceS2.isVisible().catch(() => false)) {
    await advanceS2.click();
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  }
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible(
    { timeout: 60_000 },
  );
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });

  // Open Statistics and verify historical records panel + separation disclosure.
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await page.getByTestId("statistics-scope-bar").getByRole("button", { name: /All-time career/i }).click();

  const histPanel = page.getByTestId("historical-records-panel");
  await expect(histPanel).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("historical-stats-provenance")).toContainText(
    "exhibition matches, scenario attempts",
  );
  await expect(page.getByTestId("historical-stats-provenance")).toContainText("60/60 career fixtures");

  // Switch qualified leaderboard tabs & check qualification rule summary + contributing match link.
  const lbSection = page.getByTestId("historical-leaderboards-section");
  await expect(lbSection).toBeVisible();
  await lbSection.getByRole("button", { name: "Batting average" }).click();
  await expect(page.getByTestId("leaderboard-rule-summary")).toContainText("Qualification:");
  await expect(page.getByTestId("leaderboard-qualification-count")).toContainText("qualified of");

  await lbSection.getByRole("button", { name: "Fielding dismissals" }).click();
  await expect(page.getByTestId("leaderboard-rule-summary")).toContainText("archived match");
  await expect(page.getByTestId("historical-leaderboard-table").locator("tbody tr").first()).toBeVisible();

  // Launch archived replay directly from a leaderboard row.
  await page
    .getByTestId("historical-leaderboard-table")
    .locator("button.replay-btn")
    .first()
    .click();
  await expect(page.getByTestId("career-replay-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("replay-archive-meta")).toContainText(
    /LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V/,
  );
  await page.getByTestId("career-replay-viewer").getByRole("button", { name: "Close replay" }).click();

  // Exercise opponent, venue, batting-position, and player-status filters.
  const filters = page.getByTestId("historical-stats-filters");
  const opponentSelect = filters.getByLabel("Historical opponent filter");
  const firstOpponentValue = await opponentSelect.locator("option").nth(1).getAttribute("value");
  expect(firstOpponentValue).not.toBeNull();
  await opponentSelect.selectOption(firstOpponentValue!);
  await expect(page.getByTestId("historical-stats-provenance")).not.toContainText(
    "60/60 career fixtures",
  );

  await filters.getByLabel("Historical batting position filter").selectOption("TOP_ORDER");
  await expect(page.getByTestId("historical-player-records-table")).toBeVisible();

  await filters.getByLabel("Historical player inclusion filter").selectOption("RETIRED");
  // Reset filters restores all 60 career matches.
  await page.getByTestId("reset-historical-filters-btn").click();
  await expect(page.getByTestId("historical-stats-provenance")).toContainText("60/60 career fixtures");

  // Open a player record from the filtered career & fielding table and verify contributing matches + replay.
  await page
    .getByTestId("historical-player-records-table")
    .locator("tbody tr button.player-link")
    .first()
    .click();
  await expect(page.getByTestId("player-historical-records")).toBeVisible();
  await expect(page.getByTestId("player-contributing-matches-table")).toBeVisible();
  await page
    .getByTestId("player-contributing-matches-table")
    .locator("button.replay-btn")
    .first()
    .click();
  await expect(page.getByTestId("career-replay-viewer")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("career-replay-viewer").getByRole("button", { name: "Close replay" }).click();

  // Check 150% text scale has zero horizontal overflow on Statistics.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("150");
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page.getByTestId("historical-records-panel")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);

  // Check imported-roster route discloses its isolation from standard careers.
  await page.goto("/#roster-career");
  await expect(page.getByRole("heading", { name: "Imported roster career" })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
