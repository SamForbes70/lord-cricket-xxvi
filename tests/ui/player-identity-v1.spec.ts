import { expect, test, type Page } from "@playwright/test";

/**
 * LC_PLAYER_IDENTITY_V1 (docs/pavilion/PLAYER_IDENTITY_V1.md): a playing style on the squad list, in the selection
 * room and on the player page, with personality marked as flavour and a story from recorded figures only; and an
 * introduction on the match screen when a batter walks out or a bowler comes on.
 */
async function openCareer(page: Page) {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/ }).first().click();
}

test("squad style tags, the player page identity and the selection room", async ({ page }) => {
  test.setTimeout(240_000);
  await openCareer(page);
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const table = page.locator("section[aria-labelledby='squad-heading'] table").first();
  await expect(table).toBeVisible({ timeout: 30_000 });

  // Every squad member has exactly one style tag, and the squad is not all one style.
  const rows = table.locator("tbody tr");
  const styles = await table.locator("[data-testid^='player-style-']").allTextContents();
  expect(styles.length).toBe(await rows.count());
  expect(styles.every((text) => text.trim().length > 0)).toBe(true);
  expect(new Set(styles).size).toBeGreaterThanOrEqual(8);

  // The player page: style with the ratings behind it, two flavour traits, and a story with no invented record.
  const firstLink = table.locator("button.player-link").first();
  const name = (await firstLink.innerText()).trim();
  const style = (await table.locator("[data-testid^='player-style-']").first().innerText()).trim();
  await firstLink.click();
  const identity = page.getByTestId("player-identity");
  await expect(identity).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("player-identity-style")).toHaveText(style);
  await expect(page.getByTestId("player-identity-basis")).toContainText("Playing style, from T20 ratings:");
  await expect(page.getByTestId("player-identity-traits")).toContainText("flavour, not a rating");
  await expect(page.getByTestId("player-identity-traits").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("player-identity-story")).toContainText("Yet to play a league match");
  await expect(page.getByRole("heading", { name: `Player: ${name}` })).toBeVisible();

  // The same save shows the same identity when the page is opened again.
  const before = (await identity.textContent()) ?? "";
  expect(before.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Back to squad" }).click();
  await table.locator("button.player-link").first().click();
  await expect(identity).toHaveText(before);

  // After a match, the selection room tags both options with a style.
  await page.getByRole("button", { name: "Clubhouse", exact: true }).click();
  const matchDay = page.getByRole("button", { name: "Advance to match day" });
  const simulate = page.getByRole("button", { name: "Simulate match", exact: true });
  await expect(simulate.or(matchDay)).toBeVisible({ timeout: 30_000 });
  if (await matchDay.isVisible()) await matchDay.click();
  await simulate.click();
  await expect(page.locator(".score-notebook")).toContainText("ROUND 1", { timeout: 60_000 });
  if (await matchDay.isVisible()) await matchDay.click();
  const room = page.getByRole("region", { name: "Selection call" });
  await expect(room).toBeVisible({ timeout: 60_000 });
  const roomStyles = room.locator("[data-testid^='selection-style-']");
  await expect(roomStyles).toHaveCount(2);
  for (const text of await roomStyles.allTextContents()) expect(text.trim().length).toBeGreaterThan(0);
});

test("the match screen introduces a new batter and a new bowler by style", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /QUICK MATCH/i }).click();
  const decision = page.locator("#decision");
  await expect(decision.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
  const chips = page.locator("[data-testid^='match-intro-']");
  type Chip = { text: string; title: string; isNew: boolean };
  const seen: Chip[] = [];
  const read = async () =>
    chips.evaluateAll((nodes) => nodes.map((node) => ({
      text: node.querySelector("i")?.textContent ?? "",
      title: node.getAttribute("title") ?? "",
      isNew: node.getAttribute("data-new") === "true",
    })));
  const both = () => seen.some((c) => c.isNew && c.text.startsWith("Walks out: ")) && seen.some((c) => c.isNew && c.text.startsWith("On to bowl: "));
  for (let n = 0; n < 40; n += 1) {
    seen.push(...(await read()));
    if (both() && seen.some((c) => !c.isNew)) break;
    const next = decision.getByRole("button", { name: "Next delivery" });
    const target = (await next.isEnabled().catch(() => false)) ? next : decision.locator("button:not([disabled])").first();
    await target.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  expect(both(), JSON.stringify(seen.slice(0, 6))).toBe(true);
  for (const chip of seen) {
    // The title is the full introduction: the style and, where earned, the ratings behind it.
    expect(chip.title).toMatch(/^(New at the crease|Into the attack): .+, .+\.$/);
    if (chip.isNew) expect(chip.text).toMatch(/^(Walks out|On to bowl): \S/);
    else expect(chip.text).not.toMatch(/:/);
    // Never a record or a result, which the match screen does not hold.
    expect(`${chip.text} ${chip.title}`).not.toMatch(/\b(runs|wickets|average|won|lost)\b/i);
  }
  // Once a batter has faced, the chip shows the style alone.
  expect(seen.some((c) => !c.isNew)).toBe(true);
});
