import { expect, test, type Page } from "@playwright/test";

/**
 * LC_PLAYER_IDENTITY_V2 (docs/pavilion/PLAYER_IDENTITY_V2.md): selection advice in the selection room, labelled as
 * suggestions, and factual introductions from the league record in a managed career match, inside the existing chip
 * so the first screen keeps its height at 1366 by 768 and nothing overflows at 390 px.
 */
const SHOTS = process.env.LCXXVI_PID2_SHOT_DIR;
test.use({ deviceScaleFactor: 2 });

async function shot(page: Page, name: string, locator?: ReturnType<Page["locator"]>) {
  if (!SHOTS) return;
  if (locator) await locator.screenshot({ path: `${SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function toSelectionRoom(page: Page) {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/ }).first().click();
  const matchDay = page.getByRole("button", { name: "Advance to match day" });
  const simulate = page.getByRole("button", { name: "Simulate match", exact: true });
  await expect(simulate.or(matchDay)).toBeVisible({ timeout: 30_000 });
  if (await matchDay.isVisible()) await matchDay.click();
  await simulate.click();
  await expect(page.locator(".score-notebook")).toContainText("ROUND 1", { timeout: 60_000 });
  if (await matchDay.isVisible()) await matchDay.click();
  const room = page.getByRole("region", { name: "Selection call" });
  await expect(room).toBeVisible({ timeout: 60_000 });
  return room;
}

test("selection advice, then factual introductions in the managed match", async ({ page }) => {
  test.setTimeout(300_000);
  const room = await toSelectionRoom(page);

  // The advice: every line is labelled, inferences as suggestions, with the caveat that it is not a prediction.
  await expect(room.getByTestId("selection-advice-note")).toContainText("not a prediction");
  const items = room.locator(".selection-advice li");
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  for (let n = 0; n < count; n += 1) {
    const item = items.nth(n);
    const kind = await item.getAttribute("data-kind");
    const label = (await item.locator("b").innerText()).trim().toLowerCase();
    expect(label).toBe(kind === "SUGGESTION" ? "suggestion" : kind === "RATING" ? "rating" : "record");
    expect(await item.innerText()).not.toMatch(/\b(will win|wins|more likely|improves|guarantee)\b/i);
  }
  await room.scrollIntoViewIfNeeded();
  await shot(page, "pid2-selection-advice", room);

  // Play the managed match: the openers and the opening bowler are introduced from the league record.
  await page.getByRole("button", { name: "Play match" }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await expect(page.getByText(/this result will return to the management career/i)).toBeVisible();
  const chips = page.locator("[data-testid^='match-intro-']");
  for (let n = 0; n < 12 && (await chips.count()) < 3; n += 1) {
    const phase = await decision.getAttribute("data-phase");
    const target = phase === "TOSS" ? decision.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? decision.getByRole("button", { name: "Bat first" })
      : decision.locator("button[data-candidate]:enabled, button:not([disabled])").first();
    await target.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  const read = () => chips.evaluateAll((nodes) => nodes.map((node) => ({
    text: node.querySelector("i")?.textContent ?? "",
    title: node.getAttribute("title") ?? "",
    isNew: node.getAttribute("data-new") === "true",
    source: node.getAttribute("data-source"),
  })));
  const intros = (await read()).filter((c) => c.isNew);
  expect(intros.length, JSON.stringify(await read())).toBeGreaterThanOrEqual(2);
  for (const chip of intros) {
    expect(chip.source).toBe("CAREER");
    expect(chip.text).toMatch(/^(Walks out|On to bowl): (\d+ (runs?|wickets?)|\d+ from \d+ (runs|wickets)|first league (innings|over))/);
    expect(chip.title).toMatch(/^(New at the crease|Into the attack): .+\. (League record before this match: |No league match recorded before this one\.|No league innings in |Has not bowled in )/);
  }
  expect(intros.some((c) => c.text.startsWith("Walks out: "))).toBe(true);
  expect(intros.some((c) => c.text.startsWith("On to bowl: "))).toBe(true);

  // The first screen keeps its height: the decision controls stay above the 768 px fold.
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const locator of [page.getByTestId("active"), page.locator(".decision-top"), decision.getByRole("button", { name: "Next delivery" })]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  }
  await shot(page, "pid2-match-intro-1366");
  await shot(page, "pid2-match-intro-active", page.getByTestId("active"));

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
  await shot(page, "pid2-match-intro-390", page.getByTestId("active"));
  await page.setViewportSize({ width: 1366, height: 768 });

  // After the first legal ball the chip shows the style alone, as in V1. A wide or no-ball is not a ball faced or a
  // legal ball bowled, so every chip is still an introduction after it: bowl on until a legal ball has been recorded
  // (the over count moves), then check.
  const oversOf = () => page.getByTestId("active").evaluate((n) => (n.textContent ?? "").match(/(\d+\.\d) overs/)?.[1] ?? null);
  const startOvers = await oversOf();
  for (let n = 0; n < 6 && (await oversOf()) === startOvers; n += 1) {
    await decision.getByRole("button", { name: "Next delivery" }).click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  expect(await oversOf()).not.toBe(startOvers);
  const after = await read();
  expect(after.some((c) => !c.isNew && !/:/.test(c.text)), JSON.stringify(after)).toBe(true);
});
