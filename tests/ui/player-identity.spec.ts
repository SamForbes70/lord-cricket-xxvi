import { expect, test } from "@playwright/test";

/** E6: the squad list shows what players are known for and their form, and no internal ids. */
test("the squad list shows tags and form without player ids", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const table = page.locator("section[aria-labelledby='squad-heading'] table").first();
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator("thead th", { hasText: /^Form$/ })).toBeVisible();

  // No internal player id is shown anywhere in the squad list.
  await expect(table).not.toContainText(/\bp\d{3}\b/);
  // At least one player carries a tag, and nobody carries more than two.
  const tagged = table.locator(".identity-tag");
  expect(await tagged.count()).toBeGreaterThan(0);
  const perPlayer = await table.locator("[data-testid^='player-tags-']").evaluateAll((cells) => cells.map((cell) => cell.querySelectorAll(".identity-tag").length));
  expect(Math.max(...perPlayer)).toBeLessThanOrEqual(2);
  // Before a match, nobody has form.
  await expect(table.locator("[data-testid^='player-form-']").first()).toHaveText("No innings or spell yet");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByTestId("match-report")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  // After one match, the players who batted or bowled show a score or figures (not every member of the XI does either).
  const forms = await table.locator("[data-testid^='player-form-']").allTextContents();
  expect(forms.filter((text) => /^\s*\d+\*?$|^\s*\d+\/\d+$/.test(text)).length).toBeGreaterThanOrEqual(6);
});
