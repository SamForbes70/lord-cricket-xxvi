import { expect, test } from "@playwright/test";

/** E4: under the scoreboard, the situation is stated in words, and a chase shows its equation. */
test("the situation strip states the innings state and then the chase equation", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /QUICK MATCH/i }).click();
  const decision = page.locator("#decision");
  const strip = page.getByTestId("situation-strip");
  await expect(decision.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
  await expect(strip).toHaveCount(0);

  // Take the first offered choice at each decision; "Finish innings" stops at every required decision.
  const step = async () => {
    const finish = decision.getByRole("button", { name: "Finish innings" });
    const target = (await finish.isEnabled().catch(() => false)) ? finish : decision.locator("button:not([disabled])").first();
    await target.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  };
  for (let n = 0; n < 12 && !(await strip.isVisible()); n += 1) await step();
  await expect(strip).toBeVisible();
  await expect(page.getByTestId("situation-headline")).toHaveText(/^\d+ balls? left, \d+ wickets? in hand\.$/);

  for (let n = 0; n < 80; n += 1) {
    if (/needed from/.test((await page.getByTestId("situation-headline").textContent().catch(() => "")) ?? "")) break;
    await step();
  }
  await expect(page.getByTestId("situation-headline")).toHaveText(/^\d+ needed from \d+ balls?, \d+ wickets? in hand\.$/);
  await expect(strip).toContainText(/Required rate \d+\.\d\d/);
  // The strip never claims a win chance.
  await expect(strip).not.toContainText(/%|probab|chance/i);
});
