import { expect, test, type Page } from "@playwright/test";

/**
 * LC_PLAYER_IDENTITY_V3 (docs/pavilion/PLAYER_IDENTITY_V3.md): in a managed career match the chip opens the player's
 * page through career inspection, which keeps the match exactly as it was, and a live milestone appears only in the
 * form its rule allows. The chip keeps the first screen's height at 1366 by 768 and nothing overflows at 390 px.
 */
const SHOTS = process.env.LCXXVI_PID3_SHOT_DIR;
test.use({ deviceScaleFactor: 2 });

async function shot(page: Page, name: string, locator?: ReturnType<Page["locator"]>) {
  if (!SHOTS) return;
  if (locator) await locator.screenshot({ path: `${SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const careerCheckpoint = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const tx = db.transaction(["settings", "games"], "readonly");
  const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
  const game = await get(tx.objectStore("games").get(active.value));
  db.close();
  return { saveId: active.value, revision: game.revision, serial: game.checkpointSerial };
});

test("the chip opens the player page while the managed match is kept, and stays compact", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const state = window as unknown as { matchWorkers: number };
    state.matchWorkers = 0;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name?.startsWith("tab-")) state.matchWorkers++;
      }
    };
  });
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible();
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await page.getByLabel("Tactical captain").selectOption("");
  await expect(decision).toHaveAttribute("aria-busy", "false");

  // Toss, innings choice, openers and bowler, then one delivery so the chips leave their introduction.
  const chips = page.locator("[data-testid^='match-intro-']:not([data-testid^='match-intro-open-'])");
  for (let n = 0; n < 12 && (await chips.count()) < 3; n += 1) {
    const phase = await decision.getAttribute("data-phase");
    const target = phase === "TOSS" ? decision.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? decision.getByRole("button", { name: "Bat first" })
      : decision.locator("button[data-candidate]:enabled").first();
    await target.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  await decision.getByRole("button", { name: "Next delivery" }).click();
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

  // Every chip is a button to the player page in a managed career match. A live milestone, when one shows, has the
  // exact form its rule allows; otherwise a player who has faced or bowled shows the style alone.
  const read = () => chips.evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-testid")!.replace("match-intro-", ""),
    text: node.querySelector("i")?.textContent ?? "",
    isNew: node.getAttribute("data-new") === "true",
    live: node.getAttribute("data-live"),
    button: node.querySelector("button.match-style-open") !== null,
  })));
  const all = await read();
  expect(all.length, JSON.stringify(all)).toBeGreaterThanOrEqual(3);
  for (const chip of all) {
    expect(chip.button).toBe(true);
    if (chip.live) expect(chip.text).toMatch(/^(One more|\d+ more) for \d+ league (runs|wickets)$|^Reached \d+ league (runs|wickets)$/);
    else if (!chip.isNew) expect(chip.text).not.toMatch(/:|league/);
  }

  // The first screen keeps its height.
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const locator of [page.getByTestId("active"), page.locator(".decision-top"), decision.getByRole("button", { name: "Next delivery" })]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  }
  await shot(page, "pid3-match-chips-1366");
  await shot(page, "pid3-match-chips-active", page.getByTestId("active"));

  // At 390 px nothing overflows sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const narrow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.width);
  for (const chip of await chips.all()) {
    const box = await chip.boundingBox();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(narrow.width);
  }
  await page.getByTestId("active").scrollIntoViewIfNeeded();
  await shot(page, "pid3-match-chips-390", page.getByTestId("active"));
  await page.setViewportSize({ width: 1366, height: 768 });

  // Open the bowler's page from the chip: the career opens in inspection only, on that player's page.
  const revision = await decision.getAttribute("data-revision");
  const phase = await decision.getAttribute("data-phase");
  const before = await careerCheckpoint(page);
  const bowlerChip = page.locator(".active .active-player").last().locator("[data-testid^='match-intro-open-']");
  const bowlerId = (await bowlerChip.getAttribute("data-testid"))!.replace("match-intro-open-", "");
  const bowlerName = (await page.locator(".active .active-player").last().locator("strong").innerText()).trim();
  await expect(bowlerChip).toHaveAccessibleName(new RegExp(`Opens ${bowlerName}'s player page; the match is kept\\.`));
  await bowlerChip.click();
  await expect(page.getByRole("status").filter({ hasText: "Career inspection only" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: `Player: ${bowlerName}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Back to (squad|statistics)$/ })).toBeVisible();
  await shot(page, "pid3-player-page-from-chip");
  expect(await careerCheckpoint(page)).toEqual(before);

  // Back to the match: the same revision and phase, the same worker, nothing written to the career.
  await page.getByRole("link", { name: "Return to match" }).click();
  await expect(decision).toHaveAttribute("data-revision", revision!);
  await expect(decision).toHaveAttribute("data-phase", phase!);
  expect(await page.evaluate(() => (window as unknown as { matchWorkers: number }).matchWorkers)).toBe(1);
  await expect(page.getByTestId(`match-intro-${bowlerId}`)).toBeVisible();

  // The match carries on, and the existing "Inspect career" button still opens the career home, not a player page.
  await decision.getByRole("button", { name: "Next delivery" }).click();
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByRole("button", { name: "Inspect career" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Career inspection only" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Player: / })).toHaveCount(0);
  await page.getByRole("link", { name: "Return to match" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a quick match chip is not a link and shows no league milestone", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /QUICK MATCH/i }).click();
  const decision = page.locator("#decision");
  await expect(decision.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
  const chips = page.locator("[data-testid^='match-intro-']");
  for (let n = 0; n < 40 && (await chips.count()) < 3; n += 1) {
    const next = decision.getByRole("button", { name: "Next delivery" });
    const target = (await next.isEnabled().catch(() => false)) ? next : decision.locator("button:not([disabled])").first();
    await target.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  expect(await chips.count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator("button.match-style-open")).toHaveCount(0);
  await expect(page.locator(".match-style[data-live]")).toHaveCount(0);
  for (const source of await chips.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-source")))) expect(source).toBe("STYLE_ONLY");
});
