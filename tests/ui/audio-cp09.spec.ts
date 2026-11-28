import { expect, test, type Page } from "@playwright/test";

/**
 * CP09 (Studio Production Directive 05): a four or six now gets its boundary cue (its caption reads "FOUR!" or
 * "SIX!"), decided by the recorded delivery rather than the commentary's wording, and a match moment plays its sting
 * at the effects volume once sound is on and the player has clicked. Sound itself cannot be heard in a headless
 * browser; the panel reports what the audio manager decided.
 */

async function settle(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
}

async function startExhibition(page: Page) {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
}

async function reachReady(page: Page) {
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS", { timeout: 30_000 });
  await page.getByRole("button", { name: "Bat first" }).click();
  for (let guard = 0; guard < 6; guard++) {
    await settle(page);
    if ((await page.locator("#decision").getAttribute("data-phase")) === "READY") break;
    await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
  }
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "READY", { timeout: 30_000 });
}

/** Finishes overs until the audio caption reports a boundary, picking batters and bowlers as asked. */
async function playToBoundaryCaption(page: Page) {
  const caption = page.getByTestId("audio-caption-banner");
  for (let guard = 0; guard < 40; guard++) {
    if (/FOUR!|SIX!/.test((await caption.textContent()) ?? "")) return;
    const phase = await page.locator("#decision").getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") {
      await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
    } else {
      await page.getByRole("button", { name: "Finish over", exact: true }).click();
    }
    await settle(page);
  }
  await expect(caption).toContainText(/FOUR!|SIX!/);
}

test("a boundary gets its boundary cue and a match moment plays its sting once sound is on", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await startExhibition(page);
  const panel = page.getByTestId("match-audio-panel");
  // Muted by default, and nothing has stung yet.
  await expect(page.getByTestId("audio-status-pill")).toHaveText("Muted (silent captions)");
  await expect(panel).not.toHaveAttribute("data-moment-sting", /.+/);
  await page.getByRole("button", { name: "Sound: Muted" }).click();
  await reachReady(page);
  await playToBoundaryCaption(page);
  // A four or six over shows a moment, and its sting went through the audio manager at the effects volume. A
  // runner with no audio device reports UNAVAILABLE rather than PLAYED; it is never queued or replayed.
  await expect(page.getByTestId("match-moment")).toBeVisible();
  await expect(panel).toHaveAttribute("data-moment-sting", /^[A-Z_]+:full:(PLAYED|UNAVAILABLE)$/);
  expect(errors).toEqual([]);
});

test("muted, the boundary caption still shows and the moment's sting is silent", async ({ page }) => {
  test.setTimeout(240_000);
  await startExhibition(page);
  await reachReady(page);
  await playToBoundaryCaption(page);
  await expect(page.getByTestId("match-moment")).toBeVisible();
  await expect(page.getByTestId("match-audio-panel")).toHaveAttribute("data-moment-sting", /^[A-Z_]+:full:MUTED_OR_ZERO_VOLUME$/);
});
