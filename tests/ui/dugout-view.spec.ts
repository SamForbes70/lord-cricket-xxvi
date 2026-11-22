import { expect, test } from "@playwright/test";

/**
 * E3: during an innings the score, the situation, the ball, the players and the decision fit one screen at
 * 1366 by 768, and each group of panels below is one click away. Panels are grouped and reachable, not hidden.
 */
test("the decision fits the first screen and the jump bar reaches each group of panels", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#title");
  await page.getByRole("button", { name: /QUICK MATCH/i }).click();
  const decision = page.locator("#decision");
  await expect(decision.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
  // Take the first offered choice until play is under way and the next step is a delivery.
  for (let n = 0; n < 20; n += 1) {
    if (await decision.getByRole("button", { name: "Next delivery" }).isEnabled().catch(() => false)) break;
    await decision.locator("button:not([disabled])").first().click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  await decision.getByRole("button", { name: "Next delivery" }).click();
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  // Match seeds vary, so that ball can be a wicket and leave a batter to choose (seen on hosted Windows CI, run
  // 45009992794). Answer any such question so the screen is measured in its usual state: the next ball is ready.
  for (let n = 0; n < 20; n += 1) {
    if (await decision.getByRole("button", { name: "Next delivery" }).isEnabled().catch(() => false)) break;
    await decision.locator("button:not([disabled])").first().click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  await expect(decision.getByRole("button", { name: "Next delivery" })).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));

  // Everything the captain needs for the next ball is inside the first screen.
  for (const zone of [page.getByTestId("scorestrip"), page.getByTestId("situation-strip"), page.getByRole("region", { name: "This ball" }), decision, page.getByTestId("dugout-jump")]) {
    const box = await zone.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  }

  // Each jump button moves focus to its group, and that group's first panel comes into view.
  const jump = page.getByRole("navigation", { name: "Match sections" });
  const groups: [button: string, anchor: string, panel: ReturnType<typeof page.locator>][] = [
    ["Tactics", "dugout-tactics", page.getByRole("heading", { name: "Tactics", exact: true })],
    ["Scorecard", "dugout-scorecard", page.getByRole("heading", { name: "Scorecard", exact: true })],
    ["Captain", "dugout-captain", page.getByRole("region", { name: "Opponent captain control" })],
    ["Tools", "dugout-tools", page.getByRole("region", { name: "Match diagnostic export" })],
  ];
  for (const [button, anchor, panel] of groups) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(panel).not.toBeInViewport();
    await jump.getByRole("button", { name: button, exact: true }).click();
    await expect(page.locator(`#${anchor}`)).toBeFocused();
    await expect(panel).toBeInViewport({ timeout: 10_000 });
  }

  // The existing skip link brings the captain back to the decision.
  await page.getByRole("link", { name: "Skip to next decision" }).focus();
  await page.keyboard.press("Enter");
  await expect(decision).toBeInViewport({ timeout: 10_000 });
  // The link must not change the route: the match is still on screen and focus is on the decision heading.
  expect(new URL(page.url()).hash).toBe("#exhibition");
  await expect(decision.getByRole("heading").first()).toBeFocused();
  await expect(decision.getByRole("button", { name: "Next delivery" })).toBeVisible();
});
