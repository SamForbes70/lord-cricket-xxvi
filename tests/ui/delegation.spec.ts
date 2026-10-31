import { expect, test } from "@playwright/test";

test("delegated toss is saved, replayed and preserved in a portable archive", async ({ page, browser }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByText("Delegate individual decisions").click();
  await page.getByLabel("Toss call").click();
  await expect(page.getByLabel("Toss call")).toBeChecked({ timeout: 30_000 });
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const commands = await new Promise<{ requestCanonical: string }[]>((resolve, reject) => { const request = db.transaction("commands", "readonly").objectStore("commands").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return commands.map(item => JSON.parse(item.requestCanonical)).some(item => item.origin === "AI" && item.command?.kind === "CALL_TOSS");
  });
  expect(stored).toBe(true);
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.getByText("Delegate individual decisions").click();
  await expect(page.getByLabel("Toss call")).toBeChecked();
  await expect(page.getByLabel("Bat or bowl")).not.toBeChecked();
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(450);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over", exact: true });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Verify replay and scorecard" }).click();
  await expect(page.getByTestId("verification")).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const archive = await (await download).path();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto("/#exhibition");
    await expect(imported.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(archive!);
    await expect(imported.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await imported.getByText("Delegate individual decisions").click();
    await expect(imported.getByLabel("Toss call")).toBeChecked();
    await expect(imported.getByRole("alert")).toHaveCount(0);
  } finally { await context.close(); }
});

test("recovery restores choices from the matching checkpoint", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "TOSS");
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_INNINGS");
  await page.getByText("Delegate individual decisions").click();
  await page.getByLabel("Bowler selection").click();
  await expect(page.getByLabel("Bowler selection")).toBeChecked();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Bat first" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "AWAITING_BATTER");
  await page.getByLabel("Batting plan").click();
  await expect(page.getByLabel("Batting plan")).toBeChecked();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const source = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["games", "snapshots", "settings"], "readwrite");
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const active = await get(tx.objectStore("settings").get("activeSaveId"));
    const game = await get(tx.objectStore("games").get(active.value));
    const snapshots = tx.objectStore("snapshots"), snapshot = await get(snapshots.get([active.value, game.checkpointGeneration]));
    snapshots.put({ ...snapshot, payload: `${snapshot.payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close(); return active.value as string;
  });
  await page.reload();
  await expect(page.locator("p.recovery")).toContainText("Recovered from a valid checkpoint", { timeout: 30_000 });
  await page.getByText("Delegate individual decisions").click();
  await expect(page.getByLabel("Bowler selection")).toBeChecked();
  await expect(page.getByLabel("Batting plan")).not.toBeChecked();
  const active = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise<{ value: string }>((resolve, reject) => { const request = db.transaction("settings", "readonly").objectStore("settings").get("activeSaveId"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return record.value;
  });
  expect(active).toMatch(/^recovered-/);
  expect(active).not.toBe(source);
});
