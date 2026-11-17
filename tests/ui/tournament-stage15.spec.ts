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
  expect(pageErrors).toEqual([]);
});
