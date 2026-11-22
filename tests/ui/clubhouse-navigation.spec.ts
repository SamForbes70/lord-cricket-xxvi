import { expect, test } from "@playwright/test";

/** E8 (first step): the club's screens and the other game modes are separate navigation regions. */
test("club screens and other game modes are separate navigation regions, in keyboard order", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  const modes = page.getByRole("navigation", { name: "Other ways to play" });
  await expect(club).toBeVisible({ timeout: 30_000 });
  await expect(modes).toBeVisible();

  // The club row holds only the club's screens.
  expect((await club.locator("button, a").allTextContents()).map((text) => text.trim().toLowerCase())).toEqual(
    ["home", "career", "squad", "contracts", "fixtures", "statistics", "settings"]);
  // Everything that leaves the club is in the second row; nothing reachable before is lost.
  expect((await modes.locator("button, a").allTextContents()).map((text) => text.trim().toLowerCase())).toEqual(
    ["exhibition", "scenarios", "tournaments", "rain matches", "choose career"]);

  // Keyboard order follows the visual order: the club row first, then the modes row.
  await club.getByRole("button", { name: "Settings" }).focus();
  await page.keyboard.press("Tab");
  await expect(modes.getByRole("link", { name: "Exhibition" })).toBeFocused();

  // The links still work.
  await modes.getByRole("button", { name: "Choose career" }).click();
  await expect(page.getByRole("button", { name: /Aster Harbour/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(club).toHaveCount(0);
});
