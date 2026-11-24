import { expect, test } from "@playwright/test";

/** Project Pavilion B9: the opposition watch says what the other side has done in this match and what it has left. */
test("the opposition watch reports their bowling or batting from this match, in the tactics group", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  const watch = page.getByTestId("opposition-watch");
  await expect(watch).toHaveCount(0);
  // Play a few overs, answering whatever is asked.
  let overs = 0;
  for (let n = 0; n < 80 && overs < 4; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    const candidates = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click();
    // "Bat first" can show for a moment while the computer makes its own choice, so a missed click is fine.
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidates.count()) > 0) await candidates.first().click();
    else if (await decision.getByRole("button", { name: "Finish over", exact: true }).isEnabled().catch(() => false)) { await decision.getByRole("button", { name: "Finish over", exact: true }).click(); overs += 1; }
    else await page.waitForTimeout(200);
  }
  await expect(watch).toBeVisible();
  const heading = (await watch.getByRole("heading", { level: 2 }).textContent())!;
  expect(heading).toMatch(/^Opposition: their (bowling|batting)$/);
  if (heading.endsWith("bowling")) {
    await expect(watch).toContainText(/Overs left: /);
    await expect(watch.getByTestId("opposition-headline")).toHaveText(/^(Most dangerous today: .+, \d+(\.\d)?-\d+-\d+-\d+, \d+ overs? left\.|No wickets for their bowlers yet\.|.+ has bowled out .+)$/);
  } else {
    // With two batters in, the batters still to come are the wickets in hand less one (the partner at the crease).
    // The player's side is bowling, so the next step may be choosing a bowler: answer it first.
    for (let n = 0; n < 5 && (await decision.getAttribute("data-phase")) !== "READY"; n += 1) {
      const pick = decision.locator("button[data-candidate]:enabled");
      if ((await pick.count()) > 0) await pick.first().click();
      await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    }
    await expect(decision).toHaveAttribute("data-phase", "READY");
    const inHand = Number(/(\d+) wickets? in hand/.exec((await page.getByTestId("situation-headline").textContent())!)![1]);
    await expect(watch).toContainText(inHand - 1 === 0 ? "No batters left to come" : `${inHand - 1} batter${inHand - 1 === 1 ? "" : "s"} still to come`);
  }
  // It sits in the tactics group: the jump to Tactics brings it into view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("navigation", { name: "Match sections" }).getByRole("button", { name: "Tactics", exact: true }).click();
  await expect(watch).toBeInViewport({ timeout: 10_000 });
});
