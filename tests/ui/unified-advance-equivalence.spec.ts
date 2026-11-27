import { expect, test, type Page } from "@playwright/test";

/**
 * Directive 03, match integrity (docs/pavilion/UNIFIED_ADVANCE.md): the same match, with the same seed and the same
 * decisions, gives the same result whichever button moves it on. A scenario challenge has a fixed seed and the
 * computer captain as the opponent. "Hold the line" puts the computer's side in to bat, so its batting plans change
 * from ball to ball as batters come and go. It is played twice from its checkpoint, once with "Finish match" and once
 * with repeated "Next delivery", choosing the first available bowler each time, and the saved deliveries and the result
 * must be identical. Before this change "Finish match" bowled an over per command and the computer changed its plans
 * only at its own decisions, so the two could differ.
 */
async function savedDeliveries(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["settings", "games", "snapshots"], "readonly");
    const active = await get(tx.objectStore("settings").get("activeSaveId")) as { value: string };
    const game = await get(tx.objectStore("games").get(active.value)) as { checkpointGeneration: number };
    const snapshot = await get(tx.objectStore("snapshots").get([active.value, game.checkpointGeneration])) as { payload: string };
    db.close();
    const session = JSON.parse(snapshot.payload) as { events: { type: string; payload: unknown; stateHash: string }[]; commands: { actorId: string }[] };
    return {
      deliveries: session.events.filter(event => event.type === "DELIVERY_RECORDED").map(event => JSON.stringify(event.payload)),
      finalStateHash: session.events.at(-1)!.stateHash,
      captainCommands: session.commands.filter(command => command.actorId.startsWith("AI:")).length,
    };
  });
}

async function playScenario(page: Page, button: "Finish match" | "Next delivery") {
  await page.goto("/#scenarios");
  await page.getByRole("button", { name: "Play Hold the line" }).click();
  await expect(page.getByTestId("scenario-banner")).toBeVisible({ timeout: 60_000 });
  const decision = page.locator("#decision");
  // A second play replaces the finished first one: wait for the new match at its checkpoint.
  await expect(decision).not.toHaveAttribute("data-phase", "COMPLETE", { timeout: 60_000 });
  await expect(page.getByTestId("scenario-outcome")).toHaveCount(0);
  await expect(page.locator("#ai-opponent-select")).toHaveValue("team-06");
  let presses = 0;
  for (let steps = 0; (await decision.getAttribute("data-phase")) !== "COMPLETE"; steps += 1) {
    expect(steps).toBeLessThan(400);
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidate = decision.locator("button[data-candidate]:enabled").first();
    const advance = decision.getByRole("button", { name: button, exact: true });
    if ((phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") && (await candidate.count()) > 0) await candidate.click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "READY" && (await advance.isEnabled().catch(() => false))) { await advance.click(); presses += 1; }
    else await page.waitForTimeout(200);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const outcome = await page.getByTestId("scenario-outcome").textContent({ timeout: 30_000 });
  return { ...(await savedDeliveries(page)), outcome, presses };
}

test("Hold the line: Finish match and repeated Next delivery play the same match against the computer captain", async ({ page }) => {
  test.setTimeout(420_000);
  const byMatch = await playScenario(page, "Finish match");
  const byBall = await playScenario(page, "Next delivery");
  // The two plays used their buttons as intended: a few presses against one per ball.
  expect(byMatch.presses).toBeLessThan(byBall.presses);
  expect(byBall.presses).toBeGreaterThanOrEqual(20);
  expect(byBall.captainCommands).toBeGreaterThan(0);
  expect(byBall.deliveries.length).toBe(byMatch.deliveries.length);
  expect(byBall.deliveries).toEqual(byMatch.deliveries);
  expect(byBall.finalStateHash).toBe(byMatch.finalStateHash);
  expect(byBall.captainCommands).toBe(byMatch.captainCommands);
  expect(byBall.outcome).toBe(byMatch.outcome);
});
