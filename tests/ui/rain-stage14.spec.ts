import { expect, test, type Page } from "@playwright/test";

// Stage 14 rain-affected exhibitions (owner decisions A1a and A2a, 18 November 2026): opt-in, exhibitions only, seeded
// weather, revised targets from the fictional resource table.

/** Takes the player's decisions (always the first option) until a ball can be bowled. */
async function playToReady(page: Page) {
  const controls = page.getByTestId("rain-controls");
  for (let steps = 0; steps < 30; steps++) {
    await expect(controls).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    if (await controls.getByRole("button", { name: "Next ball" }).isVisible()) return;
    const heads = controls.getByRole("button", { name: "Heads" });
    const bat = controls.getByRole("button", { name: "Bat first" });
    const choice = controls.locator("button[data-rain-choice]").first();
    const accept = controls.getByRole("button", { name: "Accept the decision" });
    if (await heads.isVisible()) await heads.click();
    else if (await accept.isVisible()) await accept.click();
    else if (await bat.isVisible()) await bat.click();
    else if (await choice.isVisible()) await choice.click();
    else await page.waitForTimeout(200);
  }
  throw new Error("The match did not reach a ball.");
}

test("Stage 14 a rain-affected T20 is played, simulated to a result and reopened from storage", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#rain");
  await expect(page.getByRole("heading", { name: "Rain and player reviews" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No rain matches yet.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByRole("heading", { name: "T20 exhibition: rain" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("rain-stoppages")).toContainText("No rain yet.");

  await playToReady(page);
  await page.getByTestId("rain-controls").getByRole("button", { name: "Next ball" }).click();
  await expect(page.getByTestId("rain-last-ball")).toContainText(" to ", { timeout: 30_000 });
  await expect(page.getByTestId("rain-innings-0")).toContainText("of 20 overs");

  await page.getByRole("button", { name: "Simulate to the end" }).click();
  const result = page.getByTestId("rain-result");
  await expect(result).toHaveText(/won by|tied|No result/, { timeout: 120_000 });
  const text = (await result.textContent())!;
  await expect(page.getByTestId("rain-controls")).toHaveCount(0);

  // Stored apart from careers and tournaments: after a reload it reopens, replayed on the engine, with the same result.
  await page.reload();
  const saved = page.getByRole("list", { name: "Rain matches" });
  await expect(saved.locator("> li")).toHaveCount(1, { timeout: 30_000 });
  await saved.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("rain-result")).toHaveText(text, { timeout: 60_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

// Player reviews (owner decisions B1a to B5a): the player reviews an on-field decision and sees the reading afterwards.
test("Stage 14 player reviews: a reviewed decision shows the review outcome and the reviews left", async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/#rain");
  await expect(page.getByRole("heading", { name: "Rain and player reviews" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("checkbox", { name: "Rain", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Player reviews (DRS)" }).check();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByRole("heading", { name: "T20 exhibition: player reviews" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("rain-stoppages")).toHaveCount(0);
  await expect(page.getByTestId("reviews")).toContainText("No appeals yet.");

  // Play over by over, taking the player's decisions, until the player is offered a review; then review it.
  const controls = page.getByTestId("rain-controls");
  let reviewed = false;
  for (let steps = 0; steps < 400 && !reviewed; steps++) {
    await expect(controls).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    if ((await page.getByTestId("rain-result").count()) > 0) break;
    const review = controls.getByRole("button", { name: "Review", exact: true });
    if (await review.isVisible()) {
      await expect(page.getByTestId("review-prompt")).toContainText(/Appeal for (leg before|caught behind) against .+: given (OUT|NOT OUT)\./);
      await review.click();
      reviewed = true;
      break;
    }
    const heads = controls.getByRole("button", { name: "Heads" });
    const bat = controls.getByRole("button", { name: "Bat first" });
    const choice = controls.locator("button[data-rain-choice]").first();
    const over = controls.getByRole("button", { name: "Finish over" });
    if (await heads.isVisible()) await heads.click();
    else if (await bat.isVisible()) await bat.click();
    else if (await choice.isVisible()) await choice.click();
    else if (await over.isVisible()) await over.click();
    else await page.waitForTimeout(200);
  }
  expect(reviewed).toBe(true);
  await expect(page.getByTestId("reviews-log")).toContainText(/reviewed( and the decision was overturned| and lost the review|: umpire's call)/, { timeout: 30_000 });
  await expect(page.getByTestId("reviews-left")).toContainText("Reviews left this innings:");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
