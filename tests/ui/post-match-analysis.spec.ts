import { expect, test, type Page } from "@playwright/test";
import { expectFactualWording, playToTheEnd } from "./post-match-helpers.js";

/**
 * Directive 02 item B4, first slice: LC_POST_MATCH_ANALYSIS_V1. After a T20 match the player sees phase totals,
 * turning points and their own decisions next to what followed, all derived from the match record.
 * Screenshots are written only when PMA_SHOTS_DIR is set.
 */
const SHOTS = process.env.PMA_SHOTS_DIR;
test.use({ deviceScaleFactor: 2 });

async function checkPanel(page: Page) {
  const panel = page.getByTestId("post-match-analysis");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-version", "LC_POST_MATCH_ANALYSIS_V1");
  await expect(panel.getByRole("heading", { level: 3, name: "Post-match analysis" })).toBeVisible();
  for (const name of ["Phase by phase", "Turning points", "Your decisions and what followed"])
    await expect(panel.getByRole("heading", { level: 4, name })).toBeVisible();
  const table = panel.getByRole("table", { name: "Runs and wickets by phase for each innings" });
  await expect(table.getByRole("columnheader")).toHaveText([/Batting side/, /Powerplay/, /Middle/, /Death/]);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  // The phase runs add up to each innings total shown in the row header.
  for (const row of await table.locator("tbody tr").all()) {
    const total = Number((await row.locator("th .pma-sub").textContent())!.split("/")[0]);
    const cells = await row.locator("td strong").allTextContents();
    expect(cells.reduce((sum, cell) => sum + Number(cell.split("/")[0]), 0)).toBe(total);
  }
  const decisions = panel.getByTestId("pma-decisions");
  await expect(decisions.locator(".pma-decision[data-kind='SELECTION']").first()).toBeVisible();
  // Nothing claims a cause, and the prose has no en or em dashes.
  await expectFactualWording(panel);
  await panel.getByTestId("pma-footnote").locator("summary").click();
  await expect(panel.getByText("Bowler choice, bowling plans and field settings showed no detectable effect")).toBeVisible();
  return panel;
}

test("a managed career match ends with an analysis of the player's own decisions", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  const changed = await playToTheEnd(page);
  expect(changed).toBe(true);
  const panel = await checkPanel(page);
  // The managed side comes first; the batting plan change is listed with what followed. The aggression control
  // can also set an opponent batter's plan, which then appears under that side.
  await expect(panel.getByTestId("pma-decisions").locator(".pma-side").first().locator(".pma-decision[data-kind='SELECTION']")).toHaveCount(1);
  const plan = panel.locator(".pma-decision[data-kind='BATTING_PLAN']").first();
  await expect(plan).toContainText("Attack");
  await expect(plan.locator(".pma-followed")).toContainText(/What followed: The next (2 overs|\d+ balls?)/);
  await expect(plan.locator(".pma-measured")).toHaveText(/small effect at most/);
  if (SHOTS) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${SHOTS}/pma-career-1366-summary.png` });
  }
  const picks = panel.locator(".pma-picks");
  await expect(picks.locator("summary")).toHaveText(/Batter and bowler picks \(\d+\)/);
  await picks.locator("summary").click();
  await expect(picks.locator(".pma-decision[data-kind='BOWLER'] .pma-measured").first()).toHaveText(/no detectable effect/);
  if (SHOTS) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${SHOTS}/pma-career-1366-picks-open.png` });
  }
});

test("an exhibition shows the same analysis and fits a 390 px screen", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  await expect(page.getByTestId("scorestrip")).toBeVisible({ timeout: 60_000 });
  await playToTheEnd(page);
  const panel = await checkPanel(page);
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (SHOTS) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${SHOTS}/pma-exhibition-390.png` });
    await page.getByTestId("pma-turning-points").screenshot({ path: `${SHOTS}/pma-exhibition-390-turning.png` });
  }
});
