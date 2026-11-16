import { expect, test } from "@playwright/test";

test("Stage 8 optional sound and narration supports gesture gating, mixer controls, provenance manifest, silent captions, 150% zoom, and Career Settings sync", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });

  const audioPanel = page.getByTestId("match-audio-panel");
  await expect(audioPanel).toBeVisible();
  const statusPill = page.getByTestId("audio-status-pill");
  // Sound is muted by default (owner decision, 16 Nov 2026); turning it on is the player's choice.
  await expect(statusPill).toHaveText("Muted (silent captions)");
  await expect(page.getByTestId("audio-caption-banner")).toContainText("Ready");
  await page.getByRole("button", { name: "Sound: Muted" }).click();
  await expect(statusPill).toHaveText(/Awaiting click\/key gesture|Audio active/);

  // Open mixer & provenance drawer (also unlocks audio from user gesture)
  await page.getByRole("button", { name: "Audio mixer & provenance" }).click();
  const drawer = page.getByTestId("audio-mixer-drawer");
  await expect(drawer).toBeVisible();
  await expect(statusPill).toHaveText(/Audio active|Silent caption fallback/);

  await expect(page.getByLabel("Crowd volume")).toBeVisible();
  await expect(page.getByLabel("Effects volume")).toBeVisible();
  await expect(page.getByLabel("Commentary narration volume")).toBeVisible();
  await expect(page.getByLabel("Interface volume")).toBeVisible();
  await expect(page.getByLabel("Mute all audio")).toBeVisible();
  await expect(page.getByLabel("Speech narration")).toBeVisible();
  await expect(page.getByLabel("Show audio captions")).toBeVisible();

  await drawer.locator("summary").click();
  await expect(drawer.locator("tbody tr")).toHaveCount(10);

  // Start T20 match and play Over 1 with sound active
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Bat first" }).click();

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

  // Advance Over 1 and verify audio caption updates
  for (let guard = 0; guard < 12; guard++) {
    if ((await page.getByTestId("match-commentary-panel").locator('li[data-category="OVER"]').count()) > 0) {
      break;
    }
    const phase = await page.locator("#decision").getAttribute("data-phase");
    if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") {
      await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
    } else {
      await page.getByRole("button", { name: "Finish over", exact: true }).click();
    }
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
      timeout: 30_000,
    });
  }
  await expect(page.getByTestId("audio-caption-banner")).not.toContainText("Ready — match audio captions");

  // Switch to full silent mode + 150% text scale, verify gameplay continues cleanly & zero horizontal overflow
  await page.getByRole("button", { name: "Sound: On" }).click();
  await expect(statusPill).toHaveText("Muted (silent captions)");
  await page.getByLabel("Text scale", { exact: true }).selectOption("150");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Advance another delivery/over in silent mode
  const phaseBefore = await page.locator("#decision").getAttribute("data-phase");
  if (phaseBefore === "AWAITING_BATTER" || phaseBefore === "AWAITING_BOWLER") {
    await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
  } else {
    await page.getByRole("button", { name: "Next ball", exact: true }).click();
  }
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.getByTestId("audio-caption-banner")).toBeVisible();

  // Enable Speech narration, reload page, and confirm preferences persist + sync to Career Settings
  await page.getByLabel("Speech narration").click();
  await expect(page.getByLabel("Speech narration")).toBeChecked();
  await page.reload();
  await expect(page.getByTestId("audio-status-pill")).toHaveText("Muted (silent captions)");
  await page.getByRole("button", { name: "Audio mixer & provenance" }).click();
  await expect(page.getByLabel("Mute all audio")).toBeChecked();
  await expect(page.getByLabel("Speech narration")).toBeChecked();

  await page.goto("/#career");
  const firstTeamCard = page.locator("button.team-card").first();
  await expect(firstTeamCard).toBeEnabled({ timeout: 30_000 });
  await firstTeamCard.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Match sound", { exact: true })).toHaveValue("muted");
  await expect(page.getByLabel("Spoken narration", { exact: true })).toHaveValue("on");
  await page.getByLabel("Match sound", { exact: true }).selectOption("on");
  await page.getByLabel("Spoken narration", { exact: true }).selectOption("off");

  await page.goto("/#exhibition");
  await expect(page.getByTestId("audio-status-pill")).toHaveText("Awaiting click/key gesture");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
