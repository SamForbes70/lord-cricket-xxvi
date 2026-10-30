import { IndexedDbSeasonRepository, sealT20SeasonState, seasonSha256Text } from "@lcxxvi/persistence";
import { canonicalJson, WorldPackSchema, type T20SeasonState } from "@lcxxvi/contracts";
import originalWorld from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";

declare global {
  interface Window {
    runSeasonPersistenceBrowser?: (state: T20SeasonState) => Promise<unknown>;
  }
}

function coreWithRevision(state: T20SeasonState, revision: number) {
  const { stateSha256: _hash, ...core } = state;
  void _hash;
  return { ...core, revision };
}

window.runSeasonPersistenceBrowser = async (rawState: T20SeasonState) => {
  const databaseName = "lcxxvi-m6f-season-browser-v1";
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  const repo = new IndexedDbSeasonRepository(databaseName);
  const owner = "browser-owner-a";
  const secondOwner = "browser-owner-b";
  const acquired = await repo.acquireLease("season-browser-save", owner, 1000);
  if (!acquired) throw new Error("BROWSER_LEASE_INITIAL_FAILED");
  const state4 = await sealT20SeasonState(coreWithRevision(rawState, 4));
  const state5 = await sealT20SeasonState(coreWithRevision(rawState, 5));
  const state6 = await sealT20SeasonState(coreWithRevision(rawState, 6));
  const state7 = await sealT20SeasonState(coreWithRevision(rawState, 7));
  const base = {
    saveId: "season-browser-save",
    kind: "AUTO" as const,
    title: "Browser Season",
    ownerId: owner,
    setActive: true,
  };
  await repo.commit({ ...base, expectedRevision: null, state: state4, command: null, now: 1001, updatedAt: "2026-10-05T10:01:00.000Z" });
  await repo.commit({ ...base, expectedRevision: 4, state: state5, command: { commandId: "cmd-5", requestCanonical: "{\"op\":5}", responseJson: "{\"ok\":true}", committedRevision: 5 }, now: 1002, updatedAt: "2026-10-05T10:02:00.000Z" });
  await repo.commit({ ...base, expectedRevision: 5, state: state6, command: { commandId: "cmd-6", requestCanonical: "{\"op\":6}", responseJson: "{\"ok\":true}", committedRevision: 6 }, now: 1003, updatedAt: "2026-10-05T10:03:00.000Z" });
  const beforeAbort = await repo.load("season-browser-save");
  let abortCode = "";
  try {
    await repo.commit({ ...base, expectedRevision: 6, state: state7, command: { commandId: "cmd-7", requestCanonical: "{\"op\":7}", responseJson: "{\"ok\":true}", committedRevision: 7 }, now: 1004, updatedAt: "2026-10-05T10:04:00.000Z", testAbortAfterWrites: true });
  } catch (error) { abortCode = String(error); }
  const afterAbort = await repo.load("season-browser-save");
  let duplicateCode = "";
  try {
    await repo.commit({ ...base, expectedRevision: 6, state: state7, command: { commandId: "cmd-6", requestCanonical: "{\"op\":6}", responseJson: "{\"ok\":true}", committedRevision: 7 }, now: 1005, updatedAt: "2026-10-05T10:05:00.000Z" });
  } catch (error) { duplicateCode = String(error); }
  const locked = await repo.acquireLease("season-browser-save", secondOwner, 1006);
  await repo.corruptCurrentCheckpoint("season-browser-save");
  const recovered = await repo.load("season-browser-save");
  const summaries = await repo.list();
  const activeSaveId = await repo.activeSaveId();
  await repo.releaseLease("season-browser-save", owner);
  const acquiredAfterRelease = await repo.acquireLease("season-browser-save", secondOwner, 1007);
  const world = WorldPackSchema.parse(originalWorld);
  const edited = structuredClone(world);
  edited.teams[0]!.name = "Harbour XI";
  const copy = createNewGameWorldCopy(edited, world);
  const copyHash = await seasonSha256Text(canonicalJson(copy));
  const copySave = { ...base, saveId: "season-world-copy", setActive: false };
  await repo.acquireLease(copySave.saveId, owner, 1010);
  let copyAbort = "";
  try {
    await repo.commit({ ...copySave, expectedRevision: null, state: state4, command: null, worldCopy: copy, now: 1011, updatedAt: "2026-10-05T10:11:00.000Z", testAbortAfterWrites: true });
  } catch (error) { copyAbort = String(error); }
  const afterCopyAbort = await repo.load(copySave.saveId);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const orphanPack = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction("worldPacks", "readonly").objectStore("worldPacks").get(copyHash);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  await repo.commit({ ...copySave, expectedRevision: null, state: state4, command: null, worldCopy: copy, now: 1012, updatedAt: "2026-10-05T10:12:00.000Z" });
  let missingCopyCode = "";
  try {
    await repo.commit({ ...copySave, expectedRevision: 4, state: state5, command: null, now: 1013, updatedAt: "2026-10-05T10:13:00.000Z" });
  } catch (error) { missingCopyCode = String(error); }
  const changed = structuredClone(world);
  changed.teams[0]!.name = "Another name";
  let immutableCode = "";
  try {
    await repo.commit({ ...copySave, expectedRevision: 4, state: state5, command: null, worldCopy: createNewGameWorldCopy(changed, world), now: 1013, updatedAt: "2026-10-05T10:13:00.000Z" });
  } catch (error) { immutableCode = String(error); }
  await repo.commit({ ...copySave, expectedRevision: 4, state: state5, command: null, worldCopy: copy, now: 1014, updatedAt: "2026-10-05T10:14:00.000Z" });
  await repo.corruptCurrentCheckpoint(copySave.saveId);
  const recoveredCopy = await repo.load(copySave.saveId);
  const corruptDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = corruptDb.transaction("worldPacks", "readwrite");
    const store = tx.objectStore("worldPacks");
    const request = store.get(copyHash);
    request.onsuccess = () => store.put({ ...request.result, payload: `${String(request.result.payload)} ` });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  corruptDb.close();
  let damagedCopyCode = "";
  try { await repo.load(copySave.saveId); } catch (error) { damagedCopyCode = String(error); }
  let damagedCopyCommitCode = "";
  try {
    await repo.commit({ ...copySave, expectedRevision: 5, state: state6, command: null, worldCopy: copy, now: 1015, updatedAt: "2026-10-05T10:15:00.000Z" });
  } catch (error) { damagedCopyCommitCode = String(error); }
  return {
    acquired,
    beforeAbortRevision: beforeAbort?.state.revision,
    abortCode,
    afterAbortRevision: afterAbort?.state.revision,
    duplicateCode,
    secondOwnerWhileLocked: locked,
    recovered: recovered?.recovered,
    recoveredRevision: recovered?.state.revision,
    recoveredGeneration: recovered?.recoveredFromGeneration,
    corruptedGenerations: recovered?.corruptedGenerations,
    summaryCount: summaries.length,
    activeSaveId,
    acquiredAfterRelease,
    copyAbort,
    copySaveAfterAbort: afterCopyAbort,
    orphanPackAfterAbort: orphanPack ?? null,
    immutableCode,
    missingCopyCode,
    copyRecovered: recoveredCopy?.recovered,
    copyRecoveredRevision: recoveredCopy?.state.revision,
    copyRecoveredTeam: recoveredCopy?.worldCopy?.world.teams[0]?.name,
    damagedCopyCode,
    damagedCopyCommitCode,
  };
};
