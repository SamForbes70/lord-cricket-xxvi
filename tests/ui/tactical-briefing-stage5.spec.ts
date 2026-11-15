import { expect, test } from "@playwright/test";

test("Stage 5 pre-match briefing, plain-language trade-offs, legal presets, and spell outcome feedback work end-to-end", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });

  // 1. Pre-match briefing is visible by default on setup and can be optionally hidden/persisted
  const setupBriefing = page.getByTestId("prematch-briefing-panel");
  await expect(setupBriefing).toBeVisible();
  await setupBriefing.locator("> summary").click();
  await expect(setupBriefing).toContainText("Seam ");
  await expect(setupBriefing).toContainText("Spin ");
  await expect(setupBriefing).toContainText("squad readiness & opponent scouting");

  await page.getByLabel("Tactical briefings").selectOption("hidden");
  await expect(setupBriefing).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Tactical briefings")).toHaveValue("hidden");
  await expect(setupBriefing).toHaveCount(0);

  await page.getByLabel("Tactical briefings").selectOption("shown");
  await expect(setupBriefing).toBeVisible();

  // 2. Start T20 match and step manually into READY phase
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByRole("button", { name: "Call heads" }).click();

  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Bat first" }).click();

  // Select opening batters (2x) and opening bowler (1x)
  for (let pick = 0; pick < 3; pick++) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
      timeout: 30_000,
    });
    await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
  }
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "READY", {
    timeout: 30_000,
  });
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");

  // 3. In-match tactical assistant shows phase, control trade-offs, and contextual legal presets
  const assistant = page.getByTestId("inmatch-tactical-assistant");
  await expect(assistant).toBeVisible();
  await expect(assistant).toContainText("Powerplay");

  const controlGuide = page.getByTestId("tactical-control-guide");
  await controlGuide.locator("summary").click();
  for (const controlId of [
    "BATTING_AGGRESSION",
    "BATTING_INTENT",
    "BOWLING_LENGTH",
    "BOWLING_LINE",
    "BOWLING_EFFORT",
    "BOWLING_VARIATION",
    "FIELD_PLACEMENT",
  ]) {
    await expect(page.getByTestId(`control-guide-${controlId}`)).toBeVisible();
  }

  const presets = page.getByTestId("tactical-presets");
  await presets.locator("summary").click();

  await page.getByTestId("apply-preset-BOWL_DISCIPLINED_CHANNEL").click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("apply-preset-BOWL_DISCIPLINED_CHANNEL")).toBeDisabled();
  await expect(page.getByTestId("apply-preset-BOWL_DISCIPLINED_CHANNEL")).toContainText(
    "Active: Disciplined off-stump channel",
  );

  await page.getByTestId("apply-preset-FIELD_BOUNDARY_PROTECT").click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("apply-preset-FIELD_BOUNDARY_PROTECT")).toBeDisabled();

  await page.getByTestId("apply-preset-BAT_ROTATE_STRIKE").click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("apply-preset-BAT_ROTATE_STRIKE")).toBeDisabled();

  // 4. Bowl one complete over and inspect factual spell & batting stint outcome reviews
  await page.getByRole("button", { name: "Finish over", exact: true }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });

  const spellSection = page.getByTestId("spell-outcome-reviews");
  await expect(spellSection).toContainText("GOOD · OFF · NORMAL");
  await expect(spellSection).toContainText("on intended length");

  const battingStints = page.getByTestId("batting-stint-reviews");
  await battingStints.locator("summary").click();
  await expect(battingStints).toContainText("Aggression 2/4 · ROTATE");

  // 5. Hiding tactical briefings does not mutate engine revision; reload preserves factual reviews
  const revBefore = await page.locator("#decision").getAttribute("data-revision");
  await page.getByLabel("Tactical briefings").selectOption("hidden");
  await expect(assistant).toHaveCount(0);
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revBefore!);

  await page.getByLabel("Tactical briefings").selectOption("shown");
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("spell-outcome-reviews")).toContainText(
    "GOOD · OFF · NORMAL",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Stage 5 career fixture briefing surfaces squad fatigue/readiness and respects Settings toggle", async ({
  page,
}) => {
  await page.goto("/#career");
  const firstTeamCard = page.locator("button.team-card").first();
  await expect(firstTeamCard).toBeEnabled({ timeout: 30_000 });
  await firstTeamCard.click();

  const careerBriefing = page.getByTestId("prematch-briefing-panel");
  await expect(careerBriefing).toBeVisible({ timeout: 30_000 });
  await careerBriefing.locator("> summary").click();
  await expect(careerBriefing).toContainText("squad readiness & opponent scouting");
  await careerBriefing.locator("details summary").first().click();
  await expect(careerBriefing).toContainText("Fresh");

  // Toggle off in Career Settings and confirm Home & Fixtures respect the preference
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByLabel("Show tactical briefings & assistant");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(careerBriefing).toHaveCount(0);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Fixtures", exact: true }).click();
  await expect(careerBriefing).toBeVisible();
});
