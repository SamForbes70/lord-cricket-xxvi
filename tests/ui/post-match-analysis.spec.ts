import { expect, test, type Page } from "@playwright/test";
import { expectFactualWording, playToTheEnd } from "./post-match-helpers.js";

/**
 * Directive 02 item B4, first slice: LC_POST_MATCH_ANALYSIS_V1, now shown as LC_POST_MATCH_ANALYSIS_V2 (Directive 03).
 * After a T20 match the player sees phase totals, turning points and their own decisions next to what followed, all
 * derived from the match record, with the model the match recorded and the versions and date of the evidence.
 * Screenshots are written only when PMA_SHOTS_DIR is set.
 */
const SHOTS = process.env.PMA_SHOTS_DIR;
test.use({ deviceScaleFactor: 2 });

async function checkPanel(page: Page) {
  const panel = page.getByTestId("post-match-analysis");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-version", "LC_POST_MATCH_ANALYSIS_V2");
  await expect(panel.getByRole("heading", { level: 3, name: "Post-match analysis" })).toBeVisible();
  for (const name of ["Phase by phase", "Turning points", "Your decisions and what followed", "Model and versions"])
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
  // V2 names the model from the match's own setup, says plainly what the record does not keep, and dates the evidence.
  await expect(panel.getByTestId("pma-versions-model")).toHaveText("Model: synthetic-alpha-01, as recorded in this match's setup.");
  await expect(panel.getByTestId("pma-versions-captain")).toHaveText(/Computer captain: not recorded\.|no computer captain version applies/);
  await expect(panel.getByTestId("pma-versions-evidence")).toContainText(
    "tactical validation of 27 November 2026, model synthetic-alpha-01 with computer captain LC_T20_TACTICAL_CAPTAIN_V6 and batting policy LC_T20_BATTING_POLICY_V3");
  await panel.getByTestId("pma-footnote").locator("summary").click();
  await expect(panel.getByText("Bowler choice, the four bowling plans tested and the two-slip field held all innings showed no detectable effect")).toBeVisible();
  await expect(panel.getByTestId("pma-footnote")).toContainText("tactical validation of 27 November 2026");
  await expect(panel).not.toContainText("25 November 2026");
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
  await expect(plan.locator(".pma-measured")).toHaveText(/^Measured under these versions, for one aggression held all match: .+ Batting intent was not measured\.$/);
  // Against the computer captain, the record keeps the computer's decisions without its version.
  await expect(panel.getByTestId("pma-versions-captain")).toContainText(
    "Computer captain: not recorded. The match record keeps the computer's");
  await expect(panel.getByTestId("pma-versions-captain")).toContainText("This build's computer captain is LC_T20_TACTICAL_CAPTAIN_V6 with batting policy LC_T20_BATTING_POLICY_V3");
  if (SHOTS) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${SHOTS}/pma-career-1366-summary.png` });
  }
  const picks = panel.locator(".pma-picks");
  await expect(picks.locator("summary")).toHaveText(/Batter and bowler picks \(\d+\)/);
  await picks.locator("summary").click();
  await expect(picks.locator(".pma-decision[data-kind='BOWLER'] .pma-measured").first()).toHaveText(/No detectable effect on results, so this is shown as a record only\.$/);
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
