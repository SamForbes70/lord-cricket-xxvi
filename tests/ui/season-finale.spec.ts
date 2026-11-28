import { expect, test } from "@playwright/test";

/** E9: when the last fixture is complete, Home presents the finale step by step (extended by LC_SEASON_REVIEW_V1), and the rollover is unchanged. */
test("a completed season is presented as a finale and then rolls over as before", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByTestId("season-finale")).toHaveCount(0);
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

  const finale = page.getByTestId("season-finale");
  await expect(finale).toBeVisible({ timeout: 30_000 });
  expect(await page.locator(".dashboard-grid > article").first().getAttribute("data-testid")).toBe("season-finale");
  await expect(page.getByTestId("season-finale-heading")).toHaveText(/ are champions$/);
  await expect(page.getByTestId("season-finale-table").locator("tbody tr")).toHaveCount(8);
  // The champion named is the club on top of the final table.
  const topClub = (await page.getByTestId("season-finale-table").locator("tbody tr").first().locator("td").nth(1).textContent()) ?? "";
  await expect(page.getByTestId("season-finale-heading")).toHaveText(`${topClub} are champions`);

  await page.getByTestId("season-finale-continue").click();
  await expect(page.getByTestId("season-finale-heading")).toHaveText(/^Objective (exceeded|met|missed)$/);
  await expect(page.getByTestId("season-finale-verdict")).toContainText(/^Finished \d(st|nd|rd|th)\. The objective was: /);

  // LC_SEASON_REVIEW_V1 adds the season in results before the awards, and your cricketers and the next season after.
  await page.getByTestId("season-finale-continue").click();
  await expect(page.getByTestId("season-finale-heading")).toHaveText("The season in results");
  await page.getByTestId("season-finale-continue").click();
  await expect(page.getByTestId("season-finale-heading")).toHaveText("Season awards");
  await expect(page.getByTestId("season-finale-awards")).toBeVisible({ timeout: 60_000 });
  await expect(finale).not.toContainText(/\bp\d{3}\b/);
  await page.getByTestId("season-finale-continue").click();
  await expect(page.getByTestId("season-finale-heading")).toHaveText("Your cricketers' seasons");
  await page.getByTestId("season-finale-continue").click();
  await expect(page.getByTestId("season-finale-heading")).toHaveText("Looking ahead to Season 2");
  await page.getByTestId("season-finale-continue").click();
  await expect(finale).toHaveCount(0);

  // Seen once: a reload does not show it again, but it can be replayed and skipped.
  await page.reload();
  await expect(page.getByTestId("rollover-next-season-btn")).toBeVisible({ timeout: 60_000 });
  await expect(finale).toHaveCount(0);
  await page.getByTestId("season-finale-replay").click();
  await expect(finale).toBeVisible();
  await page.getByTestId("season-finale-skip").click();
  await expect(finale).toHaveCount(0);

  // The rollover is the existing action and works as before.
  await page.getByTestId("rollover-next-season-btn").click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", { timeout: 60_000 });
  await expect(page.getByText("0/14 managed-team fixtures complete.", { exact: true })).toBeVisible();
  await expect(finale).toHaveCount(0);
});
