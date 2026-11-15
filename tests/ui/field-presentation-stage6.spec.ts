import { expect, test } from "@playwright/test";

test("Stage 6 live 2D cricket field, handedness orientation, keyboard legal-placement feedback, highlight pacing, reduced motion, and 150% zoom work end-to-end", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });

  // Start T20 exhibition match and step manually into READY phase
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

  // 1. Live 2D SVG cricket field, named positions, and RHB/LHB handedness orientation
  const fieldPanel = page.getByTestId("live-field-panel");
  await expect(fieldPanel).toBeVisible();
  const fieldSvg = page.getByTestId("live-field-svg");
  await expect(fieldSvg).toBeVisible();

  const strikerHand = await fieldPanel.getAttribute("data-striker-hand");
  expect(strikerHand === "R" || strikerHand === "L").toBe(true);
  if (strikerHand === "R") {
    await expect(page.getByTestId("field-left-side-label")).toHaveText("LEG SIDE");
    await expect(page.getByTestId("field-right-side-label")).toHaveText("OFF SIDE");
  } else {
    await expect(page.getByTestId("field-left-side-label")).toHaveText("OFF SIDE");
    await expect(page.getByTestId("field-right-side-label")).toHaveText("LEG SIDE");
  }

  for (const slotId of ["slip-1", "point", "cover", "mid-off", "mid-on", "long-on"]) {
    await expect(fieldSvg.locator(`g[data-slot-id="${slotId}"]`)).toBeVisible();
  }
  await expect(fieldSvg.locator('g[data-occupied="true"]')).toHaveCount(9);

  // 2. Live legal-placement feedback + keyboard-only field placement controls
  const legalityBox = page.getByTestId("field-legality-feedback");
  await expect(legalityBox).toHaveAttribute("data-legal", "true");
  await expect(legalityBox).toContainText("Powerplay");

  const kbControls = page.getByTestId("keyboard-field-controls");
  await expect(kbControls).toBeVisible();

  // Select an inside-circle fielder and move them directly onto an occupied deep or duplicate slot to trigger live legality blocking
  const fielderSelect = kbControls.getByLabel("Select fielder to reposition");
  const targetSelect = kbControls.getByLabel("Select target field position");

  // Pick the first fielder and assign directly to an already-occupied slot -> duplicate violation blocks Apply
  const options = await fielderSelect.locator("option").all();
  expect(options.length).toBe(9);
  const secondFielderText = (await options[1]!.textContent()) ?? "";
  const secondSlotLabel = secondFielderText.split("—")[1]?.trim() ?? "Point";

  await fielderSelect.selectOption({ index: 0 });
  const targetOptions = await targetSelect.locator("option").allTextContents();
  const occupiedTargetIdx = targetOptions.findIndex((txt) => txt.startsWith(`${secondSlotLabel} (`));
  expect(occupiedTargetIdx).toBeGreaterThanOrEqual(0);
  await targetSelect.selectOption({ index: occupiedTargetIdx });
  await kbControls.getByRole("button", { name: "Assign slot directly" }).click();

  await expect(legalityBox).toHaveAttribute("data-legal", "false");
  await expect(legalityBox).toContainText("Duplicate field position:");
  await expect(page.getByTestId("apply-diagram-field")).toBeDisabled();

  // Reset field edits restores legality
  await kbControls.getByRole("button", { name: "Reset field edits" }).click();
  await expect(legalityBox).toHaveAttribute("data-legal", "true");

  // Use keyboard Next open slot to move to a legal open circle slot (or swap two occupied slots) and apply
  await fielderSelect.selectOption({ index: 0 });
  await targetSelect.selectOption({ index: occupiedTargetIdx });
  await kbControls.getByRole("button", { name: "Move or swap fielder" }).click();
  await expect(legalityBox).toHaveAttribute("data-legal", "true");
  await expect(page.getByTestId("apply-diagram-field")).toBeEnabled();
  await page.getByTestId("apply-diagram-field").click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("apply-diagram-field")).toBeDisabled();

  // 3. Highlight pacing modes (EVERY_BALL, KEY_MOMENT, FAST), recent highlight chips, and non-tracking disclaimer
  await fieldPanel.getByLabel("Highlight pacing").selectOption("EVERY_BALL");
  await expect(fieldPanel).toHaveAttribute("data-highlight-mode", "EVERY_BALL");

  await page.getByRole("button", { name: "Finish over", exact: true }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });

  await expect(page.getByTestId("highlight-headline")).toBeVisible();
  await expect(page.getByTestId("live-field-highlight-card")).toContainText(
    "Illustrative highlight from committed event categories",
  );
  await expect(page.getByTestId("recent-highlights-strip")).toBeVisible();
  await expect(page.getByTestId("field-highlight-layer")).toBeVisible();

  // Switch to KEY_MOMENT and FAST modes
  await fieldPanel.getByLabel("Highlight pacing").selectOption("KEY_MOMENT");
  await expect(fieldPanel).toHaveAttribute("data-highlight-mode", "KEY_MOMENT");
  await fieldPanel.getByLabel("Highlight pacing").selectOption("FAST");
  await expect(fieldPanel).toHaveAttribute("data-highlight-mode", "FAST");
  await expect(fieldPanel).toHaveAttribute("data-highlight-playing", "false");

  // 4. Reduced-motion mode via OS media query and explicit preference
  await fieldPanel.getByLabel("Highlight pacing").selectOption("EVERY_BALL");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(fieldPanel).toHaveAttribute("data-reduced-motion", "true");
  await expect(fieldPanel).toHaveAttribute("data-highlight-playing", "false");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fieldPanel.getByLabel("Highlight motion").selectOption("REDUCED");
  await expect(fieldPanel).toHaveAttribute("data-reduced-motion", "true");

  // 5. Responsive 150% zoom equivalent (910x512 viewport) has zero horizontal document overflow
  await page.setViewportSize({ width: 910, height: 512 });
  await expect(fieldSvg).toBeVisible();
  const overflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowPx).toBeLessThanOrEqual(1);

  // 6. Career Settings syncs Highlight pacing & Highlight motion preferences
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#career");
  const firstTeamCard = page.locator("button.team-card").first();
  await expect(firstTeamCard).toBeEnabled({ timeout: 30_000 });
  await firstTeamCard.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Highlight pacing")).toHaveValue("EVERY_BALL");
  await expect(page.getByLabel("Highlight motion")).toHaveValue("REDUCED");
  await page.getByLabel("Highlight pacing").selectOption("KEY_MOMENT");
  await page.getByLabel("Highlight motion").selectOption("AUTO");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Highlight pacing")).toHaveValue("KEY_MOMENT");
  await expect(page.getByLabel("Highlight motion")).toHaveValue("AUTO");
});
