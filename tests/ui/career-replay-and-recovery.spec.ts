import { expect, test } from "@playwright/test";

test("V01-018 completed career match event archives replay in UI, survive .lcxxvi export/import, and handle v1/damaged states explicitly", async ({ page, browser }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });

  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible().catch(() => false)) await advance.click();
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });

  await page.getByRole("button", { name: "Career", exact: true }).click();
  const replayButton = page.getByRole("button", { name: /View replay for Round 1/i }).first();
  await expect(replayButton).toBeVisible();
  await replayButton.click();

  const viewer = page.getByTestId("career-replay-viewer");
  await expect(viewer).toBeVisible();
  const metaText = await page.getByTestId("replay-archive-meta").textContent();
  expect(metaText).toContain("LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1");
  await expect(viewer.locator("tbody tr").first()).toBeVisible();

  const innings2Button = viewer.getByRole("button", { name: /Innings 2:/i });
  await innings2Button.click();
  await expect(innings2Button).toHaveAttribute("aria-pressed", "true");
  await expect(viewer.locator("tbody tr").first()).toBeVisible();

  await viewer.getByRole("button", { name: "Close replay" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(replayButton).toBeFocused();

  // Portable .lcxxvi export & import preserves archived event replay without recomputation.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .lcxxvi" }).click(),
  ]);
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();

  const importedContext = await browser.newContext();
  try {
    const importedPage = await importedContext.newPage();
    importedPage.on("pageerror", (err) => pageErrors.push(err.message));
    await importedPage.goto("/#career");
    await importedPage.getByLabel("Choose .lcxxvi archive").setInputFiles(archivePath!);
    await expect(importedPage.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
    await importedPage.getByRole("button", { name: "Career", exact: true }).click();
    await importedPage.getByRole("button", { name: /View replay for Round 1/i }).first().click();
    await expect(importedPage.getByTestId("replay-archive-meta")).toHaveText(metaText!);
  } finally {
    await importedContext.close();
  }

  // Legacy v1 state (completed match without stored event archive) reports explicit unavailability.
  await page.getByRole("button", { name: "Fixtures", exact: true }).click();
  const fixtureArchives = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lord-cricket-xxvi");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["projections", "settings"], "readwrite");
    const get = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
    const all = await get(tx.objectStore("projections").getAll());
    const eventRows = all.filter((row: { saveId: string; scope: string }) => row.saveId === active.value && row.scope === "CAREER_MATCH_EVENTS_V1");
    const deletedKey = eventRows[0].key as string;
    const corruptedKey = eventRows[1].key as string;
    tx.objectStore("projections").delete([active.value, "CAREER_MATCH_EVENTS_V1", deletedKey]);
    tx.objectStore("projections").put({ ...eventRows[1], payload: `${eventRows[1].payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return { deletedKey, corruptedKey };
  });

  await page.locator(`[id="replay-fixtures-${fixtureArchives.deletedKey}"]`).click();
  await expect(page.getByTestId("career-replay-viewer")).toContainText("Ball-by-ball replay unavailable");
  await page.getByRole("button", { name: "Close replay" }).click();

  await page.locator(`[id="replay-fixtures-${fixtureArchives.corruptedKey}"]`).click();
  await expect(page.getByTestId("career-replay-viewer")).toContainText("archived ball-by-ball replay log for this fixture is damaged");
  expect(pageErrors).toEqual([]);
});

test("V01-019 checkpoint inspector isolates corrupted generations, retains damaged originals, and keeps save/recovery keyboard accessible", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });

  // Advance revision twice via training changes so generations 0, 1, and 2 are populated.
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const selects = page.locator('select[id^="training-"]');
  await selects.nth(0).selectOption("BATTING_PRACTICE");
  await expect(page.locator(".save-badge small")).toContainText("rev 1", { timeout: 30_000 });
  await selects.nth(1).selectOption("BOWLING_PRACTICE");
  await expect(page.locator(".save-badge small")).toContainText("rev 2", { timeout: 30_000 });

  // Corrupt generation 2 in IndexedDB.
  const originalSaveId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lord-cricket-xxvi");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["snapshots", "settings"], "readwrite");
    const get = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
    const snap = await get(tx.objectStore("snapshots").get([active.value, 2]));
    tx.objectStore("snapshots").put({ ...snap, payload: `${snap.payload} ` });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return active.value as string;
  });

  // Leave career to start screen and inspect checkpoints via keyboard.
  await page.getByRole("button", { name: "Choose career" }).click();
  await expect(page.getByRole("heading", { name: /Continue career/i })).toBeVisible();
  const checkpointsBtn = page.locator(`[id="inspect-checkpoints-${originalSaveId}"]`);
  await checkpointsBtn.focus();
  await expect(checkpointsBtn).toBeFocused();
  await page.keyboard.press("Enter");

  const inspector = page.getByTestId("checkpoint-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Corrupted checkpoint generations detected and isolated: G2");
  await expect(inspector.getByRole("button", { name: "Recover generation 1" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Recover generation 0" })).toBeVisible();

  await inspector.getByLabel("Recovered copy title").fill("Recovered Clean Baseline");
  const recoverG0 = inspector.getByRole("button", { name: "Recover generation 0" });
  await recoverG0.focus();
  await expect(recoverG0).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".save-badge small")).toContainText("rev 0");

  // Verify damaged original save and its corrupted G2 remain untouched in IndexedDB.
  const afterRecovery = await page.evaluate(async (origId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lord-cricket-xxvi");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["games", "snapshots", "settings"], "readonly");
    const get = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
    const origGame = await get(tx.objectStore("games").get(origId));
    const origG2 = await get(tx.objectStore("snapshots").get([origId, 2]));
    db.close();
    return {
      activeSaveId: active.value as string,
      origExists: Boolean(origGame),
      origG2StillTampered: typeof origG2?.payload === "string" && origG2.payload.endsWith(" "),
    };
  }, originalSaveId);

  expect(afterRecovery.activeSaveId).not.toBe(originalSaveId);
  expect(afterRecovery.origExists).toBe(true);
  expect(afterRecovery.origG2StillTampered).toBe(true);

  // Check keyboard reachability of manual copy, export, checkpoints and archive import on Settings + zero horizontal overflow.
  const copyInput = page.getByLabel("Copy name");
  await copyInput.focus();
  await expect(copyInput).toBeFocused();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const exportBtn = page.getByRole("button", { name: "Export .lcxxvi" });
  await exportBtn.focus();
  await expect(exportBtn).toBeFocused();

  const settingsInspectBtn = page.getByRole("button", { name: "Inspect checkpoints" });
  await settingsInspectBtn.focus();
  await expect(settingsInspectBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("checkpoint-inspector")).toBeVisible();

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
  expect(pageErrors).toEqual([]);
});
