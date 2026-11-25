import { expect, test } from "@playwright/test";

/** Project Pavilion B2: the computer makes routine batter and bowler picks; key moments stay with the player. */
test("routine picks are made for the player, key moments are asked, and the switch is remembered", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  // The player answers for both sides here, so the toss and the bat-or-bowl choice are always theirs.
  await page.locator("#ai-opponent-select").selectOption("");
  const routine = decision.getByTestId("routine-picks");
  const toggle = routine.getByRole("checkbox", { name: /routine batter and bowler picks/ });
  await expect(toggle).toBeChecked();
  // The side calling the toss is the player's own; make sure that side bats first, whichever way the coin falls.
  const playerSide = (await decision.getByRole("heading", { level: 2 }).textContent())!.replace(/: call the toss$/i, "");
  await decision.getByRole("button", { name: "Call heads" }).click();
  await expect(decision).toHaveAttribute("data-phase", "AWAITING_INNINGS");
  const tossWinner = (await decision.getByRole("heading", { level: 2 }).textContent())!.replace(/ won the toss.*$/i, "");
  await decision.getByRole("button", { name: tossWinner.toLowerCase() === playerSide.toLowerCase() ? "Bat first" : "Bowl first" }).click();
  // Choosing the openers is a key moment, so the player is asked.
  await expect(decision).toHaveAttribute("data-phase", "AWAITING_BATTER");
  await expect(routine.getByTestId("routine-key")).toHaveText("Key moment: your openers. Your choice.");
  // Play on, answering whatever is asked, until a routine pick has been made for the player.
  // The note shows in the decision panel: in the routine box, or on the advance hint's line when play can go on.
  const note = decision.getByTestId("routine-note");
  for (let n = 0; n < 120 && (await note.count()) === 0; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    const enabled = decision.locator("button[data-candidate]:enabled");
    if ((await enabled.count()) > 0) await enabled.first().click();
    else if (await decision.getByRole("button", { name: "Finish over", exact: true }).isEnabled().catch(() => false))
      await decision.getByRole("button", { name: "Finish over", exact: true }).click();
    else await page.waitForTimeout(200);
  }
  await expect(note).toHaveText(/^Routine pick: .+ (bowls the next over|comes in to bat)\.$/);
  await expect(note).toHaveAttribute("role", "status");
  // Turning it off is kept in this browser only.
  await toggle.uncheck();
  expect(await page.evaluate(() => localStorage.getItem("lcxxvi-routine-picks"))).toBe("off");
  await page.reload();
  await expect(page.locator("#decision").getByTestId("routine-picks").getByRole("checkbox")).not.toBeChecked({ timeout: 60_000 });
});
