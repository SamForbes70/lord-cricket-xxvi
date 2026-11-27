import { expect, test } from "@playwright/test";
import { appendFileSync } from "node:fs";

/**
 * Measurement only, not part of any suite (docs/pavilion/UNIFIED_ADVANCE.md). Plays whole exhibition matches through one
 * advancement mode each, against the computer captain ("ai") or with manual control of both sides ("manual"), and
 * appends one JSON line per match: wall time from the first press to the result, presses, deliveries and commands.
 * The player's own choices are the first enabled candidate, heads, bat first and enforce the follow-on.
 *
 *   npm run build
 *   LCX_TIMING_OUT=timings.jsonl npx playwright test --config playwright.perf.config.ts --project=chromium
 *
 * LCX_FORMATS, LCX_MODES and LCX_OPPONENTS narrow the matrix (comma separated); LCX_LABEL tags the lines.
 */
const out = process.env.LCX_TIMING_OUT ?? "test-results-perf/timings.jsonl";
const formats = (process.env.LCX_FORMATS ?? "T20,ODI,RED_BALL").split(",");
const modes = (process.env.LCX_MODES ?? "Finish match,Finish over").split(",");
const opponents = (process.env.LCX_OPPONENTS ?? "ai,manual").split(",");
for (const format of formats) for (const mode of modes) for (const opponent of opponents)
test(`${format} ${mode} ${opponent}`, async ({ page }) => {
  test.setTimeout(3_600_000);
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  const select = page.getByLabel("Tactical captain", { exact: true });
  if (opponent === "ai") await select.selectOption({ index: 2 });
  else await select.selectOption("");
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  const started = Date.now();
  let clicks = 0;
  for (let steps = 0; (await decision.getAttribute("data-phase")) !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(5000);
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 600_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidate = page.locator("button[data-candidate]:enabled").first();
    const advance = page.getByRole("button", { name: mode, exact: true });
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_FOLLOW_ON") await decision.getByRole("button", { name: "Enforce follow-on" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") && (await candidate.count()) > 0) await candidate.click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "READY" && (await advance.isEnabled().catch(() => false))) { await advance.click({ timeout: 5_000 }).catch(() => undefined); clicks++; }
    else await page.waitForTimeout(100);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const seconds = (Date.now() - started) / 1000;
  const revision = await decision.getAttribute("data-revision");
  const counts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["settings", "games", "snapshots"], "readonly");
    const active = await get(tx.objectStore("settings").get("activeSaveId")) as { value: string };
    const game = await get(tx.objectStore("games").get(active.value)) as { checkpointGeneration: number };
    const snapshot = await get(tx.objectStore("snapshots").get([active.value, game.checkpointGeneration])) as { payload: string };
    db.close();
    const session = JSON.parse(snapshot.payload) as { events: { type: string }[]; commands: { actorId: string; kind: string }[] };
    return { deliveries: session.events.filter(e => e.type === "DELIVERY_RECORDED").length, commands: session.commands.length,
      ai: session.commands.filter(c => c.actorId.startsWith("AI:")).length, advances: session.commands.filter(c => c.kind === "ADVANCE").length };
  });
  const result = (await page.locator(".result-moment, [data-testid=result-moment]").first().textContent().catch(() => ""))?.slice(0, 120);
  appendFileSync(out, JSON.stringify({ label: process.env.LCX_LABEL ?? "", format, mode, opponent, seconds, clicks, revision, ...counts, msPerDelivery: Math.round(seconds * 1000 / counts.deliveries), result }) + "\n");
  console.log(`TIMING ${format} | ${mode} | ${opponent} | ${seconds.toFixed(1)} s | clicks ${clicks} | revision ${revision} | deliveries ${counts.deliveries} | ms/ball ${Math.round(seconds * 1000 / counts.deliveries)}`);
});
