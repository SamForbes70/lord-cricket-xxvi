import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")) as { players: { playerId: string; batHand: string }[] };
const leftHanders = world.players.filter(player => player.batHand === "L").map(player => player.playerId);

for (const format of ["T20", "ODI", "RED_BALL"]) test(`${format} completed match exposes reconciled event analytics`, async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(2000);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const leftCandidate = phase === "AWAITING_BATTER" ? await page.locator("button[data-candidate]:enabled").evaluateAll((buttons, ids) => buttons.map(button => button.getAttribute("data-candidate")).find(id => id && ids.includes(id)) ?? null, leftHanders) : null;
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_FOLLOW_ON" ? page.getByRole("button", { name: "Enforce follow-on" })
      : leftCandidate ? page.locator(`button[data-candidate="${leftCandidate}"]`)
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over", exact: true });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const analytics = page.getByRole("region", { name: "Event-derived match analytics" });
  await expect(analytics).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Fall of wickets" })).toBeVisible();
  await expect(analytics.getByRole("group", { name: "Over-by-over runs" })).toBeVisible();
  await expect(analytics.getByRole("img", { name: "Cumulative runs by legal balls, with one line per innings" })).toBeVisible();
  await expect(analytics.getByRole("img", { name: "Bat runs by recorded shot sector" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Simulated pitch lengths" })).toBeVisible();
  await expect(analytics.getByRole("img", { name: "Simulated deliveries by recorded length category" })).toBeVisible();
  await expect(analytics.getByText("These are recorded length categories, not measured locations. Line and physical coordinates are unavailable.")).toBeVisible();
  const leftBatter = await analytics.getByRole("combobox", { name: "Batter" }).evaluate((select, ids) => Array.from((select as HTMLSelectElement).options).map(option => option.value).find(id => ids.includes(id)) ?? null, leftHanders);
  if (format === "T20") expect(leftBatter).not.toBeNull();
  if (leftBatter) {
    const expected = await page.evaluate(async batter => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = db.transaction(["settings", "games", "snapshots"], "readonly");
      const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const active = await get(tx.objectStore("settings").get("activeSaveId"));
      const game = await get(tx.objectStore("games").get(active.value));
      const snapshot = await get(tx.objectStore("snapshots").get([active.value, game.checkpointGeneration]));
      const session = JSON.parse(snapshot.payload) as { events: { type: string; payload: { event?: { strikerId: string; shotSector: number | null; batRuns: number } } }[] };
      const totals = Array<number>(8).fill(0);
      for (const entry of session.events) if (entry.type === "DELIVERY_RECORDED" && entry.payload.event?.strikerId === batter && entry.payload.event.shotSector !== null) totals[7 - entry.payload.event.shotSector]! += entry.payload.event.batRuns;
      db.close(); return totals;
    }, leftBatter);
    await analytics.getByRole("combobox", { name: "Batter" }).selectOption(leftBatter);
    await expect(analytics.getByText("The left-handed batter's display is reflected.", { exact: false })).toBeVisible();
    const shown = await analytics.locator(".analytics-sectors > div > strong").allTextContents();
    expect(shown.map(Number)).toEqual(expected);
  }
  await page.getByLabel("Text scale").selectOption("150");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const revision = await page.locator("#decision").getAttribute("data-revision");
  await analytics.getByRole("button", { name: "Rebuild analytics" }).click();
  await expect(analytics.getByRole("status")).toContainText("Rebuilding analytics");
  await expect(analytics.getByRole("status")).toContainText("Analytics rebuild complete", { timeout: 60_000 });
  await analytics.getByRole("button", { name: "Rebuild analytics" }).click();
  await analytics.getByRole("button", { name: "Cancel analytics rebuild" }).click();
  await expect(analytics.getByRole("status")).toContainText("Analytics rebuild cancelled", { timeout: 60_000 });
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!);
  await page.getByRole("button", { name: "Verify replay and scorecard" }).click();
  await expect(page.getByTestId("verification")).toBeVisible({ timeout: 60_000 });
});
