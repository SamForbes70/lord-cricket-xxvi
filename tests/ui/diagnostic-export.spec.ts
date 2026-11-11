import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const format of ["T20", "ODI", "RED_BALL"]) test(`${format} diagnostic requires preview and exports the recorded events`, async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const panel = page.getByRole("region", { name: "Match diagnostic export" });
  await expect(panel.getByRole("button", { name: "Download diagnostic" })).toHaveCount(0);
  await expect(panel).toContainText("random seed");
  // By default an unfinished match's seed stays out of the file; this run opts in to check the full export.
  await panel.getByLabel(/Include the random seed/).check();
  await panel.getByRole("button", { name: "Preview diagnostic" }).click();
  const preview = panel.getByRole("region", { name: "Diagnostic preview" });
  await expect(preview).toContainText(`Format: ${format}`);
  await expect(preview).toContainText("LC_MATCH_DIAGNOSTIC_V1");
  await expect(preview).toContainText("SYNTHETIC_ALPHA");
  const sha = await preview.locator("code").last().innerText();
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download diagnostic" }).click()]);
  expect(download.suggestedFilename()).toBe("lord-cricket-diagnostic.json");
  const stream = await download.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks), data = JSON.parse(bytes.toString("utf8"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
  expect(data).toMatchObject({ version: "LC_MATCH_DIAGNOSTIC_V1", format, modelStatus: "SYNTHETIC_ALPHA" });
  expect(data.seed).toBeTruthy(); expect(data.events.length).toBeGreaterThan(0);
  const savedEvents = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(["settings", "games", "snapshots"], "readonly");
    const get = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const active = await get(tx.objectStore("settings").get("activeSaveId"));
    const game = await get(tx.objectStore("games").get(active.value));
    const checkpoint = await get(tx.objectStore("snapshots").get([active.value, game.checkpointGeneration]));
    db.close(); return (JSON.parse(checkpoint.payload) as { events: unknown[] }).events;
  });
  expect(data.events).toEqual(savedEvents);
  expect(data).not.toHaveProperty("setup");
  expect(await preview.innerText()).not.toContain(data.seed);
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(panel.getByRole("region", { name: "Diagnostic preview" })).toHaveCount(0);
});

test("an unfinished match's diagnostic omits the seed unless the player opts in", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const panel = page.getByRole("region", { name: "Match diagnostic export" });
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download diagnostic" }).click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of (await file.createReadStream())) chunks.push(Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  await panel.getByRole("button", { name: "Preview diagnostic" }).click();
  await expect(panel.getByRole("region", { name: "Diagnostic preview" })).toContainText("Seed: Not included");
  expect((await download()).seed).toBeNull();
  await panel.getByLabel(/Include the random seed/).check();
  await panel.getByRole("button", { name: "Preview diagnostic" }).click();
  await expect(panel.getByRole("region", { name: "Diagnostic preview" })).toContainText("Seed: Included in file");
  expect((await download()).seed).toBeTruthy();
});

test("diagnostic includes the rejected command and invariant without changing the match", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  while (await page.locator("#decision").getAttribute("data-phase") !== "READY") {
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" }) : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" }) : page.locator("button[data-candidate]:enabled").first();
    await target.click(); await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  }
  const revision = await page.locator("#decision").getAttribute("data-revision");
  const fields = page.getByRole("combobox", { name: /Field for/ });
  await fields.first().selectOption(await fields.nth(1).inputValue());
  await page.getByRole("button", { name: "Apply named field" }).click();
  await expect(page.getByRole("alert")).toContainText("FIELD");
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!);
  const panel = page.getByRole("region", { name: "Match diagnostic export" });
  await panel.getByRole("button", { name: "Preview diagnostic" }).click();
  await expect(panel.getByRole("region", { name: "Diagnostic preview" })).toContainText("COMMAND");
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download diagnostic" }).click()]);
  const stream = await download.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(data.failure.command.kind).toBe("SET_FIELD");
  expect(data.failure.sequence).toBe(data.events.length + 1);
  expect(data.failure.invariantCode).toContain("FIELD");
  expect(data.revision).toBe(Number(revision));
});

test("diagnostic reports unrecoverable checkpoints without deleting their original", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const sourceId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(["settings", "snapshots"], "readwrite");
    const get = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const active = await get(tx.objectStore("settings").get("activeSaveId"));
    const store = tx.objectStore("snapshots"), rows = await get(store.getAll());
    for (const row of rows.filter(row => row.saveId === active.value)) store.put({ ...row, payload: `${row.payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close(); return active.value as string;
  });
  await page.reload();
  const panel = page.getByRole("region", { name: "Match diagnostic export" });
  await expect(panel.getByRole("button", { name: "Preview diagnostic" })).toBeEnabled({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Preview diagnostic" }).click();
  await expect(panel.getByRole("region", { name: "Diagnostic preview" })).toContainText("RECOVERY");
  const sourceStillExists = await page.evaluate(async saveId => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lord-cricket-xxvi"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction("games", "readonly");
    const row = await new Promise<unknown>((resolve, reject) => { const r = tx.objectStore("games").get(saveId); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return Boolean(row);
  }, sourceId);
  expect(sourceStillExists).toBe(true);
});
