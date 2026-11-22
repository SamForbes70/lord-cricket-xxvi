import { expect, test } from "@playwright/test";

/** E8: five places in the club, and the other game modes in their own navigation region. */
test("club screens and other game modes are separate navigation regions, in keyboard order", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  const modes = page.getByRole("navigation", { name: "Other ways to play" });
  await expect(club).toBeVisible({ timeout: 30_000 });
  await expect(modes).toBeVisible();

  // The club row holds the club's five places.
  expect((await club.locator("button, a").allTextContents()).map((text) => text.trim())).toEqual(
    ["Clubhouse", "Squad", "Office", "Season", "Settings"]);
  await expect(club.getByRole("button", { name: "Clubhouse" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("career-nav-sections")).toHaveCount(0);

  // Season holds three screens; every screen reachable before is still reachable.
  await club.getByRole("button", { name: "Season" }).click();
  const sections = page.getByRole("navigation", { name: "Season sections" });
  expect((await sections.locator("button").allTextContents()).map((text) => text.trim())).toEqual(["Fixtures", "Statistics", "Stories"]);
  await expect(sections.getByRole("button", { name: "Fixtures" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Fixtures", level: 2 })).toBeVisible();
  await sections.getByRole("button", { name: "Statistics" }).click();
  await expect(page.getByRole("heading", { name: /Statistics/, level: 2 }).first()).toBeVisible();
  await sections.getByRole("button", { name: "Stories" }).click();
  await expect(page.getByText("Career stories").first()).toBeVisible();
  await club.getByRole("button", { name: "Office" }).click();
  await expect(page.getByTestId("career-nav-sections")).toHaveCount(0);
  await expect(club.getByRole("button", { name: "Office" })).toHaveAttribute("aria-current", "page");
  await club.getByRole("button", { name: "Clubhouse" }).click();
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
