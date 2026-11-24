import { expect, test } from "@playwright/test";

/** Project Pavilion B6: "Next key moment" plays on and stops for something worth the player's attention. */
test("Next key moment plays on and stops at a key moment, a decision or the end, saying why", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  await page.locator("#ai-opponent-select").selectOption("");
  await decision.getByRole("button", { name: "Call heads" }).click();
  await decision.getByRole("button", { name: "Bat first" }).click();
  // Answer the opening questions until the first ball is ready.
  for (let n = 0; n < 10; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    if ((await decision.getAttribute("data-phase")) === "READY") break;
    await decision.locator("button[data-candidate]:enabled").first().click();
  }
  const next = decision.getByTestId("next-key-moment");
  await expect(next).toHaveText("Next key moment");
  let reasons = 0;
  for (let n = 0; n < 60 && reasons < 3; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    if (phase !== "READY") { await decision.locator("button[data-candidate]:enabled").first().click(); continue; }
    const before = Number(await decision.getAttribute("data-revision"));
    await next.click();
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    expect(Number(await decision.getAttribute("data-revision"))).toBeGreaterThan(before);
    const note = decision.getByTestId("key-moment");
    if ((await note.count()) > 0) {
      await expect(note).toHaveAttribute("role", "status");
      await expect(note).toHaveText(/^Key moment: (Wicket(: .+)?|.+ reaches (50|100)\.|The death overs begin\.|The chase is tightening\.|Last over of the chase\.)$/);
      reasons += 1;
    }
  }
  expect(reasons).toBeGreaterThan(0);
});
