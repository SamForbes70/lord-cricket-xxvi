import { expect, test, type Page } from "@playwright/test";

/**
 * Project Pavilion B3, B4 and B5: the result is a moment, match settings live together away from play, and the
 * player sees whole numbers with model notes behind a disclosure.
 */
async function playToTheEnd(page: Page) {
  const decision = page.locator("#decision");
  for (let n = 0; n < 400; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") return;
    const candidate = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click();
    else if (phase === "AWAITING_INNINGS" && (await decision.getByRole("button", { name: "Bat first" }).count()) > 0)
      await decision.getByRole("button", { name: "Bat first" }).click();
    else if ((await candidate.count()) > 0) await candidate.first().click();
    else if (await decision.getByRole("button", { name: "Finish match", exact: true }).isEnabled().catch(() => false))
      await decision.getByRole("button", { name: "Finish match", exact: true }).click();
    else await page.waitForTimeout(200);
  }
  throw new Error("The match did not finish");
}

test("full time replaces the advance buttons with the result, both scores and what to do next", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  await expect(page.getByTestId("scorestrip")).toBeVisible({ timeout: 60_000 });
  await playToTheEnd(page);
  const decision = page.locator("#decision");
  const moment = decision.getByTestId("result-moment");
  await expect(moment).toBeVisible();
  await expect(decision.locator(".eyebrow").first()).toHaveText("FULL TIME");
  // The heading is the result, and the advance buttons are gone.
  const result = (await page.locator("section.result h2").textContent())!;
  await expect(decision.getByRole("heading", { level: 2 })).toHaveText(result);
  for (const name of ["Next delivery", "Finish over", "Next decision", "Finish innings", "Finish match"])
    await expect(decision.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(moment.getByRole("list", { name: "Final scores" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("active")).not.toContainText("Awaiting selection");
  // One click to the scorecard; the replay check is closed until asked for.
  await moment.getByRole("button", { name: "Scorecard and match report" }).click();
  await expect(page.locator("#dugout-scorecard")).toBeFocused();
  await expect(page.getByTestId("replay-check")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Verify replay and scorecard" })).toBeHidden();
  await expect(moment.getByRole("link", { name: "Title screen" })).toHaveAttribute("href", "#title");
});

test("match settings sit together under one heading, reached from the jump bar", async ({ page }) => {
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  const settings = page.getByRole("region", { name: "Match settings" });
  for (const control of [settings.getByLabel("Text scale"), settings.getByLabel("Commentary", { exact: true }), settings.locator("#ai-opponent-select"), settings.getByText("Delegate individual decisions")])
    await expect(control).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(settings).not.toBeInViewport();
  await page.getByRole("navigation", { name: "Match sections" }).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#dugout-settings")).toBeFocused();
  await expect(settings.getByRole("heading", { name: "Match settings" })).toBeInViewport({ timeout: 10_000 });
});

test("the pitch shows whole numbers, with the model's limits behind a disclosure", async ({ page }) => {
  await page.goto("/#exhibition");
  const pitch = page.getByRole("region", { name: "Pitch and conditions" });
  await expect(pitch).toBeVisible({ timeout: 30_000 });
  for (const value of await pitch.locator(".pitch-inspection-values dd").allTextContents()) expect(value).toMatch(/^\d{1,3} \/ 100$/);
  const note = pitch.getByText("Moisture, bounce variability and outfield speed have no effect in the current model.");
  await expect(note).toBeHidden();
  await pitch.getByText("About these numbers").click();
  await expect(note).toBeVisible();
});
