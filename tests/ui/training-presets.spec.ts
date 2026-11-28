import { expect, test } from "@playwright/test";

/** E10: one squad preset sets every player's training; a per-player change is kept as an override across reload. */
test("a training preset changes the whole squad and an override survives reload", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const selects = page.locator('select[id^="training-"]');
  await expect(selects.first()).toBeVisible({ timeout: 30_000 });
  const count = await selects.count();
  expect(count).toBeGreaterThanOrEqual(18);

  await page.getByTestId("training-preset-BATTING_WEEK").click();
  await expect(page.getByTestId("training-preset-current")).toHaveText("Current plan: Batting week.", { timeout: 120_000 });
  for (let index = 0; index < count; index += 1) await expect(selects.nth(index)).toHaveValue("BATTING_PRACTICE");
  await expect(page.getByTestId("training-preset-BATTING_WEEK")).toBeDisabled();

  await selects.first().selectOption("REST");
  await expect(page.getByTestId("training-preset-current")).toHaveText("Current plan: your own mix.", { timeout: 30_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });

  await page.reload();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(selects.first()).toHaveValue("REST", { timeout: 60_000 });
  await expect(selects.nth(1)).toHaveValue("BATTING_PRACTICE");
  await expect(page.getByTestId("training-preset-current")).toHaveText("Current plan: your own mix.");
});
