import { test, expect } from "@playwright/test";

test("optional tactical captain submits durable legal decisions and survives reload", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("heading", { name: /Take the captain/i })).toBeVisible();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  const control = page.getByLabel("Tactical captain");
  await expect(control).toBeVisible();
  const teams = await control.locator("option").all();
  expect(teams.length).toBeGreaterThanOrEqual(3);
  const aiTeam = await teams[1]!.getAttribute("value");
  expect(aiTeam).toBeTruthy();
  await control.selectOption(aiTeam!);
  // The selected team controls the toss: one AI command must be atomically saved.
  await expect(page.locator(".decision")).toHaveAttribute("data-revision", /[2-9]|[1-9][0-9]+/);
  await expect(page.getByTestId("save-status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Tactical captain")).toHaveValue(aiTeam!);
  await expect(page.locator(".decision")).toHaveAttribute("data-revision", /[2-9]|[1-9][0-9]+/);
  await page.getByLabel("Tactical captain").selectOption("");
  await expect(page.getByLabel("Tactical captain")).toHaveValue("");
});
