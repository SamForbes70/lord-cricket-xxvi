import { expect, test } from "@playwright/test";
import path from "node:path";

test("roster match saves commit atomically and recover with their original pack", async ({ page }) => {
  await page.goto("/#exhibition");
  const paths = {
    persistence: `/@fs/${path.resolve("packages/persistence/src/index.ts")}`,
    contracts: `/@fs/${path.resolve("packages/contracts/src/index.ts")}`,
    simulation: `/@fs/${path.resolve("packages/simulation/src/index.ts")}`,
    world: `/@fs/${path.resolve("packages/data/worlds/fictional-eight-01.json")}`,
  };
  const result = await page.evaluate(async urls => {
    const persistence = await import(urls.persistence) as typeof import("../../packages/persistence/src/index.js");
    const contracts = await import(urls.contracts) as typeof import("../../packages/contracts/src/index.js");
    const simulation = await import(urls.simulation) as typeof import("../../packages/simulation/src/index.js");
    const world = contracts.WorldPackSchema.parse(await fetch(urls.world).then(response => response.json()));
    const players = world.players.map(player => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    const pack = simulation.createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "test", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const teams = pack.world.teams.slice(0, 2).map(team => {
      const squad = team.squadIds.map(id => pack.world.players.find(player => player.playerId === id)!);
      const keeper = squad.find(player => player.role === "KEEPER")!;
      const bowlers = squad.filter(player => player.bowlingStyle && ["BOWLER", "ALLROUNDER"].includes(player.role)).slice(0, 5);
      const xi = [keeper, ...bowlers, ...squad.filter(player => player !== keeper && !bowlers.includes(player))].slice(0, 11);
      return { teamId: team.teamId, playerIds: xi.map(player => player.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
    });
    const first = simulation.createRosterT20Session(pack, { gameId: "roster-game", matchId: "roster-match", seed: "seed", format: "T20", selection: { groundId: pack.world.grounds[0]!.groundId, teams } });
    const name = `roster-save-${crypto.randomUUID()}`;
    const repo = new persistence.IndexedDbSaveRepository(name);
    const now = Date.now();
    await repo.acquireLease("match", "owner", now);
    const base = { saveId: "match", kind: "AUTO" as const, title: "Roster match", expectedRevision: null, session: first, revision: 0, events: first.events, command: null,
      metadata: { matchGameId: first.setup.gameId, matchId: first.setup.matchId, teams: [first.setup.teams[0].name, first.setup.teams[1].name] as [string, string], ground: first.setup.ground.name, phase: first.core.phase, completed: false },
      rosterPack: pack, ownerId: "owner", now, updatedAt: "2026-10-30T00:00:00.000Z" };
    let abort = "";
    try { await repo.commit({ ...base, testAbortAfterWrites: true }); } catch (error) { abort = String(error); }
    const empty = await repo.load("match");
    const checkDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const orphan = await new Promise<unknown>((resolve, reject) => {
      const request = checkDb.transaction("worldPacks", "readonly").objectStore("worldPacks").get(first.setup.rosterPackHash);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    checkDb.close();
    await repo.commit(base);
    const second = simulation.executeRosterT20Command(first, { commandId: "confirm", expectedRevision: 0, actorId: "SYSTEM", kind: "CONFIRM_TEAMS", payload: {} }).session;
    const saved = await repo.commit({ ...base, expectedRevision: 0, revision: second.revision, events: second.events, session: second });
    const pins = { engine: second.executionManifest.engine, eventChain: second.executionManifest.eventChain,
      random: second.setup.versions.random, model: second.setup.versions.model, modelHash: second.setup.versions.modelHash,
      rules: second.setup.versions.rules, rulesHash: second.setup.versions.rulesHash, worldHash: second.setup.versions.worldHash };
    const archiveBytes = await persistence.createPortableArchive(second, saved, pins, base.updatedAt, null, pack);
    const imported = await persistence.readPortableArchive(archiveBytes, pins);
    const journal = { version: "LC_DELEGATION_JOURNAL_V1", changes: [{ commandId: "delegate", expectedRevision: 0, matchRevision: second.revision, teamId: second.setup.teams[0].teamId, categories: ["BOWLER"] }] };
    const withDelegation = await persistence.readPortableArchive(await persistence.createPortableArchive(second, saved, pins, base.updatedAt, null, pack, journal), pins);
    const importedSession = simulation.rehydrateRosterT20Session(imported.session, imported.rosterPack!);
    const target = new persistence.IndexedDbSaveRepository(`${name}-import`);
    await target.acquireLease("import", "owner", now);
    await target.commit({ ...base, saveId: "import", kind: "IMPORTED", session: importedSession,
      revision: importedSession.revision, events: importedSession.events, rosterPack: imported.rosterPack });
    const reopened = await target.load("import");
    const reopenedSession = simulation.rehydrateRosterT20Session(reopened!.session, reopened!.rosterPack!);
    let missing = "";
    try { await repo.commit({ ...base, expectedRevision: 1, revision: 2, rosterPack: null }); } catch (error) { missing = String(error); }
    await repo.corruptCurrentCheckpoint("match");
    const recovered = await repo.load("match");
    const restored = simulation.rehydrateRosterT20Session(recovered!.session, recovered!.rosterPack!);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("worldPacks", "readwrite");
    transaction.objectStore("worldPacks").delete(first.setup.rosterPackHash);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
    let damaged = "";
    try { await repo.load("match"); } catch (error) { damaged = String(error); }
    let damagedWrite = "";
    try { await repo.commit({ ...base, expectedRevision: 1, revision: 2, session: second, events: second.events }); } catch (error) { damagedWrite = String(error); }
    return { abort, empty, orphan: orphan ?? null, importedRevision: reopenedSession.revision, importedHash: reopenedSession.lastEventHash, expectedHash: second.lastEventHash, missing, recovered: recovered?.recovered, revision: restored.revision, damaged, damagedWrite, delegationMatches: JSON.stringify(withDelegation.delegationJournal) === JSON.stringify(journal), delegationVersion: withDelegation.manifest.archiveVersion };
  }, paths);
  expect(result.abort).toContain("SAVE_INJECTED_ABORT");
  expect(result.empty).toBeNull();
  expect(result.orphan).toBeNull();
  expect(result.importedRevision).toBe(1);
  expect(result.delegationMatches).toBe(true);
  expect(result.delegationVersion).toBe("LC_ARCHIVE_V4_DELEGATION");
  expect(result.importedHash).toBe(result.expectedHash);
  expect(result.missing).toContain("SAVE_ROSTER_REQUIRED");
  expect(result.recovered).toBe(true);
  expect(result.revision).toBe(0);
  expect(result.damaged).toContain("SAVE_ROSTER_MISSING_OR_DAMAGED");
  expect(result.damagedWrite).toContain("SAVE_ROSTER_MISSING");
});
