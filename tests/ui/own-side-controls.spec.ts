import { expect, test, type Page } from "@playwright/test";

/**
 * Own-side controls: in a match where the computer captain runs one side, the person sets batting aggression, the
 * bowling plan and the field only for the side they manage. The other side's controls are disabled and say why.
 * Before this, "Aggression for ..." was enabled for whichever side batted, so the person could set the computer
 * side's batter plan (the computer captain then set it back on the same ball). See docs/pavilion/OWN_SIDE_CONTROLS.md.
 */
const MANAGED = "Aster Harbour";

async function untilReady(page: Page) {
  const decision = page.locator("#decision");
  for (let n = 0; n < 60; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "READY") return;
    const candidate = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidate.count()) > 0) await candidate.first().click({ timeout: 2_000 }).catch(() => undefined);
    else await page.waitForTimeout(200);
  }
  throw new Error("The match did not reach a ball to bowl");
}

/** Checks the controls for the side batting now, given whether the person runs it. Returns true if the managed side bats. */
async function checkControls(page: Page, battingName: string, managedName: string) {
  const tactics = page.locator("section.tactics");
  await expect(tactics).toBeVisible();
  const aggression = tactics.locator("select[aria-label^='Aggression for']");
  await expect(aggression).toHaveCount(2);
  const effort = tactics.getByLabel("Effort", { exact: true });
  const fields = tactics.getByRole("combobox", { name: /^Field for / });
  if (battingName === managedName) {
    // The person's own batters: aggression is theirs. The computer captain runs the bowling plan and the field.
    for (const control of await aggression.all()) await expect(control).toBeEnabled();
    await expect(tactics.getByTestId("batting-owner-note")).toHaveCount(0);
    await expect(effort).toBeDisabled();
    await expect(tactics.getByRole("button", { name: "Apply bowling plan" })).toBeDisabled();
    await expect(tactics.getByRole("button", { name: "Apply named field" })).toBeDisabled();
    for (const control of await fields.all()) await expect(control).toBeDisabled();
    const note = tactics.getByTestId("bowling-owner-note");
    await expect(note).toHaveText(/^Set by the opposition captain: .+ sets its bowling plan and field\.$/);
    await expect(effort).toHaveAccessibleDescription(/Set by the opposition captain/);
    await expect(page.getByTestId("keyboard-field-controls")).toHaveCount(0);
    await expect(page.getByTestId("field-owner-note")).toHaveText(/Set by the opposition captain/);
    for (const preset of await page.locator("[data-testid^='apply-preset-BOWL_'], [data-testid^='apply-preset-FIELD_']").all())
      await expect(preset).toBeDisabled();
  } else {
    // The opposition's batters: their aggression is the computer captain's. The bowling plan and field are the person's.
    for (const control of await aggression.all()) {
      await expect(control).toBeDisabled();
      await expect(control).toHaveAccessibleDescription(/Set by the opposition captain/);
    }
    await expect(tactics.getByTestId("batting-owner-note")).toHaveText(/^Set by the opposition captain: .+ chooses its batters' aggression\.$/);
    await expect(tactics.getByTestId("recommended-aggression")).toHaveCount(0);
    await expect(effort).toBeEnabled();
    await expect(tactics.getByRole("button", { name: "Apply bowling plan" })).toBeEnabled();
    await expect(tactics.getByRole("button", { name: "Apply named field" })).toBeEnabled();
    await expect(tactics.getByTestId("bowling-owner-note")).toHaveCount(0);
    await expect(page.getByTestId("field-owner-note")).toHaveCount(0);
    for (const preset of await page.locator("[data-testid^='apply-preset-BAT_']").all()) await expect(preset).toBeDisabled();
  }
}

/** Plays both innings to their first ball and checks the controls in each, so both sides bat once. */
async function checkBothInnings(page: Page, managedName: string) {
  const decision = page.locator("#decision");
  const batting = page.getByTestId("scorestrip").locator("h2");
  const seen = new Set<string>();
  for (let innings = 0; innings < 2; innings += 1) {
    await untilReady(page);
    const name = (await batting.textContent())!.trim();
    await checkControls(page, name, managedName);
    seen.add(name === managedName ? "managed" : "opposition");
    if (innings === 0) {
      await decision.getByRole("button", { name: "Finish innings", exact: true }).click();
      await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
    }
  }
  expect([...seen].sort()).toEqual(["managed", "opposition"]);
}

test("a career match: the person sets plans only for the managed side, in both innings", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await checkBothInnings(page, MANAGED);
  expect(errors).toEqual([]);
});

test("an exhibition with a computer opponent follows the same rule; with no computer side both sides stay open", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  const ours = (await page.getByLabel("Your team", { exact: true }).locator("option:checked").textContent())!.trim();
  const theirs = await page.getByLabel("Opponent", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await page.locator("#ai-opponent-select").selectOption(theirs);
  await checkBothInnings(page, ours);

  // Manual control of both teams: every plan control is the person's, whichever side bats.
  await page.locator("#ai-opponent-select").selectOption("");
  await untilReady(page);
  const tactics = page.locator("section.tactics");
  for (const control of await tactics.locator("select[aria-label^='Aggression for']").all()) await expect(control).toBeEnabled();
  await expect(tactics.getByLabel("Effort", { exact: true })).toBeEnabled();
  await expect(tactics.getByTestId("batting-owner-note")).toHaveCount(0);
  await expect(tactics.getByTestId("bowling-owner-note")).toHaveCount(0);
});
