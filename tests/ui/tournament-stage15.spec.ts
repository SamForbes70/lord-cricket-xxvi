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
  await expect(page.getByRole("table", { name: "Series table" }).locator("svg.team-crest")).toHaveCount(2);
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

// User-authored tournaments (owner decision 5a): a player makes a tournament, plays it, and shares it as a file.
test("Stage 15 a player makes a round robin, plays it to a winner, and saves it to a file", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/#tournaments");
  const list = page.getByRole("list", { name: "Tournaments" });
  await expect(list.locator("> li")).toHaveCount(4, { timeout: 30_000 });

  const form = page.getByRole("region", { name: "Make your own tournament" });
  // A clear message for a choice that cannot work.
  await form.getByRole("button", { name: "Make tournament" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the tournament a name.");
  await form.getByLabel("Name").fill("Harbour Three");
  for (const team of ["Aster Harbour", "Copper Vale", "Northlight Ridge"]) await form.getByRole("checkbox", { name: team }).check();
  await form.getByRole("group", { name: "Grounds" }).getByRole("checkbox").first().check();
  await form.getByRole("button", { name: "Make tournament" }).click();
  await expect(page.getByRole("status")).toHaveText("Harbour Three is ready to start.");
  await expect(list.locator("> li")).toHaveCount(5);
  const card = list.locator("> li").last();
  await expect(card).toContainText("made by you");
  await expect(card).toContainText("A T20 round robin for 3 teams.");

  // Saving to a file downloads a pack.
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Save Harbour Three to a file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^user-[0-9a-f]+\.json$/);

  await card.getByRole("button", { name: "Start Harbour Three", exact: true }).click();
  const run = page.getByTestId("tournament-run");
  await expect(run).toBeVisible({ timeout: 30_000 });
  await run.getByRole("button", { name: "Play all remaining" }).click();
  await expect(page.getByTestId("tournament-champion")).toBeVisible({ timeout: 120_000 });

  // Stored: after a reload the tournament is still there, and it cannot be deleted while it has a run.
  await page.reload();
  const again = page.getByRole("list", { name: "Tournaments" }).locator("> li").last();
  await expect(again).toContainText("Harbour Three", { timeout: 30_000 });
  await expect(again.getByRole("button", { name: "Delete Harbour Three" })).toBeDisabled();

  // Loading the same file again skips the tournament the player already has.
  await page.getByLabel("Load a tournament file").setInputFiles(await file.path());
  await expect(page.getByRole("status")).toHaveText("Loaded 0 tournaments; skipped 1 you already have.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

// Tours (owner decisions A1a and A2a): a touring XI from the other seven clubs plays a series against a host.
test("Stage 15 a tour is arranged, simulated to a series result, and kept after a reload", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/#tournaments");
  const list = page.getByRole("list", { name: "Tournaments" });
  await expect(list.locator("> li")).toHaveCount(4, { timeout: 30_000 });
  const form = page.getByRole("region", { name: "Arrange a tour" });
  await form.getByRole("button", { name: "Arrange tour" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the tour a name.");
  await form.getByLabel("Tour name").fill("Ridge Tour");
  await form.getByLabel("Host").selectOption({ label: "Northlight Ridge" });
  await form.getByRole("group", { name: "Tour grounds" }).getByRole("checkbox").first().check();
  await form.getByRole("button", { name: "Arrange tour" }).click();
  await expect(page.getByRole("status")).toHaveText("Ridge Tour is ready to start.");
  const card = list.locator("> li").last();
  await expect(card).toContainText("a tour you arranged");
  await expect(card).toContainText("Invitation XI, picked from the other seven clubs");
  // A tour is simulated: there is no team to manage.
  await expect(card.getByLabel("Your team")).toHaveCount(0);
  await card.getByRole("button", { name: "Start Ridge Tour" }).click();
  const run = page.getByTestId("tournament-run");
  await expect(run).toBeVisible({ timeout: 30_000 });
  await run.getByRole("button", { name: "Play all remaining" }).click();
  await expect(page.getByTestId("tournament-champion")).toHaveText(/(Northlight Ridge|Invitation XI) win the Ridge Tour\. Series [23]-[01]\.|drawn/, { timeout: 120_000 });
  await expect(page.getByTestId("tournament-fixtures")).toContainText("Invitation XI");
  await page.reload();
  const again = page.getByRole("list", { name: "Tournaments" }).locator("> li").last();
  await expect(again).toContainText("Ridge Tour", { timeout: 30_000 });
  await expect(again.getByRole("button", { name: "Delete Ridge Tour" })).toBeDisabled();
  await again.getByRole("button", { name: /Open run 1 \(finished\)/ }).click();
  await expect(page.getByTestId("tournament-fixtures")).toContainText("Invitation XI");
  expect(pageErrors).toEqual([]);
});

// Auctions (owner decisions B1a, B2b, B3a, B4a): squads rebuilt by auction before a player's own tournament starts.
test("Stage 15 a player's tournament starts after an auction, with the player bidding for one team", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/#tournaments");
  const list = page.getByRole("list", { name: "Tournaments" });
  await expect(list.locator("> li")).toHaveCount(4, { timeout: 30_000 });
  const form = page.getByRole("region", { name: "Make your own tournament" });
  await form.getByLabel("Name").fill("Auction Three");
  for (const team of ["Aster Harbour", "Copper Vale", "Northlight Ridge"]) await form.getByRole("checkbox", { name: team }).check();
  await form.getByRole("group", { name: "Grounds" }).getByRole("checkbox").first().check();
  await form.getByRole("button", { name: "Make tournament" }).click();
  await expect(page.getByRole("status")).toHaveText("Auction Three is ready to start.");
  const card = list.locator("> li").last();
  await card.getByLabel("Your team").selectOption({ label: "Copper Vale" });
  await card.getByRole("button", { name: "Start Auction Three with an auction" }).click();

  const auction = page.getByTestId("auction");
  await expect(auction).toBeVisible();
  await expect(page.getByTestId("auction-yours")).toContainText("You bid for Copper Vale: 100 credits left, 13 places to fill.");
  // An over-budget bid is refused with a plain message.
  await auction.getByLabel("Your maximum bid").fill("500");
  await auction.getByRole("button", { name: "Bid", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("more than you can spend");
  // Bid on the first player, pass on the next, then hand over to the AI.
  await auction.getByLabel("Your maximum bid").fill("20");
  await auction.getByRole("button", { name: "Bid", exact: true }).click();
  await expect(auction.getByRole("list", { name: "Latest lots" })).toContainText("Copper Vale for");
  await auction.getByRole("button", { name: "Pass" }).click();
  await auction.getByRole("button", { name: "Let the AI bid for me" }).click();
  await expect(page.getByTestId("auction-squad-team-02")).toBeVisible();
  await auction.getByRole("button", { name: "Start Auction Three with these squads" }).click();

  const run = page.getByTestId("tournament-run");
  await expect(run).toContainText("Squads were rebuilt by auction");
  await run.getByRole("button", { name: "Play all remaining" }).click();
  await expect(page.getByTestId("tournament-champion")).toBeVisible({ timeout: 120_000 });
  // Stored with its auction: after a reload the run reopens and is still marked as auctioned.
  await page.reload();
  await page.getByRole("list", { name: "Tournaments" }).locator("> li").last().getByRole("button", { name: /Open run 1 \(finished\)/ }).click();
  await expect(page.getByTestId("tournament-run")).toContainText("Squads were rebuilt by auction");
  expect(pageErrors).toEqual([]);
});
