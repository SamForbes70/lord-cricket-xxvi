import { expect, type Page } from "@playwright/test";

/**
 * In a career or scenario match the opposition is always the computer captain (owner decision, 26 November 2026), so
 * a spec plays the player's side and lets the computer play its own. One step: the player's decision when one is
 * offered, otherwise "Finish over"; when the decision is the computer's, wait for it to act instead of clicking.
 */
export async function playOneAgainstComputer(page: Page): Promise<void> {
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  const phase = await decision.getAttribute("data-phase");
  if (phase === "COMPLETE") return;
  const revision = await decision.getAttribute("data-revision");
  const target = phase === "TOSS" ? decision.getByRole("button", { name: "Call heads" })
    : phase === "AWAITING_INNINGS" ? decision.getByRole("button", { name: "Bat first" })
    : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? decision.locator("button[data-candidate]:enabled").first()
    : decision.getByRole("button", { name: "Finish over", exact: true });
  if ((await target.count()) > 0 && (await target.isEnabled())) await target.click();
  else await expect.poll(async () => decision.getAttribute("data-revision"), { timeout: 60_000 }).not.toBe(revision);
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
}

/** The opposition setting is locked to the computer captain in a career match. */
export async function expectCareerOpponentLocked(page: Page): Promise<void> {
  await expect(page.getByLabel("Tactical captain")).toBeDisabled();
  await expect(page.getByTestId("ai-opponent-note")).toHaveText("In a career match the opposition is always the computer captain.");
}
