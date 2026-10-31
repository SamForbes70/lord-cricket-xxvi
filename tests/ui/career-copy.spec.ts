import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const roster of [false, true]) test(`${roster ? "roster" : "standard"} career copy retains the source and survives reload`, async ({ page, browser }) => {
  await page.goto(roster ? "/#roster-career" : "/#career");
  await expect(page.getByRole("button", { name: "Save career copy" })).toHaveCount(0);
  if (roster) {
    const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
    const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "copy", world: { ...world, players } })) });
    await page.getByRole("button", { name: "Start roster career" }).click();
  } else await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("button", { name: "Save career copy" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Copy name").fill("First copy");
  await page.getByRole("button", { name: "Save career copy" }).click();
  await expect(page.getByLabel("Copy name")).toHaveValue("", { timeout: 30_000 });
  const records = await page.evaluate(async isRoster => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(["games", "settings"], "readonly");
    const get = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const active = await get(tx.objectStore("settings").get(isRoster ? "activeRosterSeasonSaveId" : "activeSeasonSaveId"));
    const games = await get(tx.objectStore("games").getAll());
    db.close(); return { active: active?.value, games };
  }, roster);
  const copy = records.games.find(game => game.title === "First copy");
  const source = records.games.find(game => game.saveId === records.active);
  expect(copy).toBeTruthy(); expect(source).toBeTruthy();
  expect(copy.saveId).not.toBe(source.saveId);
  expect(copy.stateSha256).toBe(source.stateSha256);
  expect(copy.revision).toBe(source.revision);
  await page.reload();
  await expect(page.getByRole("button", { name: "Save career copy" })).toBeVisible({ timeout: 30_000 });
  if (roster) {
    await page.getByRole("button", { name: /First copy/ }).click();
    await expect(page.getByText("0/56 fixtures")).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Choose career" }).click();
    await expect(page.getByRole("button", { name: /First copy/ })).toBeVisible();
    await page.getByRole("button", { name: /First copy/ }).click();
    await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: roster ? "Export career" : "Export .lcxxvi" }).click()]);
  const archive = await download.path();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(roster ? "/#roster-career" : "/#career");
    await imported.getByLabel(roster ? "Import career archive" : "Choose .lcxxvi archive").setInputFiles(archive!);
    if (roster) await expect(imported.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
    else await expect(imported.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
    const importedHash = await imported.evaluate(async isRoster => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const tx = db.transaction(["games", "settings"], "readonly");
      const get = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const active = await get(tx.objectStore("settings").get(isRoster ? "activeRosterSeasonSaveId" : "activeSeasonSaveId"));
      const game = await get(tx.objectStore("games").get(active.value));
      db.close(); return game.stateSha256;
    }, roster);
    expect(importedHash).toBe(copy.stateSha256);
  } finally { await context.close(); }
});

for (const roster of [false, true]) for (const failure of ["stale", "locked"]) test(`${roster ? "roster" : "standard"} copy rejects a ${failure} source without creating a slot`, async ({ page }) => {
  await page.goto(roster ? "/#roster-career" : "/#career");
  if (roster) {
    const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
    const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "copy-stale", world: { ...world, players } })) });
    await page.getByRole("button", { name: "Start roster career" }).click();
  } else await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("button", { name: "Save career copy" })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async ({ isRoster, failure }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(["games", "settings"], "readwrite");
    const get = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const active = await get(tx.objectStore("settings").get(isRoster ? "activeRosterSeasonSaveId" : "activeSeasonSaveId"));
    const games = tx.objectStore("games"), source = await get(games.get(active.value));
    if (failure === "stale") games.put({ ...source, revision: source.revision + 1 });
    else tx.objectStore("settings").put({ key: `lease:${active.value}`, saveId: active.value, ownerId: "other-tab", expiresAt: Date.now() + 60_000 });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { isRoster: roster, failure });
  await page.getByLabel("Copy name").fill("Stale copy");
  await page.getByRole("button", { name: "Save career copy" }).click();
  await expect(page.getByRole("alert")).toContainText(failure === "stale" ? "COPY_SOURCE_CHANGED_OR_LOCKED" : "This career is open in another tab.", { timeout: 30_000 });
  const titles = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction("games", "readonly");
    const games = await new Promise<{ title: string }[]>((resolve, reject) => { const r = tx.objectStore("games").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return games.map(game => game.title);
  });
  expect(titles).not.toContain("Stale copy");
});
