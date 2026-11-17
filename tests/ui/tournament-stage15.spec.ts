import { expect, test } from "@playwright/test";

// Stage 15 first slice (owner decision 17 November 2026, answer 5a): fictional tournaments played on the engines.
test("Stage 15 a one-day series plays match by match to a result that survives a reload", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#tournaments");
  const list = page.getByRole("list", { name: "Tournaments" });
  await expect(list.locator("> li")).toHaveCount(4, { timeout: 30_000 });
  await page.getByRole("button", { name: "Start Larchwood v Westmere one-day series" }).click();
  const run = page.getByTestId("tournament-run");
  await expect(run).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tournament-next")).toContainText("Next: match 1, Series, Larchwood v Westmere Isles");

  // One match at a time, then the rest.
  await run.getByRole("button", { name: "Play next match" }).click();
  await expect(page.getByTestId("tournament-fixtures").locator("li").first()).not.toContainText("Not played yet.", { timeout: 60_000 });
  await expect(page.getByTestId("tournament-next")).toContainText("Next: match 2");
  await run.getByRole("button", { name: "Play all remaining" }).click();
  const champion = page.getByTestId("tournament-champion");
  await expect(champion).toHaveText(/(win the Larchwood v Westmere one-day series\. Series 3-[0-2]\.|Series drawn)/, { timeout: 120_000 });
  const text = (await champion.textContent())!;
  await expect(run.getByRole("button", { name: "Play next match" })).toHaveCount(0);

  // Stored: after a reload the finished run reopens with the same result.
  await page.reload();
  await page.getByRole("button", { name: /Open run 1 \(finished\)/ }).click();
  await expect(page.getByTestId("tournament-champion")).toHaveText(text);
  await expect(page.getByRole("table", { name: "Series table" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// Owner decision 10a: the player picks a team and plays its tournament matches on the match screen.
test("Stage 15 the player's own tournament match is played on the match screen and recorded", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#tournaments");
  const league = page.getByTestId("tournament-northern-t20-league");
  await expect(league).toBeVisible({ timeout: 30_000 });
  await league.getByLabel("Your team").selectOption("team-01");
  await league.getByRole("button", { name: "Start Northern T20 League" }).click();
  const run = page.getByTestId("tournament-run");
  await expect(run).toContainText("You manage Aster Harbour.");
  await expect(page.getByTestId("tournament-next")).toContainText("Aster Harbour");
  await run.getByRole("button", { name: "Play this match yourself" }).click();

  await expect(page).toHaveURL(/#exhibition$/);
  await expect(page.getByTestId("tournament-banner")).toBeVisible({ timeout: 60_000 });
  // The tactical captain plays the other side.
  await expect(page.locator("#ai-opponent-select")).toHaveValue("team-08");
  const decision = page.locator("#decision");
  for (let steps = 0; (await decision.getAttribute("data-phase")) !== "COMPLETE"; steps += 1) {
    expect(steps).toBeLessThan(300);
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidate = page.locator("button[data-candidate]:enabled").first();
    const bat = page.getByRole("button", { name: "Bat first" });
    const heads = page.getByRole("button", { name: "Call heads" });
    const finish = page.getByRole("button", { name: "Finish match", exact: true });
    if (phase === "TOSS" && (await heads.isEnabled().catch(() => false))) await heads.click();
    else if (phase === "AWAITING_INNINGS" && (await bat.isEnabled().catch(() => false))) await bat.click();
    else if ((phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") && (await candidate.count()) > 0) await candidate.click();
    else if (phase === "READY" && (await finish.isEnabled().catch(() => false))) await finish.click();
    else await page.waitForTimeout(200);
  }
  // A tied league match is simply a tie; no super over is needed to record it.
  await page.getByRole("link", { name: "Back to Tournaments" }).click();
  await page.getByRole("button", { name: /Open run 1/ }).click();
  const fixtures = page.getByTestId("tournament-fixtures").locator("li");
  await expect(fixtures.first()).not.toContainText("Not played yet.", { timeout: 30_000 });
  await expect(fixtures.first()).toContainText("Aster Harbour");
  // The other fixture of the round is simulated; the player's next match stops the run again.
  await run.getByRole("button", { name: "Play until your next match" }).click();
  await expect(run.getByRole("button", { name: "Play this match yourself" })).toBeVisible({ timeout: 60_000 });
  expect(pageErrors).toEqual([]);
});
