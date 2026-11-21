import { expect, test } from "@playwright/test";

/** E1: after a managed fixture, Home opens on a match report built from the recorded scorecard. */
test("a simulated career match is followed by a match report that can be closed and reopened", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByTestId("match-report")).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate match" }).click();

  const report = page.getByTestId("match-report");
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(report).toContainText("ROUND 1");
  await expect(page.getByTestId("match-report-headline")).not.toBeEmpty();
  await expect(page.getByTestId("match-report-result")).toContainText(/won by \d+ (run|wicket)s?|Match tied|No result/);
  await expect(page.getByTestId("match-report-potm")).toContainText("Player of the match");
  await expect(page.getByTestId("match-report-table")).toContainText(/on the table after round 1/);
  // The report is the first panel on Home, ahead of the next fixture.
  expect(await page.locator(".dashboard-grid > article").first().getAttribute("data-testid")).toBe("match-report");
  // No internal identifiers leak into the report.
  await expect(report).not.toContainText(/\bp\d{3}\b|team-\d+|fixture-/);

  // The table line agrees with the league position card on the same page.
  const tableLine = await page.getByTestId("match-report-table").innerText();
  const rank = /(\d+)(?:st|nd|rd|th) on the table/.exec(tableLine)?.[1];
  await expect(page.locator(".dashboard-grid")).toContainText(`#${rank}`);

  await page.getByTestId("match-report-close").click();
  await expect(page.getByTestId("match-report")).toHaveCount(0);
  await expect(page.getByTestId("match-report-summary")).toContainText("ROUND 1");

  // Dismissal is remembered across a reload, and the report stays one click away.
  await page.reload();
  await expect(page.getByTestId("match-report-summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("match-report")).toHaveCount(0);
  await page.getByTestId("match-report-open").click();
  await expect(page.getByTestId("match-report-headline")).toBeVisible();
});
