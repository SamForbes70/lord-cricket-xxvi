import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function ready(page: Page) {
  await page.goto("/#exhibition");
  await expect(
    page.getByRole("button", { name: "Confirm XIs and start" }),
  ).toBeEnabled();
}
async function settled(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
}
async function start(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settled(page);
  await expect(page.getByTestId("save-status")).toContainText("Saved");
}
async function advance(page: Page) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target =
    phase === "TOSS"
      ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS"
        ? page.getByRole("button", { name: "Bat first" })
        : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER"
          ? page.locator("button[data-candidate]:enabled").first()
          : page.getByRole("button", { name: "Next delivery" });
  await target.click();
  await settled(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function playSteps(page: Page, count: number) {
  for (let i = 0; i < count; i++) await advance(page);
}
async function activeSaveId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const request = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("settings", "readonly");
    const get = tx.objectStore("settings").get("activeSaveId");
    const row = await new Promise<{ value: string } | undefined>(
      (resolve, reject) => {
        get.onsuccess = () =>
          resolve(get.result as { value: string } | undefined);
        get.onerror = () => reject(get.error);
      },
    );
    db.close();
    if (!row?.value) throw new Error("No active save");
    return row.value;
  });
}
async function gameCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("games", "readonly");
    const count = tx.objectStore("games").count();
    const result = await new Promise<number>((resolve, reject) => {
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    db.close();
    return result;
  });
}
async function saveIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("games", "readonly");
    const keys = tx.objectStore("games").getAllKeys();
    const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
      keys.onsuccess = () => resolve(keys.result);
      keys.onerror = () => reject(keys.error);
    });
    db.close();
    return result.map(String);
  });
}
async function commandCount(page: Page, saveId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("commands", "readonly");
    const index = tx.objectStore("commands").index("saveId");
    const count = index.count(IDBKeyRange.only(id));
    const result = await new Promise<number>((resolve, reject) => {
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    db.close();
    return result;
  }, saveId);
}

test("autosave resumes exact durable match state after reload and continues", async ({
  page,
}) => {
  await start(page);
  await playSteps(page, 8);
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const score = await page.getByTestId("scorestrip").textContent();
  const saveId = await activeSaveId(page);
  expect(saveId).toMatch(/^auto:game-/);

  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", phase!);
  await expect(page.getByTestId("scorestrip")).toHaveText(score!);
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  await advance(page);
  expect(
    Number(await page.locator("#decision").getAttribute("data-revision")),
  ).toBeGreaterThan(Number(revision));
});

test("a second tab is read-only while the first tab holds the writer lease", async ({
  page,
  context,
}) => {
  await start(page);
  await playSteps(page, 3);
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  const second = await context.newPage();
  await second.goto("/#exhibition");
  await expect(second.getByTestId("save-status")).toContainText("Read only");
  await expect(second.locator("#decision fieldset")).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(
    second.locator("#decision fieldset button").first(),
  ).toBeDisabled();
  await expect(second.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await second.close();

  await advance(page);
  expect(
    Number(await page.locator("#decision").getAttribute("data-revision")),
  ).toBeGreaterThan(Number(revision));
});

test("manual copy, export and staged import preserve a rehydratable match", async ({
  page,
}, testInfo) => {
  await start(page);
  await playSteps(page, 6);
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  expect(await gameCount(page)).toBe(1);

  const originalSaveId = await activeSaveId(page);
  await page.getByRole("button", { name: "Save copy" }).click();
  await settled(page);
  expect(await gameCount(page)).toBe(2);
  expect(await activeSaveId(page)).toBe(originalSaveId);
  const manualSaveId = (await saveIds(page)).find(
    (id) => id !== originalSaveId,
  )!;
  expect(manualSaveId).toMatch(/^manual-/);
  expect(await commandCount(page, manualSaveId)).toBeGreaterThan(0);
  await expect(page.getByText("Saved games (2)")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export current", exact: true }).click(),
  ]);
  const archivePath = testInfo.outputPath("exported.lcxxvi");
  await download.saveAs(archivePath);

  await page.getByLabel("Import saved game").setInputFiles(archivePath);
  await settled(page);
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  expect(await gameCount(page)).toBe(3);
  const importedSaveId = await activeSaveId(page);
  expect(importedSaveId).toMatch(/^import-/);
  expect(await commandCount(page, importedSaveId)).toBeGreaterThan(0);
});

test("corrupt newest checkpoint recovers an older generation without overwriting the damaged save", async ({
  page,
}) => {
  await start(page);
  await playSteps(page, 9);
  const damagedSaveId = await activeSaveId(page);
  const beforeRevision = Number(
    await page.locator("#decision").getAttribute("data-revision"),
  );

  await page.evaluate(async (saveId) => {
    const open = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(["games", "snapshots"], "readwrite");
    const gameReq = tx.objectStore("games").get(saveId);
    const game = await new Promise<{ checkpointGeneration: number }>(
      (resolve, reject) => {
        gameReq.onsuccess = () =>
          resolve(gameReq.result as { checkpointGeneration: number });
        gameReq.onerror = () => reject(gameReq.error);
      },
    );
    const snapReq = tx
      .objectStore("snapshots")
      .get([saveId, game.checkpointGeneration]);
    const snapshot = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        snapReq.onsuccess = () =>
          resolve(snapReq.result as Record<string, unknown>);
        snapReq.onerror = () => reject(snapReq.error);
      },
    );
    snapshot.payload = `${String(snapshot.payload)} `;
    tx.objectStore("snapshots").put(snapshot);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, damagedSaveId);

  await page.reload();
  await expect(page.locator("p.recovery")).toContainText(
    "Recovered from the previous valid checkpoint",
  );
  const recoveredId = await activeSaveId(page);
  expect(recoveredId).toMatch(/^recovered-/);
  expect(recoveredId).not.toBe(damagedSaveId);
  expect(await gameCount(page)).toBeGreaterThanOrEqual(2);
  expect(
    Number(await page.locator("#decision").getAttribute("data-revision")),
  ).toBeLessThan(beforeRevision);
  await advance(page);
});

test("durable command failure rolls provisional engine state back to the last committed revision", async ({
  page,
}) => {
  await start(page);
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const saveId = await activeSaveId(page);
  await page.evaluate(async (id) => {
    const open = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").delete(`lease:${id}`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, saveId);
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.getByRole("alert")).toContainText("Save failed");
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", phase!);
  await expect(page.getByTestId("save-status")).toContainText("Read only");
});

test("repository abort injection proves command-batch atomicity and duplicate command rejection", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  const moduleUrl = `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;
  const result = await page.evaluate(async (url) => {
    const persistence = (await import(
      url
    )) as typeof import("../../packages/persistence/src/index.js");
    const repo = new persistence.IndexedDbSaveRepository(
      `m4-atomic-${crypto.randomUUID()}`,
    );
    const owner = "test-owner";
    const saveId = "atomic-save";
    const now = Date.now();
    if (!(await repo.acquireLease(saveId, owner, now)))
      throw new Error("lease");
    const base = {
      saveId,
      kind: "AUTO" as const,
      title: "Atomic fixture",
      expectedRevision: null,
      session: { revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }] },
      revision: 1,
      events: [{ sequence: 1, kind: "FIXTURE" }],
      command: {
        commandId: "cmd-1",
        requestCanonical: "req",
        responseJson: "res",
        committedRevision: 1,
      },
      metadata: {
        matchGameId: "g",
        matchId: "m",
        teams: ["A", "B"] as [string, string],
        ground: "G",
        phase: "TOSS",
        completed: false,
      },
      ownerId: owner,
      now,
      updatedAt: "2026-10-04T02:00:00.000Z",
    };
    let abortError = "";
    try {
      await repo.commit({ ...base, testAbortAfterWrites: true });
    } catch (e) {
      abortError = e instanceof Error ? e.message : String(e);
    }
    const afterAbort = {
      list: await repo.list(),
      command: await repo.command(saveId, "cmd-1"),
      load: await repo.load(saveId),
    };
    const first = await repo.commit(base);
    let duplicateError = "";
    try {
      await repo.commit({ ...base, expectedRevision: 1, revision: 2 });
    } catch (e) {
      duplicateError = e instanceof Error ? e.message : String(e);
    }
    const afterDuplicate = await repo.load(saveId);
    return {
      abortError,
      afterAbort,
      first,
      duplicateError,
      afterDuplicateRevision: afterDuplicate?.summary.revision ?? null,
    };
  }, moduleUrl);
  expect(result.abortError).toContain("SAVE_INJECTED_ABORT");
  expect(result.afterAbort.list).toEqual([]);
  expect(result.afterAbort.command).toBeNull();
  expect(result.afterAbort.load).toBeNull();
  expect(result.first.revision).toBe(1);
  expect(result.duplicateError).toContain(
    "SAVE_DUPLICATE_COMMAND_ALREADY_COMMITTED",
  );
  expect(result.afterDuplicateRevision).toBe(1);
});

test("edited match world is atomic, immutable and retained during recovery", async ({ page }) => {
  await page.goto("/#exhibition");
  const paths = {
    persistence: `/@fs/${path.resolve("packages/persistence/src/index.ts")}`,
    contracts: `/@fs/${path.resolve("packages/contracts/src/index.ts")}`,
    editing: `/@fs/${path.resolve("apps/web/src/world/new-game-world.ts")}`,
    world: `/@fs/${path.resolve("packages/data/worlds/fictional-eight-01.json")}`,
  };
  const result = await page.evaluate(async (urls) => {
    const persistence = await import(urls.persistence) as typeof import("../../packages/persistence/src/index.js");
    const contracts = await import(urls.contracts) as typeof import("../../packages/contracts/src/index.js");
    const editing = await import(urls.editing) as typeof import("../../apps/web/src/world/new-game-world.js");
    const world = contracts.WorldPackSchema.parse(await fetch(urls.world).then(response => response.json()));
    const draft = structuredClone(world);
    draft.teams[0]!.name = "Harbour XI";
    const copy = editing.createNewGameWorldCopy(draft, world);
    const hash = await persistence.sha256Text(contracts.canonicalJson(copy));
    const databaseName = `m4-world-copy-${crypto.randomUUID()}`;
    const repo = new persistence.IndexedDbSaveRepository(databaseName);
    const now = Date.now();
    await repo.acquireLease("world-match", "owner", now);
    const base = {
      saveId: "world-match", kind: "AUTO" as const, title: "Edited fixture", expectedRevision: null,
      session: { revision: 1, events: [{ sequence: 1 }] }, revision: 1, events: [{ sequence: 1 }], command: null,
      metadata: { matchGameId: "g", matchId: "m", teams: ["Harbour XI", "B"] as [string, string], ground: "G", phase: "TOSS", completed: false },
      ownerId: "owner", now, updatedAt: "2026-10-04T02:00:00.000Z", worldCopy: copy,
    };
    let abort = "";
    try { await repo.commit({ ...base, testAbortAfterWrites: true }); } catch (error) { abort = String(error); }
    const afterAbort = await repo.load(base.saveId);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const orphan = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("worldPacks", "readonly").objectStore("worldPacks").get(hash);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    await repo.commit(base);
    const changed = structuredClone(world);
    changed.teams[0]!.name = "Another team";
    let immutable = "";
    try { await repo.commit({ ...base, expectedRevision: 1, worldCopy: editing.createNewGameWorldCopy(changed, world) }); } catch (error) { immutable = String(error); }
    let missingCopy = "";
    try { await repo.commit({ ...base, expectedRevision: 1, worldCopy: null }); } catch (error) { missingCopy = String(error); }
    await repo.commit({ ...base, expectedRevision: 1, revision: 2, session: { revision: 2, events: [{ sequence: 1 }] } });
    await repo.corruptCurrentCheckpoint(base.saveId);
    const recovered = await repo.load(base.saveId);
    return { abort, afterAbort, orphan: orphan ?? null, immutable, missingCopy, recovered: recovered?.recovered, revision: recovered?.summary.revision, team: recovered?.worldCopy?.world.teams[0]?.name };
  }, paths);
  expect(result.abort).toContain("SAVE_INJECTED_ABORT");
  expect(result.afterAbort).toBeNull();
  expect(result.orphan).toBeNull();
  expect(result.immutable).toContain("SAVE_WORLD_COPY_IMMUTABLE");
  expect(result.missingCopy).toContain("SAVE_WORLD_COPY_REQUIRED");
  expect(result).toMatchObject({ recovered: true, revision: 1, team: "Harbour XI" });
});

test("delegation history checks the writer lease and durable match revision", async ({ page }) => {
  await page.goto("/#exhibition");
  const moduleUrl = `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;
  const result = await page.evaluate(async (url) => {
    const { IndexedDbSaveRepository } = await import(url) as typeof import("../../packages/persistence/src/index.js");
    const database = `delegation-${crypto.randomUUID()}`;
    const repo = new IndexedDbSaveRepository(database);
    const saveId = "save", owner = "owner", now = Date.now();
    await repo.acquireLease(saveId, owner, now);
    const base = { saveId, kind: "AUTO" as const, title: "Fixture", expectedRevision: null,
      session: { revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }] }, revision: 1,
      events: [{ sequence: 1, kind: "FIXTURE" }], command: null,
      metadata: { matchGameId: "g", matchId: "m", teams: ["A", "B"] as [string, string], ground: "G", phase: "TOSS", completed: false },
      ownerId: owner, now, updatedAt: "2026-10-04T02:00:00.000Z" };
    await repo.commit(base);
    const change = { commandId: "one", expectedRevision: 0, matchRevision: 1, teamId: "team-a", categories: ["BOWLER"] };
    const first = await repo.appendDelegation(saveId, owner, now, change);
    const version = await new Promise<string>((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onsuccess = () => { const db = request.result; const get = db.transaction("games", "readonly").objectStore("games").get(saveId); get.onsuccess = () => { resolve(get.result.schemaVersion); db.close(); }; get.onerror = () => reject(get.error); };
      request.onerror = () => reject(request.error);
    });
    const retry = await repo.appendDelegation(saveId, owner, now, change);
    const failures: string[] = [];
    for (const [writer, next] of [["other", { ...change, commandId: "two", expectedRevision: 1 }], [owner, { ...change, commandId: "two", expectedRevision: 1, matchRevision: 0 }]] as const) {
      try { await repo.appendDelegation(saveId, writer, now, next); }
      catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
    const restored = await new IndexedDbSaveRepository(database).loadDelegationJournal(saveId);
    await repo.cloneSave(saveId, "race", "MANUAL", "Race", owner, now, "2026-10-04T02:00:00.000Z");
    const race = await Promise.allSettled(["two", "three"].map(commandId => repo.appendDelegation("race", owner, now, { ...change, commandId, expectedRevision: 1 })));
    const raceJournal = await repo.loadDelegationJournal("race");
    const raceDb = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(database); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = raceDb.transaction("settings", "readwrite"); tx.objectStore("settings").delete("delegation:race"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    raceDb.close();
    const recoveredActive = await repo.load("race");
    const events = [{ sequence: 1, kind: "FIXTURE" }, { sequence: 2, kind: "FIXTURE" }];
    await repo.commit({ ...base, expectedRevision: 1, revision: 2, session: { revision: 2, events }, events });
    await repo.appendDelegation(saveId, owner, now, { ...change, commandId: "two", expectedRevision: 1, matchRevision: 2, categories: ["BATTER"] });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite"), store = tx.objectStore("settings");
      const request = store.get("delegation-checkpoint:save:1");
      request.onsuccess = () => { const row = request.result; row.value.record.journal.changes[0].categories = []; store.put(row); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
    const recovered = await repo.load(saveId);
    await repo.cloneSave(saveId, "copy", "MANUAL", "Copy", owner, now, "2026-10-04T02:00:00.000Z");
    const copied = await repo.loadDelegationJournal("copy");
    await repo.delete(saveId);
    return { first, retry, restored, recovered, copied, failures, version, race: race.map(item => item.status), raceLength: raceJournal.changes.length, recoveredActive: recoveredActive?.recovered, activeJournal: recoveredActive?.delegationJournal, raceJournal };
  }, moduleUrl);
  expect(result.retry).toEqual(result.first);
  expect(result.restored).toEqual(result.first);
  expect(result.copied).toEqual(result.first);
  expect(result.recovered?.recovered).toBe(true);
  expect(result.recovered?.delegationJournal).toEqual(result.first);
  expect(result.failures).toEqual(["SAVE_READ_ONLY", "DELEGATION_STALE_MATCH"]);
  expect(result.race.sort()).toEqual(["fulfilled", "rejected"]);
  expect(result.raceLength).toBe(2);
  expect(result.version).toBe("LC_SAVE_V4_DELEGATION");
  expect(result.recoveredActive).toBe(true);
  expect(result.activeJournal).toEqual(result.raceJournal);
});
