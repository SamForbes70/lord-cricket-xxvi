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

// Pavilion P03a: a quick match is the player's side against the computer captain, not a hot seat for both XIs.
test("a quick match gives the second side to the computer captain, which the player can change", async ({ page }) => {
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  const opponent = page.locator("#ai-opponent-select");
  await expect(opponent.locator("option:checked")).toHaveText(/ controlled by AI$/);
  const aiName = (await opponent.locator("option:checked").innerText()).replace(/ controlled by AI$/, "");
  const names = await opponent.locator("option").allInnerTexts();
  const playerName = names.map((t) => t.replace(/ controlled by AI$/, "")).find((t) => t !== aiName && !t.startsWith("Manual"))!;
  // The toss is the player's call.
  await expect(decision).toContainText(`${playerName}: call the toss`, { ignoreCase: true });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(decision).not.toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  // Whoever wins the toss makes the bat-or-bowl choice: the player if they won it, otherwise the computer.
  // The "Bat first" button shows for whichever side won, even for a moment while the computer decides, so read the
  // toss heading rather than the button (seen on hosted Windows CI, run 45344271062).
  const tossHeading = (await decision.getByRole("heading", { level: 2 }).textContent()) ?? "";
  if ((await decision.getAttribute("data-phase")) === "AWAITING_INNINGS" && tossHeading.toLowerCase().startsWith(`${playerName.toLowerCase()} won the toss`))
    await decision.getByRole("button", { name: "Bat first" }).click();
  await expect(decision).not.toHaveAttribute("data-phase", /^(TOSS|AWAITING_INNINGS)$/, { timeout: 30_000 });
  // Every selection the player is offered is for the player's own side.
  let offered = 0;
  for (let n = 0; n < 40 && offered < 3; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    const phase = await decision.getAttribute("data-phase");
    const enabled = decision.locator("button[data-candidate]:enabled");
    if ((phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") && (await enabled.count()) > 0) {
      await expect(decision).toContainText(playerName, { ignoreCase: true });
      await expect(decision).not.toContainText(`${aiName}:`, { ignoreCase: true });
      offered += 1;
      await enabled.first().click();
    } else if (phase === "READY") {
      await decision.getByRole("button", { name: "Finish over", exact: true }).click();
    } else await page.waitForTimeout(200);
  }
  expect(offered).toBeGreaterThan(0);
  // The setting stays the player's to change.
  await opponent.selectOption("");
  await expect(opponent.locator("option:checked")).toHaveText("Manual decisions for both teams");
});
