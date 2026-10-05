import { IndexedDbSeasonRepository, sealT20SeasonState } from "@lcxxvi/persistence";
import type { T20SeasonState } from "@lcxxvi/contracts";

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
  };
};
