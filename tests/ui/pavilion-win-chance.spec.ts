import { expect, test } from "@playwright/test";

/** Project Pavilion B9: in a T20 chase, the win chance sits under the situation strip, never inside it. Labelled
 * experimental and closed until the player opens it (owner direction of 25 November 2026). */
test("a T20 chase offers each side's experimental win chance, closed until opened, adding to 100", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  const chance = page.getByTestId("win-chance");
  await expect(chance).toHaveCount(0);
  // Play on, answering whatever is asked, until the second innings has started.
  const headline = page.getByTestId("situation-headline");
  for (let n = 0; n < 400; n += 1) {
    if (/needed from/.test((await headline.textContent().catch(() => "")) ?? "") && (await chance.count()) > 0) break;
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidates = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click();
    // "Bat first" can show for a moment while the computer makes its own choice, so a missed click is fine.
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidates.count()) > 0) await candidates.first().click();
    else if (await decision.getByRole("button", { name: "Finish over", exact: true }).isEnabled().catch(() => false)) await decision.getByRole("button", { name: "Finish over", exact: true }).click();
    else await page.waitForTimeout(200);
  }
  await expect(chance).toBeVisible();
  await expect(chance.locator("summary")).toHaveText("Win chance (experimental)");
  const detail = page.getByTestId("win-chance-detail");
  await expect(detail).toBeHidden();
  await chance.locator("summary").click();
  await expect(detail).toBeVisible();
  const text = (await detail.textContent())!;
  expect(text).toMatch(/^.+ about \d{1,2}% · .+ about \d{1,2}% An estimate from this game's own simulated matches, not real cricket\. Less reliable in some ranges\.$/);
  const [a, b] = [...text.matchAll(/about (\d+)%/g)].map((m) => Number(m[1]));
  expect(a! + b!).toBe(100);
  expect(a! % 5).toBe(0);
  // The situation strip still states only what is on the board.
  await expect(page.getByTestId("situation-strip")).not.toContainText(/%|probab|chance/i);
});
