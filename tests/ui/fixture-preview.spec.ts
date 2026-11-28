import { expect, test } from "@playwright/test";

/** E7: each fixture on Home carries a preview built from recorded results. The rivalry rule is covered by unit tests. */
test("the next fixture shows a preview that changes once results exist", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const preview = page.getByTestId("fixture-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fixture-meaning")).toHaveText("The season starts here.");
  await expect(page.getByTestId("fixture-head-to-head")).toContainText("First meeting on record.");
  await expect(page.getByTestId("fixture-danger")).toContainText(/their highest-rated batter \(\d+\)/);
  await expect(page.getByTestId("fixture-danger")).toContainText(/their highest-rated bowler \(\d+\)/);
  await expect(page.getByTestId("fixture-rival")).toHaveCount(0);
  await expect(preview).not.toContainText(/\bp\d{3}\b|team-\d+/);

  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByTestId("match-report")).toBeVisible({ timeout: 60_000 });
  // Round 2's preview is written from round 1's results.
  await expect(page.locator(".fixture-round")).toContainText("Round 2");
  await expect(page.getByTestId("fixture-meaning")).not.toHaveText("The season starts here.");
  await expect(preview).toContainText(/\d(st|nd|rd|th) on the table · Form [WLTN]/);
  await expect(page.getByTestId("fixture-danger")).toContainText(/\d+ runs this season/);
});
