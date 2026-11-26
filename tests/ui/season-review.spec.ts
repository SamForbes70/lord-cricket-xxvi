import { expect, test, type Page } from "@playwright/test";

/**
 * LC_SEASON_REVIEW_V1 (docs/pavilion/SEASON_REVIEW_V1.md): two league seasons are simulated to their end. Each ends
 * with the season review inside the finale: how the title was won, the season in results, league and club awards,
 * your cricketers' seasons, and what is known about the next season. The second season also shows the development
 * recorded when the first closed. Layout is checked at 1366 by 768 and at 390 px. Screenshots are taken only when
 * LCXXVI_SEASON_SHOTS names a folder (local evidence, never committed).
 */
const SHOTS = process.env.LCXXVI_SEASON_SHOTS ?? "";
test.use(SHOTS ? { deviceScaleFactor: 2 } : {});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.getByTestId("season-finale").screenshot({ path: `${SHOTS}/season-${name}.png` });
}

async function playSeason(page: Page) {
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
}

/** No horizontal page scroll, and the finale fits the viewport. */
async function expectFits(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.getByTestId("season-finale").boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
}

const heading = (page: Page) => page.getByTestId("season-finale-heading");
const next = (page: Page) => page.getByTestId("season-finale-continue");

test("a completed season ends with the season review, built from the recorded season", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)", { timeout: 30_000 });

  // Queue an academy prospect for promotion: the review's look ahead names it.
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const prospect = page.getByTestId("youth-academy-panel").locator("tbody tr").first();
  const prospectName = (await prospect.locator("strong").innerText()).trim();
  const queue = prospect.getByRole("checkbox", { name: `Queue ${prospectName} for off-season promotion` });
  await queue.click();
  await expect(queue).toBeChecked({ timeout: 30_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await page.getByRole("button", { name: "Clubhouse", exact: true }).click();

  await playSeason(page);
  const finale = page.getByTestId("season-finale");
  await expect(finale).toBeVisible({ timeout: 30_000 });

  // 1. Champions: the title race and your club's season, from the applied results.
  await expect(heading(page)).toHaveText(/ are champions$/);
  const champion = (await heading(page).innerText()).replace(/ are champions$/, "");
  await expect(page.getByTestId("season-review-title-race")).toHaveText(new RegExp(`^${champion} won the title with \\d+ points from 14 matches \\(\\d+ won\\), `));
  await expect(page.getByTestId("season-review-club")).toHaveText(/^Aster Harbour finished \d+(st|nd|rd|th) with \d+ won, \d+ lost/);
  await expectFits(page);
  await shot(page, "1366-1-champions");

  // 2. Board verdict, unchanged from E9.
  await next(page).click();
  await expect(heading(page)).toHaveText(/^Objective (exceeded|met|missed)$/);
  await expect(heading(page)).toBeFocused();

  // 3. The season in results: league bests of the first season, never called records yet.
  await next(page).click();
  await expect(heading(page)).toHaveText("The season in results");
  await expect(heading(page)).toBeFocused();
  const records = page.getByTestId("season-review-records");
  await expect(records.locator("dt")).toHaveText(["Highest total", "Highest score", "Best bowling"]);
  await expect(records).not.toContainText("record");
  await expect(page.getByTestId("season-review-club-story").locator("dt").first()).toBeVisible();
  await expectFits(page);
  await shot(page, "1366-2-story");

  // 4. Awards: the league's (E10) and your club's, with their rules.
  await next(page).click();
  await expect(heading(page)).toHaveText("Season awards");
  await expect(page.getByTestId("season-finale-awards")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("season-review-club-awards").locator("dt")).toHaveText([
    "Club player of the season", "Club top run scorer", "Club top wicket taker", "Club best economy",
  ]);
  await expect(page.getByTestId("season-review-club-awards")).toContainText("one a run and 20 a wicket");
  await expectFits(page);
  await shot(page, "1366-3-awards");

  // 5. Your cricketers: season lines, milestones, and no development before the first season.
  await next(page).click();
  await expect(heading(page)).toHaveText("Your cricketers' seasons");
  expect(await page.getByTestId("season-review-squad").locator("tbody tr").count()).toBeGreaterThanOrEqual(11);
  await expect(page.getByTestId("season-review-development")).toHaveText(/^No season closed before this one/);
  await expectFits(page);
  await shot(page, "1366-4-cricketers");

  // 6. Looking ahead: the queued prospect and the rollover's order of business.
  await next(page).click();
  await expect(heading(page)).toHaveText("Looking ahead to Season 2");
  const ahead = page.getByTestId("season-review-ahead");
  await expect(ahead).toContainText(`Queued for promotion at the close: ${prospectName}.`);
  await expect(ahead).toContainText("Closing the season starts Season 2");
  await expectFits(page);
  await shot(page, "1366-5-ahead");
  await expect(finale).not.toContainText(/[–—]/);

  // Phone width: walk back through every step.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [index, name] of ["5-ahead", "4-cricketers", "3-awards", "2-story", "1b-board", "1-champions"].entries()) {
    if (index > 0) await page.getByTestId("season-finale-back").click();
    await expectFits(page);
    await shot(page, `390-${name}`);
  }
  await expect(page.getByTestId("season-finale-back")).toHaveCount(0);
  await page.setViewportSize({ width: 1366, height: 768 });

  // Through to the end.
  for (let step = 0; step < 6; step += 1) await next(page).click();
  await expect(finale).toHaveCount(0);

  // Season 2: the development recorded when Season 1 closed, and league bests compared with Season 1.
  await page.getByTestId("rollover-next-season-btn").click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", { timeout: 60_000 });
  await playSeason(page);
  await expect(finale).toBeVisible({ timeout: 30_000 });
  while (!(await heading(page).innerText()).startsWith("Your cricketers")) await next(page).click();
  await expect(page.getByTestId("season-review-development")).toContainText("Skill changes recorded when Season 1 closed");
  await expect(page.getByTestId("season-review-milestones")).toBeVisible();
  await shot(page, "1366-6-season2-cricketers");
  await page.getByTestId("season-finale-back").click();
  await page.getByTestId("season-finale-back").click();
  await expect(heading(page)).toHaveText("The season in results");
  await shot(page, "1366-7-season2-story");
  await page.getByTestId("season-finale-skip").click();
  await expect(finale).toHaveCount(0);
  expect(errors).toEqual([]);
});
