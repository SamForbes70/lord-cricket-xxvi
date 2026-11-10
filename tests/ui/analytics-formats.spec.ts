import { expect, test } from "@playwright/test";

for (const format of ["ODI", "RED_BALL"]) test(`${format} completed match exposes reconciled event analytics`, async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(2000);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_FOLLOW_ON" ? page.getByRole("button", { name: "Enforce follow-on" })
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over", exact: true });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const analytics = page.getByRole("region", { name: "Event-derived match analytics" });
  await expect(analytics).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Fall of wickets" })).toBeVisible();
  await expect(analytics.getByRole("group", { name: "Over-by-over runs" })).toBeVisible();
  await page.getByRole("button", { name: "Verify replay and scorecard" }).click();
  await expect(page.getByTestId("verification")).toBeVisible({ timeout: 60_000 });
});
