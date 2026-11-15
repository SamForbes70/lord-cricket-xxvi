import { expect, test } from "@playwright/test";

test("Stage 7 contextual text commentary supports Standard, Detailed, Brief, and Off verbosity modes, milestone badges, 150% zoom, and Career Settings persistence", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30_000,
  });

  // Start T20 exhibition match and advance into READY phase
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

  const commentarySelect = page.getByLabel("Commentary", { exact: true });
  const panel = page.getByTestId("match-commentary-panel");
  await expect(panel).toBeVisible();
  await expect(commentarySelect).toHaveValue("full");

  // Play through Over 1 (selecting incoming batters if a wicket falls mid-over) until OVER_COMPLETED is recorded
  for (let guard = 0; guard < 12; guard++) {
    if ((await panel.locator('li[data-category="OVER"]').count()) > 0) break;
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

  const items = panel.locator("ol > li");
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(8);

  // Over summary entry + delivery entry exist with data-category attributes
  await expect(panel.locator('li[data-category="OVER"]').first()).toBeVisible();
  const firstDeliveryItem = panel
    .locator('li[data-category="DELIVERY"], li[data-category="DISMISSAL"], li[data-category="MILESTONE"]')
    .first();
  await expect(firstDeliveryItem).toBeVisible();

  const standardText = ((await firstDeliveryItem.locator("span").first().textContent()) ?? "").trim();
  expect(standardText).toMatch(/^Innings 1, 0\./);

  // Switch to Detailed mode -> includes Score & Stand factual summary
  await commentarySelect.selectOption("detailed");
  await expect(commentarySelect).toHaveValue("detailed");
  const detailedText = ((await firstDeliveryItem.locator("span").first().textContent()) ?? "").trim();
  expect(detailedText.length).toBeGreaterThan(standardText.length);
  expect(detailedText).toContain("Score ");
  expect(detailedText).toContain("Stand ");

  // Switch to Brief mode -> compact coordinate summary
  await commentarySelect.selectOption("brief");
  await expect(commentarySelect).toHaveValue("brief");
  const briefText = ((await firstDeliveryItem.locator("span").first().textContent()) ?? "").trim();
  expect(briefText.length).toBeLessThan(standardText.length);
  expect(briefText).toMatch(/^0\.[1-6] · /);

  // Switch to Off mode -> hides list cleanly while match controls stay usable
  await commentarySelect.selectOption("off");
  await expect(panel).toContainText("Commentary hidden. Match decisions remain above.");
  await expect(panel.locator("ol")).toHaveCount(0);

  // Restore Detailed mode and verify 150% zoom (910x512) has zero horizontal overflow
  await commentarySelect.selectOption("detailed");
  await page.setViewportSize({ width: 910, height: 512 });
  await expect(panel).toBeVisible();
  const overflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowPx).toBeLessThanOrEqual(1);

  // Verify Career Settings syncs Detailed / Brief / Standard commentary mode across reload
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#career");
  const firstTeamCard = page.locator("button.team-card").first();
  await expect(firstTeamCard).toBeEnabled({ timeout: 30_000 });
  await firstTeamCard.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const careerCommentarySelect = page.getByLabel("Match commentary");
  await expect(careerCommentarySelect).toHaveValue("detailed");
  await careerCommentarySelect.selectOption("brief");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Match commentary")).toHaveValue("brief");

  // Restore Standard ("full")
  await page.getByLabel("Match commentary").selectOption("full");
  await expect(page.getByLabel("Match commentary")).toHaveValue("full");
});
