import { expect, test } from "@playwright/test";
import path from "node:path";

const persistenceUrl = () => `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;

// Audit 16 Nov 2026, Phase 4: commits and loads read one save's rows for one scope by key range
// instead of the whole projections store. This pins the range's edges in real IndexedDB.
test("scoped projection reads return exactly one save's rows for one scope", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(async (moduleUrl) => {
    const persistence = (await import(moduleUrl)) as typeof import("../../packages/persistence/src/index.js");
    const name = `m4-scope-${crypto.randomUUID()}`;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("projections", { keyPath: ["saveId", "scope", "key"] });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const rows = [
      // The target, with keys of different shapes.
      ["pworld:a", "CAREER_MATCH_EVENTS_V1", ""], ["pworld:a", "CAREER_MATCH_EVENTS_V1", "fx-1"], ["pworld:a", "CAREER_MATCH_EVENTS_V1", "zz~"],
      // Neighbouring scopes of the same save.
      ["pworld:a", "CAREER_MATCH_EVENTS_V0", "fx-1"], ["pworld:a", "CAREER_MATCH_EVENTS_V1X", "fx-1"], ["pworld:a", "CAREER_AWARDS_LEDGER_V1", "l"],
      // Saves whose ids share a prefix or sort next to it.
      ["pworld:a-copy", "CAREER_MATCH_EVENTS_V1", "fx-1"], ["pworld:", "CAREER_MATCH_EVENTS_V1", "fx-1"], ["pworld:b", "CAREER_MATCH_EVENTS_V1", "fx-1"],
    ];
    const write = db.transaction("projections", "readwrite");
    for (const [saveId, scope, key] of rows) write.objectStore("projections").put({ saveId, scope, key, payload: "{}", sha256: "0".repeat(64) });
    await new Promise<void>((resolve, reject) => { write.oncomplete = () => resolve(); write.onerror = () => reject(write.error); });
    const read = db.transaction("projections", "readonly");
    const found = await persistence.projectionRowsForScope(read.objectStore("projections"), "pworld:a", "CAREER_MATCH_EVENTS_V1");
    db.close();
    indexedDB.deleteDatabase(name);
    return found.map((r) => `${r.saveId}|${r.scope}|${r.key}`);
  }, persistenceUrl());
  expect(result).toEqual([
    "pworld:a|CAREER_MATCH_EVENTS_V1|",
    "pworld:a|CAREER_MATCH_EVENTS_V1|fx-1",
    "pworld:a|CAREER_MATCH_EVENTS_V1|zz~",
  ]);
});
