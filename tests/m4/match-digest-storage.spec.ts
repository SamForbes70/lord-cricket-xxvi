import { expect, test } from "@playwright/test";
import path from "node:path";

const persistenceUrl = () => `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;

// docs/design/MATCH_ARCHIVE_STORAGE_V2.md: digests are stored per fixture, verified on load, and a
// damaged row is skipped (then derived again from its archive). A single archive is read by key.
test("match digests round-trip, skip damaged rows, and single archives load by key", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(async (moduleUrl) => {
    const persistence = (await import(moduleUrl)) as typeof import("../../packages/persistence/src/index.js");
    const name = `m4-digest-${crypto.randomUUID()}`;
    const repo = new persistence.IndexedDbPersistentWorldRepository(name);
    const digest = (fixtureId: string) => ({
      digestVersion: "LC_CAREER_MATCH_DIGEST_V1" as const,
      fixtureId,
      groundId: "ground-01",
      creaseOrder: [["p001", "p002"], ["p012"]] as [string[], string[]],
      fielding: [{ playerId: "p005", teamId: "team-01", catches: 2, stumpings: 0, runOuts: 1 }],
    });
    await repo.saveMatchDigests("pworld:x", [digest("fx-1"), digest("fx-2")]);
    await repo.saveMatchDigests("pworld:other", [digest("fx-1")]);
    const before = await repo.loadMatchDigests("pworld:x");
    // Damage one row in place.
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction("projections", "readwrite");
    const store = tx.objectStore("projections");
    const row = await new Promise<{ payload: string }>((resolve) => { const g = store.get(["pworld:x", persistence.CAREER_MATCH_DIGEST_SCOPE, "fx-2"]); g.onsuccess = () => resolve(g.result); });
    store.put({ ...row, payload: row.payload.replace('"catches":2', '"catches":3') });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
    const after = await repo.loadMatchDigests("pworld:x");
    const missingArchive = await repo.loadMatchEventArchive("pworld:x", "fx-1");
    return {
      before: [...before.keys()],
      fx1: before.get("fx-1"),
      after: [...after.keys()],
      missingArchive,
    };
  }, persistenceUrl());
  expect(result.before).toEqual(["fx-1", "fx-2"]);
  expect(result.fx1?.fielding[0]).toEqual({ playerId: "p005", teamId: "team-01", catches: 2, stumpings: 0, runOuts: 1 });
  expect(result.after).toEqual(["fx-1"]);
  expect(result.missingArchive).toEqual({ archive: null, damaged: false });
});
