import { expect, test } from "@playwright/test";

// Owner order of 20 November 2026, step 2: a title screen, a one-click quick match and a guided first match.
test("the title screen starts a quick match in one click and the career from its menu", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/#title");
  await expect(page.getByRole("heading", { name: /Lord Cricket/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Game modes" }).getByRole("link")).toHaveCount(5);
  // One switch turns all game sound on; it is stored with the match audio preferences.
  const sound = page.getByRole("button", { name: /^Sound:/ });
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lcxxvi-audio-preferences") ?? "{}").muted)).toBe(false);
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /Quick match/ }).click();
  // The exhibition starts by itself with the suggested XIs: the toss is the first decision.
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(page.getByTestId("guided-coach")).toHaveCount(0);
  await page.goto("/#title");
  await page.getByRole("navigation", { name: "Game modes" }).getByRole("link", { name: /Career/ }).click();
  await expect(page).toHaveURL(/#career$/);
  expect(pageErrors).toEqual([]);
});

test("the guided first match explains each decision and can be ended", async ({ page }) => {
  await page.goto("/#title");
  await page.getByRole("button", { name: /Guided first match/ }).click();
  const coach = page.getByTestId("guided-coach");
  await expect(coach).toContainText("The toss", { timeout: 30_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(coach).not.toContainText("The toss");
  // It survives a reload until the player ends it.
  await page.reload();
  await expect(page.getByTestId("guided-coach")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "End the guide" }).click();
  await expect(page.getByTestId("guided-coach")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#decision")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("guided-coach")).toHaveCount(0);
});
