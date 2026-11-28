import { expect, test } from "@playwright/test";

/** E2: the board states an objective before the first fixture, and the standing against it moves with results. */
test("a new career shows the board's objective before round 1 and a standing after it", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const card = page.getByTestId("board-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("board-objective")).toHaveText(/Win the title|Finish in the top four|Finish sixth or better/);
  await expect(page.getByTestId("board-status")).toHaveText("Season ahead");
  await expect(card).toContainText("14 rounds to play.");
  await expect(card).toContainText(/The board rates this squad \d(st|nd|rd|th) of 8 on its best eleven\./);
  const objective = (await page.getByTestId("board-objective").textContent()) ?? "";

  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByTestId("match-report")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("board-status")).toHaveText(/Ahead|On track|Behind/);
  await expect(card).toContainText("13 rounds left");
  // The objective is fixed by squad strength, so one result does not move it.
  await expect(page.getByTestId("board-objective")).toHaveText(objective);
});
