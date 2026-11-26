import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectFactualWording } from "./post-match-helpers.js";

const MANAGED = "Aster Harbour";

/**
 * Plays to full time and sets one of the managed side's own batters to Attack while that side bats. Returns the
 * batter's name, or null if no chance came. The shared V1 helper changes the first aggression control it finds, which
 * can be an opponent batter's when the opponent bats first; the computer captain then sets its own batter's plan back
 * at the same ball, so the record holds no net change to Attack. Changing a managed batter whose plan is not already
 * Attack makes the change in the record certain.
 */
async function playSettingManagedBatterToAttack(page: Page): Promise<string | null> {
  const decision = page.locator("#decision");
  const batting = page.getByTestId("scorestrip").locator("h2");
  let changed: string | null = null;
  for (let n = 0; n < 500; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") return changed;
    const candidate = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidate.count()) > 0) await candidate.first().click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "READY") {
      if (!changed && (await batting.textContent())?.trim() === MANAGED) {
        const controls = page.locator("select[aria-label^='Aggression for']:enabled");
        for (const control of await controls.all()) {
          if ((await control.inputValue()) === "4") continue;
          const label = (await control.getAttribute("aria-label"))!.replace(/^Aggression for /, "");
          await control.selectOption("4", { timeout: 2_000 });
          await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
          await expect(page.getByRole("combobox", { name: `Aggression for ${label}`, exact: true })).toHaveValue("4");
          changed = label;
          break;
        }
        if (changed) continue;
      }
      const finish = decision.getByRole("button", { name: "Finish innings", exact: true });
      if (await finish.isEnabled().catch(() => false)) await finish.click({ timeout: 2_000 }).catch(() => undefined);
      else await page.waitForTimeout(200);
    } else await page.waitForTimeout(200);
  }
  throw new Error("The match did not finish");
}

/**
 * LC_POST_MATCH_ANALYSIS_ARCHIVE_V1: the post-match analysis reopened for a completed career fixture from the fixture
 * list or the Home match report, worked out from the stored event archive. It lists plan and field changes without
 * saying who made them and has no "Your decisions" section. Screenshots are written only when PMA_SHOTS_DIR is set.
 */
const SHOTS = process.env.PMA_SHOTS_DIR;
test.use({ deviceScaleFactor: 2 });

async function openCareer(page: Page) {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
}

async function simulateRoundOne(page: Page) {
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible().catch(() => false)) await advance.click();
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByTestId("match-report")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
}

async function openFixtures(page: Page) {
  await page.getByRole("button", { name: "Season", exact: true }).click();
  await page.getByRole("button", { name: "Fixtures", exact: true }).click();
}

/** The checks every rebuilt analysis must pass. */
async function checkArchivedPanel(panel: Locator) {
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-status", "READY");
  await expect(panel).toHaveAttribute("data-version", "LC_POST_MATCH_ANALYSIS_ARCHIVE_V1");
  await expect(panel).toHaveAttribute("data-rules-version", "LC_POST_MATCH_ANALYSIS_V1");
  await expect(panel.getByRole("heading", { level: 4, name: "Post-match analysis" })).toBeVisible();
  for (const name of ["Phase by phase", "Turning points", "Plan and field changes in the record"])
    await expect(panel.getByRole("heading", { level: 5, name })).toBeVisible();
  // No "Your decisions" section, and the panel says why.
  await expect(panel.getByRole("heading", { name: /Your decisions/ })).toHaveCount(0);
  await expect(panel.getByTestId("apma-no-attribution")).toHaveText(/keeps what happened, not who decided it/);
  await expect(panel.getByTestId("apma-toss")).toHaveText(/^The coin landed (heads|tails): .+ won the toss\. .+ batted first\.$/);
  const table = panel.getByRole("table", { name: "Runs and wickets by phase for each innings" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  for (const row of await table.locator("tbody tr").all()) {
    const total = Number((await row.locator("th .pma-sub").textContent())!.split("/")[0]);
    const cells = await row.locator("td strong").allTextContents();
    expect(cells.reduce((sum, cell) => sum + Number(cell.split("/")[0]), 0)).toBe(total);
  }
  await expectFactualWording(panel);
  await panel.getByTestId("pma-footnote").locator("summary").click();
  await expect(panel.getByTestId("pma-footnote")).toContainText("the comparison of the eleven with the suggested eleven");
  await panel.getByTestId("pma-footnote").locator("summary").click();
}

test("the Home match report reopens the analysis of a simulated fixture from its stored record", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCareer(page);
  await simulateRoundOne(page);
  await page.getByTestId("match-report").getByTestId("match-report-analysis").click();
  await expect(page.getByRole("heading", { name: "Fixtures", level: 2 })).toBeVisible();
  const panel = page.getByTestId("archived-post-match-analysis");
  // Opened for the analysis, focus lands on it rather than on the replay heading.
  await expect(panel).toBeFocused();
  await checkArchivedPanel(panel);
  // A simulated fixture has no plan or field changes in its record.
  await expect(panel.getByTestId("apma-no-changes")).toBeVisible();
  // The ball-by-ball replay is still below it, unchanged.
  await expect(page.getByTestId("replay-archive-meta")).toContainText("LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE");
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/pma2-report-1366-simulated.png` });
  await page.getByRole("button", { name: "Close replay" }).click();
  await expect(panel).toHaveCount(0);
  // Every completed fixture in the list offers it, the computer's own fixtures included.
  const buttons = page.getByTestId("fixture-post-match-analysis");
  await expect(buttons).toHaveCount(4);
  await buttons.nth(3).click();
  await checkArchivedPanel(page.getByTestId("archived-post-match-analysis"));
  await expect(buttons.nth(3)).toBeVisible();
  await page.getByRole("button", { name: "Close replay" }).click();
  await expect(buttons.nth(3)).toBeFocused();
  expect(errors).toEqual([]);
});

test("the reopened analysis fits a 390 px screen", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openCareer(page);
  await simulateRoundOne(page);
  await page.getByTestId("match-report-close").click();
  await openFixtures(page);
  await page.getByTestId("fixture-post-match-analysis").first().click();
  const panel = page.getByTestId("archived-post-match-analysis");
  await checkArchivedPanel(panel);
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // Every phase column is on screen without scrolling the table (the career table rules must not widen it).
  const death = await panel.getByRole("columnheader", { name: /Death/ }).boundingBox();
  expect(death!.x + death!.width).toBeLessThanOrEqual(box!.x + box!.width);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/pma2-fixture-390.png` });
});

test("a missing or damaged stored record shows no analysis, only a note", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCareer(page);
  await simulateRoundOne(page);
  await page.getByTestId("match-report-close").click();
  await openFixtures(page);
  const keys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lord-cricket-xxvi");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["projections", "settings"], "readwrite");
    const get = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
    const all = await get(tx.objectStore("projections").getAll());
    const rows = all.filter((row: { saveId: string; scope: string }) => row.saveId === active.value && (row.scope === "CAREER_MATCH_EVENTS_V1" || row.scope === "CAREER_MATCH_EVENTS_GZIP_V1"));
    tx.objectStore("projections").delete([active.value, rows[0].scope, rows[0].key]);
    const payload = rows[1].payload as string;
    const mid = Math.floor(payload.length / 2);
    tx.objectStore("projections").put({ ...rows[1], payload: payload.slice(0, mid) + (payload[mid] === "A" ? "B" : "A") + payload.slice(mid + 1) });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return { missing: rows[0].key as string, damaged: rows[1].key as string };
  });
  for (const [key, reason] of [[keys.missing, /no stored ball-by-ball record/], [keys.damaged, /could not be verified/]] as const) {
    await page.locator(`[id="analysis-fixtures-${key}"]`).click();
    const panel = page.getByTestId("archived-post-match-analysis");
    await expect(panel).toHaveAttribute("data-status", "UNAVAILABLE");
    await expect(panel.getByTestId("apma-unavailable")).toHaveText(reason);
    await expect(panel.locator("table, ol, li")).toHaveCount(0);
    if (SHOTS && key === keys.damaged) await panel.screenshot({ path: `${SHOTS}/pma2-unavailable-1366.png` });
    await page.getByRole("button", { name: "Close replay" }).click();
  }
  expect(errors).toEqual([]);
});

test("a played career match lists its plan changes from the record, without saying who made them", async ({ page }) => {
  test.setTimeout(480_000);
  await openCareer(page);
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  const batter = await playSettingManagedBatterToAttack(page);
  expect(batter).not.toBeNull();
  await page.getByRole("button", { name: "Return result to career" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await page.getByTestId("match-report-analysis").first().click();
  const panel = page.getByTestId("archived-post-match-analysis");
  await checkArchivedPanel(panel);
  await expect(page.getByTestId("replay-archive-meta")).toBeVisible();
  const changes = panel.getByTestId("apma-changes");
  await expect(changes.getByTestId("apma-change-count")).toHaveText(/^The record has \d+ changes?: /);
  const sides = changes.locator("details");
  expect(await sides.count()).toBeGreaterThan(0);
  for (const side of await sides.all()) await side.locator("summary").click();
  // The managed side's change is in the record, listed under that side and not credited to anyone.
  const managedSide = changes.locator("details").filter({ has: page.locator("summary", { hasText: `Changes for ${MANAGED}` }) });
  const plan = managedSide.locator(".pma-decision[data-kind='BATTING_PLAN']").filter({ hasText: `${batter}: aggression` }).filter({ hasText: "to Attack" }).first();
  await expect(plan).toContainText(new RegExp(`Batting plan changed: (.+; )?${batter!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: aggression \\w+ to Attack`));
  await expect(plan.locator(".pma-followed")).toContainText(/What followed: The next (2 overs|\d+ balls?)/);
  await expect(plan.locator(".pma-measured")).toHaveText(/small effect at most/);
  // Nothing is credited to the player or the computer captain.
  const listed = (await changes.locator("ol").allTextContents()).join(" ");
  expect(listed).not.toMatch(/\byou\b|\byour\b|computer|captain/i);
  if (SHOTS) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${SHOTS}/pma2-played-1366-changes.png` });
  }
});
