import { expect, test } from "@playwright/test";
import path from "node:path";

const urls = () => ({
  index: `/@fs/${path.resolve("packages/persistence/src/index.ts")}`,
  simulation: `/@fs/${path.resolve("packages/simulation/src/index.ts")}`,
  career: `/@fs/${path.resolve("apps/web/src/career/roster-season.ts")}`,
  world: `/@fs/${path.resolve("packages/data/worlds/fictional-eight-01.json")}`,
});

test("a first commit never replaces an existing save", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(async (moduleUrl) => {
    const persistence = (await import(moduleUrl)) as typeof import("../../packages/persistence/src/index.js");
    const repo = new persistence.IndexedDbSaveRepository(`m4-exists-${crypto.randomUUID()}`);
    const owner = "owner", saveId = "auto:career-match-f1", now = Date.now();
    await repo.acquireLease(saveId, owner, now);
    const base = {
      saveId, kind: "AUTO" as const, title: "First", expectedRevision: null,
      session: { revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }], marker: "original" }, revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }],
      command: { commandId: "cmd-1", requestCanonical: "req", responseJson: "res", committedRevision: 1 },
      metadata: { matchGameId: "g", matchId: "m", teams: ["A", "B"] as [string, string], ground: "G", phase: "TOSS", completed: false },
      ownerId: owner, now, updatedAt: "2026-10-04T02:00:00.000Z",
    };
    await repo.commit(base);
    let error = "";
    try { await repo.commit({ ...base, title: "Replacement", session: { revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }], marker: "replacement" }, command: { ...base.command, commandId: "cmd-2" } }); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    const kept = await repo.load(saveId);
    return { error, title: kept?.summary.title, marker: (kept?.session as { marker?: string } | undefined)?.marker, commands: (await repo.command(saveId, "cmd-2")) };
  }, urls().index);
  expect(result.error).toContain("SAVE_ALREADY_EXISTS");
  expect(result.title).toBe("First");
  expect(result.marker).toBe("original");
  expect(result.commands).toBeNull();
});

test("the match save list omits career rows of both kinds", async ({ page }) => {
  await page.goto("/#exhibition");
  const u = urls();
  const result = await page.evaluate(async (paths) => {
    const persistence = (await import(paths.index)) as typeof import("../../packages/persistence/src/index.js");
    const simulation = (await import(paths.simulation)) as typeof import("../../packages/simulation/src/index.js");
    const career = (await import(paths.career)) as typeof import("../../apps/web/src/career/roster-season.js");
    const world = await fetch(paths.world).then((response) => response.json());
    const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    const pack = simulation.createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "list-test", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const state = career.createRosterSeason(pack, { careerId: "career", controlledTeamId: world.teams[0].teamId, seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const name = `m4-list-${crypto.randomUUID()}`;
    const seasons = new persistence.IndexedDbSeasonRepository(name), matches = new persistence.IndexedDbSaveRepository(name);
    const now = Date.now();
    await seasons.acquireLease("career", "owner", now);
    await seasons.commitRoster({ saveId: "career", kind: "AUTO", title: "Roster career", expectedRevision: null, state, rosterPack: pack, command: null, ownerId: "owner", now, updatedAt: "2026-10-30T00:00:00.000Z" });
    await matches.acquireLease("auto:g", "owner", now);
    await matches.commit({
      saveId: "auto:g", kind: "AUTO", title: "Match", expectedRevision: null, session: { revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }] }, revision: 1, events: [{ sequence: 1, kind: "FIXTURE" }],
      command: { commandId: "c", requestCanonical: "r", responseJson: "s", committedRevision: 1 },
      metadata: { matchGameId: "g", matchId: "m", teams: ["A", "B"], ground: "G", phase: "TOSS", completed: false }, ownerId: "owner", now, updatedAt: "2026-10-30T00:00:00.000Z",
    });
    return (await matches.list()).map((save) => save.saveId);
  }, u);
  expect(result).toEqual(["auto:g"]);
});

test("bindings persist in IndexedDB, detect races and report a tampered record", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(async (moduleUrl) => {
    const persistence = (await import(moduleUrl)) as typeof import("../../packages/persistence/src/index.js");
    const name = `m4-binding-${crypto.randomUUID()}`;
    const clock = () => "2026-11-11T00:00:00.000Z";
    const first = persistence.createManagedMatchBindings(clock, name);
    // Opening the settings store through the match repository first proves the stores are shared, not forked.
    await new persistence.IndexedDbSaveRepository(name).setActiveSaveId(null);
    const input = { careerKind: "STANDARD" as const, careerSaveId: "career-1", matchGameId: "career-match-f1", matchId: "match-f1", fixtureId: "f1", seasonId: "s1", scheduleSha256: "a".repeat(64), careerStateSha256: "b".repeat(64), launch: { launchVersion: "x" } };
    await first.create(input);
    const reopened = persistence.createManagedMatchBindings(clock, name);
    const pending = (await reopened.pendingForCareer("career-1")).bindings.map((b) => b.fixtureId);
    await reopened.resolve("career-match-f1", "APPLIED", "RESULT_APPLIED");
    const status = (await first.get("career-match-f1"))?.status;
    // Tamper with the stored row directly and confirm it is reported, preserved and unusable.
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const row = await new Promise<{ key: string; value: Record<string, unknown> }>((resolve, reject) => { const request = store.get("managed-binding:career-match-f1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    store.put({ key: row.key, value: { ...row.value, status: "PENDING" } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    const listing = await reopened.list();
    let damagedError = "";
    try { await reopened.get("career-match-f1"); } catch (error) { damagedError = String(error); }
    return { pending, status, bindings: listing.bindings.length, damaged: listing.damaged, damagedError };
  }, urls().index);
  expect(result.pending).toEqual(["f1"]);
  expect(result.status).toBe("APPLIED");
  expect(result.bindings).toBe(0);
  expect(result.damaged).toEqual(["managed-binding:career-match-f1"]);
  expect(result.damagedError).toContain("BINDING_DAMAGED");
});
