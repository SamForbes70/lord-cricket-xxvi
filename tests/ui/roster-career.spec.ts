import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("an imported roster career plays, saves and transfers a managed fixture", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  for (const player of players) player.playerId = `custom-${player.playerId}`;
  for (const team of world.teams) { team.teamId = `custom-${team.teamId}`; team.squadIds = team.squadIds.map((id: string) => `custom-${id}`); }
  for (const ground of world.grounds) ground.groundId = `custom-${ground.groundId}`;
  world.teams[0].name = "Imported Career Club";
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "career-ui", world: { ...world, players } });
  await page.goto("/#roster-career");
  await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await page.getByRole("button", { name: "Start roster career" }).click();
  await expect(page.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play next managed match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
  await page.getByLabel("Tactical captain").selectOption("");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(450);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over" });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Return result to career" }).click();
  await expect(page.getByText(/\d+\/56 fixtures/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("0/56 fixtures")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Imported Career Club" })).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export career" }).click();
  const file = await (await download).path();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto("/#roster-career");
    await imported.getByLabel("Import career archive").setInputFiles(file!);
    await expect(imported.getByRole("heading", { name: "Imported Career Club" })).toBeVisible({ timeout: 30_000 });
    await expect(imported.getByText("0/56 fixtures")).toHaveCount(0);
  } finally { await context.close(); }
  await page.getByRole("button", { name: "Play next managed match" }).click({ timeout: 60_000 });
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a damaged roster career checkpoint offers a recovered copy", async ({ page }) => {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "recovery-ui", world: { ...world, players } });
  await page.goto("/#roster-career");
  await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await page.getByRole("button", { name: "Start roster career" }).click();
  await page.getByRole("button", { name: "Simulate next fixture" }).click();
  await expect(page.getByText("1/56 fixtures")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["settings", "games", "snapshots"], "readwrite");
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const setting = await get(tx.objectStore("settings").get("activeRosterSeasonSaveId"));
    const game = await get(tx.objectStore("games").get(setting.value));
    const snapshots = tx.objectStore("snapshots"), row = await get(snapshots.get([setting.value, game.checkpointGeneration]));
    snapshots.put({ ...row, payload: `${row.payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  await expect(page.getByText("An older checkpoint was recovered.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Create recovered copy" }).click();
  await expect(page.getByRole("button", { name: "Simulate next fixture" })).toBeEnabled({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
});
