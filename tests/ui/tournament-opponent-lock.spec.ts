import { expect, test } from "@playwright/test";
import { expectTournamentOpponentLocked, playOneAgainstComputer } from "./computer-opponent-helpers.js";

// In the player's tournament fixture the other side is always the computer captain, as in a career match or a
// scenario. The worker reports the stored run and fixture the match belongs to, so the lock holds after a reload,
// even when this tab's remembered opponent setting is gone.
test("a tournament fixture locks the opposition to the computer captain, before and after a reload", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#tournaments");
  const league = page.getByTestId("tournament-northern-t20-league");
  await expect(league).toBeVisible({ timeout: 30_000 });
  await league.getByLabel("Your team").selectOption("team-01");
  await league.getByRole("button", { name: "Start Northern T20 League" }).click();
  const run = page.getByTestId("tournament-run");
  await expect(run).toContainText("You manage Aster Harbour.");
  await run.getByRole("button", { name: "Play this match yourself" }).click();

  await expect(page).toHaveURL(/#exhibition$/);
  await expect(page.getByTestId("tournament-banner")).toBeVisible({ timeout: 60_000 });
  await expectTournamentOpponentLocked(page, "team-08");

  // Play a few steps: the player's decisions are clicked, the computer captain makes its own.
  const decision = page.locator("#decision");
  for (let step = 0; step < 4; step += 1) await playOneAgainstComputer(page);
  const before = Number(await decision.getAttribute("data-revision"));
  expect(before).toBeGreaterThan(0);

  // Reload without this tab's remembered opponent: the page learns the fixture again from the worker.
  await page.evaluate(() => sessionStorage.removeItem("lcxxvi-optional-ai-team"));
  await page.reload();
  await expect(page.getByTestId("tournament-banner")).toBeVisible({ timeout: 60_000 });
  await expect(decision).toHaveAttribute("data-revision", String(before), { timeout: 60_000 });
  await expectTournamentOpponentLocked(page, "team-08");
  for (let step = 0; step < 2; step += 1) await playOneAgainstComputer(page);
  expect(Number(await decision.getAttribute("data-revision"))).toBeGreaterThan(before);
  await expectTournamentOpponentLocked(page, "team-08");
  expect(pageErrors).toEqual([]);
});
