import { expect, test, type Page } from "@playwright/test";

// Stage 12 (docs/ROADMAP_AND_AI_GUIDE.md): Scenario Challenges start part-way through an engine-played match, the
// opponent is the tactical captain, and the result is scored once into personal bests kept apart from any career.

async function playToEnd(page: Page) {
  const decision = page.locator("#decision");
  for (let steps = 0; (await decision.getAttribute("data-phase")) !== "COMPLETE"; steps += 1) {
    expect(steps).toBeLessThan(400);
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidate = page.locator("button[data-candidate]:enabled").first();
    const finishOver = page.getByRole("button", { name: "Finish over", exact: true });
    if ((phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") && (await candidate.count()) > 0) await candidate.click();
    else if (phase === "READY" && (await finishOver.isEnabled().catch(() => false))) await finishOver.click();
    // Otherwise the tactical captain is choosing for its own side; give it a moment.
    else await page.waitForTimeout(200);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
}

test("Stage 12 scenario challenge starts at its checkpoint, plays to a result and records a personal best", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#scenarios");
  const list = page.getByRole("list", { name: "Scenario challenges" });
  await expect(list.locator("> li")).toHaveCount(8, { timeout: 30_000 });
  await expect(page.getByTestId("scenario-record-t20-death-overs-chase")).toHaveText("Not attempted yet.");

  await page.getByRole("button", { name: "Play Death-overs chase" }).click();
  await expect(page).toHaveURL(/#exhibition$/);
  const banner = page.getByTestId("scenario-banner");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("scenario-objective")).toHaveText("Objective: Score 23 from the last 24 balls with 5 wickets in hand.");
  await expect(banner).toContainText("Northlight Ridge are 68 for 5 after 16 overs");
  // The player's opponent is the tactical captain.
  await expect(page.locator("#ai-opponent-select")).toHaveValue("team-06");
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "COMPLETE");

  await playToEnd(page);
  const outcome = page.getByTestId("scenario-outcome");
  await expect(outcome).toHaveText(/Challenge (completed|failed)\.$/, { timeout: 30_000 });
  const outcomeText = (await outcome.textContent())!;
  const completed = outcomeText.endsWith("Challenge completed.");

  // The result is durable: a reload shows the same scored outcome rather than scoring again.
  await page.reload();
  await expect(page.getByTestId("scenario-outcome")).toHaveText(outcomeText, { timeout: 60_000 });

  await page.getByRole("link", { name: "Back to scenarios" }).click();
  await expect(page.getByTestId("scenario-record-t20-death-overs-chase")).toContainText(
    `Attempts 1 · completed ${completed ? 1 : 0}`,
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("scenario-record-t20-death-overs-chase")).toContainText(completed ? "last: Completed" : "last: Failed");
  await expect(page.getByTestId("scenario-record-t20-tail-end-chase")).toHaveText("Not attempted yet.");
  expect(pageErrors).toEqual([]);
});

test("Stage 12 red-ball scenario starts in the fourth innings and replaces an open exhibition", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  // An ordinary exhibition is open first; the scenario replaces it on screen.
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });

  await page.goto("/#scenarios");
  await page.getByRole("button", { name: "Play Bowl them out" }).click();
  await expect(page.getByTestId("scenario-objective")).toHaveText("Objective: Take 7 wickets before Larchwood score 63.", { timeout: 90_000 });
  await expect(page.locator("#ai-opponent-select")).toHaveValue("team-07");
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "COMPLETE");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("scenario-outcome")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
