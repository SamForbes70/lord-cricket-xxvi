import { expect, test } from "@playwright/test";

// Stage 11 (docs/ROADMAP_AND_AI_GUIDE.md): the Career Stories & Club Digest panel shows factual stories derived
// from committed career data, with a category filter and a detail setting.
test("Stage 11 career stories show a mid-season board review, filter by category and switch detail", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });

  // Before any match there are no stories.
  await page.getByRole("button", { name: "Career", exact: true }).click();
  await expect(page.getByTestId("career-stories")).toContainText("No stories yet");
  await page.getByRole("button", { name: "Home", exact: true }).click();

  // Play seven rounds: the board reviews the club after round 7.
  for (let round = 1; round <= 7; round += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) {
      await advance.click();
      await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
    }
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  }

  await page.getByRole("button", { name: "Career", exact: true }).click();
  const panel = page.getByTestId("career-stories");
  await expect(panel.locator('li[data-category="CLUB_BOARD_REVIEW"]')).toHaveCount(1);
  await expect(panel.locator('li[data-category="CLUB_BOARD_REVIEW"]')).toContainText("After round 7 of season 1");

  // Filter to board reviews only.
  await panel.getByLabel("Show").selectOption("CLUB_BOARD_REVIEW");
  const items = panel.locator("li");
  const count = await items.count();
  for (let i = 0; i < count; i += 1) await expect(items.nth(i)).toHaveAttribute("data-category", "CLUB_BOARD_REVIEW");

  // Headlines only hides the text; Off hides the stories and survives a reload.
  await panel.getByLabel("Detail").selectOption("CONCISE");
  await expect(panel).not.toContainText("After round 7 of season 1");
  await panel.getByLabel("Detail").selectOption("OFF");
  await expect(panel).toContainText("Stories are switched off.");
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Career", exact: true }).click();
  await expect(page.getByTestId("career-stories")).toContainText("Stories are switched off.");

  expect(pageErrors).toEqual([]);
});
