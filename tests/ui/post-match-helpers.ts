import { expect, type Locator, type Page } from "@playwright/test";

/** The V1 wording checks, shared by the live and the archived analysis: nothing claims a cause, no dashes, no win probability. */
export async function expectFactualWording(panel: Locator) {
  const text = (await panel.textContent()) ?? "";
  expect(text).not.toMatch(/because|thanks to|led to|cost (you|them) the match|won (you|them) the match/i);
  expect(text).not.toMatch(/[–—]/);
  expect(text).not.toMatch(/win (chance|probability)/i);
}

/** Plays to full time, changing the managed side's batting aggression once when the chance comes. */
export async function playToTheEnd(page: Page): Promise<boolean> {
  const decision = page.locator("#decision");
  let changed = false;
  for (let n = 0; n < 500; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") return changed;
    const candidate = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidate.count()) > 0) await candidate.first().click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "READY") {
      const aggression = page.locator("select[aria-label^='Aggression for']:enabled");
      if (!changed && (await aggression.count()) > 0) {
        await aggression.first().selectOption("4", { timeout: 2_000 }).then(() => { changed = true; }).catch(() => undefined);
        continue;
      }
      const finish = decision.getByRole("button", { name: "Finish innings", exact: true });
      if (await finish.isEnabled().catch(() => false)) await finish.click({ timeout: 2_000 }).catch(() => undefined);
      else await page.waitForTimeout(200);
    } else await page.waitForTimeout(200);
  }
  throw new Error("The match did not finish");
}
