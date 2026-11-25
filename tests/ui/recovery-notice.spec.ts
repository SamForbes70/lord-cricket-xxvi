import { expect, test, type Page } from "@playwright/test";

const NOTICE = /Recovered from a valid checkpoint/i;

async function settled(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
}

async function step(page: Page) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
    : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
    : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
    : page.getByRole("button", { name: "Next delivery" });
  await target.click();
  await settled(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
}

async function revision(page: Page): Promise<number> {
  return Number(await page.locator("#decision").getAttribute("data-revision"));
}

async function activeSaveId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const row = await new Promise<{ value: string } | undefined>((resolve, reject) => { const request = db.transaction("settings", "readonly").objectStore("settings").get("activeSaveId"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return row?.value ?? "";
  });
}

// The notice must not depend on nothing being committed after the recovery. A tactical captain re-enabled in a
// recovered career tab commits its pending decision as soon as the page opens (managed-recovery.spec.ts), and the
// worker used to clear the notice on that first commit, so the player could miss that a recovery had happened.
test("the recovery notice stays while the recovered match is played on, and goes once the intact copy is reopened", async ({ page }) => {
  await page.goto("/#exhibition");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settled(page);
  for (let i = 0; i < 6; i++) await step(page);
  const before = await revision(page);
  const damaged = await activeSaveId(page);
  // Corrupt the newest checkpoint so the next open recovers the previous generation into a new slot.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["settings", "games", "snapshots"], "readwrite");
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const setting = await get(tx.objectStore("settings").get("activeSaveId"));
    const game = await get(tx.objectStore("games").get(setting.value));
    const snapshots = tx.objectStore("snapshots"), row = await get(snapshots.get([setting.value, game.checkpointGeneration]));
    snapshots.put({ ...row, payload: `${row.payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });

  await page.reload();
  await expect(page.locator("p.recovery")).toContainText(NOTICE, { timeout: 30_000 });
  await settled(page);
  const recoveredId = await activeSaveId(page);
  expect(recoveredId).toMatch(/^recovered-/);
  expect(recoveredId).not.toBe(damaged);
  const restored = await revision(page);
  expect(restored).toBeLessThan(before);

  // Each step is a committed command in the recovered slot. The player is still told the match was recovered.
  for (let i = 0; i < 3; i++) await step(page);
  const played = await revision(page);
  expect(played).toBeGreaterThan(restored);
  await expect(page.locator("p.recovery")).toContainText(NOTICE);
  expect(await activeSaveId(page)).toBe(recoveredId);

  // The recovered slot itself is intact, so opening it again is an ordinary load with no recovery to report.
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", String(played), { timeout: 30_000 });
  await settled(page);
  expect(await activeSaveId(page)).toBe(recoveredId);
  await expect(page.getByText(NOTICE)).toHaveCount(0);
});
