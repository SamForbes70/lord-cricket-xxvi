import { expect, test } from "@playwright/test";

/** E5: recommended choices, plain-language copy, a pitch verdict, dates in words and a first-run sound question. */

test("batter and bowler questions mark the computer captain's choice, which the player can still override", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  await expect(page.getByTestId("scorestrip")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await page.getByRole("button", { name: "Bat first" }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "AWAITING_BATTER");
  // Exactly one recommendation, labelled in words beside a selectable candidate.
  const recommended = page.locator('button[data-candidate][data-recommended="true"]');
  await expect(recommended).toHaveCount(1);
  await expect(recommended).toBeEnabled();
  await expect(decision.getByText("Recommended", { exact: true })).toHaveCount(1);
  const id = await recommended.getAttribute("data-candidate");
  await expect(recommended).toHaveAttribute("aria-describedby", `recommended-${id}`);
  // Override: pick a different, selectable batter.
  await page.locator(`button[data-candidate]:enabled:not([data-candidate="${id}"])`).first().click();
  await expect(decision).not.toHaveAttribute("data-phase", "TOSS");
  // Plain copy: no model badge in the masthead, technical detail in the About panel.
  await expect(page.locator("header .alpha")).toHaveCount(0);
  const about = page.getByTestId("about-panel");
  await expect(about).toContainText("SYNTHETIC_ALPHA");
  await expect(about.locator("summary")).toHaveText("About this game");
});

test("every decision marks the computer captain's choice: bat or bowl, and the batting and bowling plans", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  await expect(page.getByTestId("scorestrip")).toBeVisible({ timeout: 60_000 });
  const decision = page.locator("#decision");
  // A coin call has no better side, so the toss says so instead of marking one.
  await expect(decision.getByText("A coin toss: neither call is better, so no choice is recommended.")).toBeVisible();
  await expect(decision.locator('[data-recommended="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(decision).toHaveAttribute("data-phase", "AWAITING_INNINGS");
  const marked = decision.locator('.actions button[data-recommended="true"]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText(/^(Bat|Bowl) first$/);
  const markedId = await marked.getAttribute("aria-describedby");
  await expect(decision.locator(`#${markedId}`)).toHaveText("Recommended");
  await marked.click();
  // Answer batter and bowler questions until the next ball is ready, then read the plan recommendations.
  for (let n = 0; n < 10; n += 1) {
    if (await decision.getByRole("button", { name: "Next delivery" }).isEnabled().catch(() => false)) break;
    await decision.locator("button[data-candidate]:enabled").first().click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }
  await expect(decision.getByRole("button", { name: "Next delivery" })).toBeEnabled();
  const tactics = page.locator(".tactics");
  await expect(tactics.getByTestId("recommended-aggression")).toHaveText(/^Recommended: (Defend|Cautious|Balanced|Positive|Attack)$/);
  await expect(tactics.getByTestId("recommended-bowling")).toHaveText(/^Recommended: (yorker|full|good|short) length, (conserve|normal|maximum) effort$/);
  await expect(tactics.getByLabel("Length").locator("option", { hasText: "(recommended)" })).toHaveCount(1);
  await expect(tactics.getByLabel("Effort", { exact: true }).locator("option", { hasText: "(recommended)" })).toHaveCount(1);
});

test("the pitch inspection gives a verdict in plain words", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  const verdict = page.getByRole("region", { name: "Pitch and conditions" }).getByTestId("pitch-verdict");
  await expect(verdict).toHaveText(/^An? (bowler's|seamer's|spinner's|batting|even) pitch\. .+/);
  await expect(verdict).toHaveAttribute("data-tendency", /^(LIVE_BOTH|SEAM_FRIENDLY|SPIN_FRIENDLY|FLAT|BALANCED)$/);
});

test("career dates read as words, such as Mon 1 March 2027", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Round 1 · Mon 1 March 2027", { timeout: 30_000 });
  await expect(page.getByTestId("career-masthead-subtitle")).not.toContainText("2027-03-01");
});

test("the title screen asks once whether to play with sound, and remembers the answer in this browser only", async ({ page }) => {
  await page.goto("/#title");
  const question = page.getByTestId("sound-question");
  await expect(question).toBeVisible();
  await expect(question.getByRole("heading", { name: "Play with sound?" })).toBeVisible();
  await question.getByRole("button", { name: "Turn sound on" }).click();
  await expect(question).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Sound:/ })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("lcxxvi-sound-asked"))).toBe("1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lcxxvi-audio-preferences") ?? "{}").muted)).toBe(false);
  await page.reload();
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByTestId("sound-question")).toHaveCount(0);
});

test("the sound question works by keyboard and at 150 percent text", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#title");
  await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  const keepOff = page.getByTestId("sound-question").getByRole("button", { name: "Keep sound off" });
  await keepOff.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sound-question")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Sound:/ })).toHaveAttribute("aria-pressed", "false");
});
