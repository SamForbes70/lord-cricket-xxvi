import { expect, test } from "@playwright/test";

test("ODI tactical captain and field delegation execute and persist across reload", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format").selectOption("ODI");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");

  // Opponent captain control is available in ODI
  const aiSelect = page.locator("#ai-opponent-select");
  await expect(aiSelect).toBeVisible();
  const opponentOption = await aiSelect.locator("option").nth(2).getAttribute("value");
  await aiSelect.selectOption(opponentOption!);

  // Delegate field, bowlers, batters, innings and finally toss so AI_STEP advances once all categories are set
  await page.getByText("Delegate individual decisions").click();
  for (const label of ["Field placement", "Bowler selection", "Batter selection", "Bat or bowl", "Toss call"]) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await page.getByLabel(label).click();
    await expect(page.getByLabel(label)).toBeChecked({ timeout: 30_000 });
  }

  // Tactical captains drive both sides automatically to READY
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "READY", { timeout: 30_000 });
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Finish over", exact: true }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "READY", { timeout: 30_000 });

  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByText("Delegate individual decisions").click();
  await expect(page.getByLabel("Field placement")).toBeChecked();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Red-ball tactical profile, delegation and deterministic weather delay persist across reload and portable archive", async ({ page, browser }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format").selectOption("RED_BALL");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");

  const aiSelect = page.locator("#ai-opponent-select");
  const opponentOption = await aiSelect.locator("option").nth(2).getAttribute("value");
  await aiSelect.selectOption(opponentOption!);

  await page.getByText("Delegate individual decisions").click();
  await expect(page.getByLabel("Red-ball tactical profile")).toHaveValue("BALANCED");
  await page.getByLabel("Red-ball tactical profile").selectOption("AGGRESSIVE");
  await expect(page.getByTestId("redball-profile-posture")).toContainText("Pushes for a result:");

  for (const label of ["Declaration", "New ball", "Bowler selection", "Batter selection", "Bat or bowl", "Toss call"]) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await page.getByLabel(label).click();
    await expect(page.getByLabel(label)).toBeChecked({ timeout: 30_000 });
  }

  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "READY", { timeout: 30_000 });
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");

  // Verify uncertain forecast and safe-boundary weather check before explicit rain delay
  await page.getByText("Red-ball pitch wear and weather controls").click();
  await expect(page.getByTestId("redball-uncertain-forecast")).toContainText("Uncertain Day 1 forecast:");
  const boundaryWeatherBtn = page.getByRole("button", { name: "Check weather at boundary" });
  await expect(boundaryWeatherBtn).toBeEnabled();
  await boundaryWeatherBtn.click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByRole("button", { name: "Rain delay (60m)" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.getByTestId("redball-conditions-summary")).toContainText("Weather delay today: 60 min");
  await expect(page.locator("section.commentary")).toContainText("60 minutes");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Reload preserves tactical profile, delegation and weather delay
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByText("Delegate individual decisions").click();
  await expect(page.getByLabel("Red-ball tactical profile")).toHaveValue("AGGRESSIVE");
  await expect(page.getByLabel("Declaration")).toBeChecked();
  await page.getByText("Red-ball pitch wear and weather controls").click();
  await expect(page.getByTestId("redball-conditions-summary")).toContainText("Weather delay today: 60 min");

  // Portable archive preserves Red-ball tactical profile and weather delay
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const archive = await (await download).path();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto("/#exhibition");
    await expect(imported.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(archive!);
    await expect(imported.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await imported.getByText("Delegate individual decisions").click();
    await expect(imported.getByLabel("Red-ball tactical profile")).toHaveValue("AGGRESSIVE");
    await expect(imported.getByLabel("Declaration")).toBeChecked();
    await imported.getByText("Red-ball pitch wear and weather controls").click();
    await expect(imported.getByTestId("redball-conditions-summary")).toContainText("Weather delay today: 60 min");
    await expect(imported.getByRole("alert")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
