/** Collects browser storage timings after a full default-world season in an isolated profile. */
import { IndexedDbSeasonRepository, sealT20SeasonState } from "@lcxxvi/persistence";
import type { T20SeasonState } from "@lcxxvi/contracts";
type EngineResult = { ok: true; t20Ms: number[]; red5Ms: number[]; leagueMs: number; eventHashes: string[]; state: T20SeasonState };
declare global { interface Window { runReferenceEngineProbe: () => Promise<unknown> } }
window.runReferenceEngineProbe = async () => {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  const result = await new Promise<EngineResult>((resolve, reject) => {
    worker.onerror = event => reject(new Error(event.message));
    worker.onmessage = event => event.data.ok ? resolve(event.data) : reject(new Error(event.data.error));
    worker.postMessage({ kind: "RUN_REFERENCE_PROBE" });
  }).finally(() => worker.terminate());
  const repo = new IndexedDbSeasonRepository("lcxxvi-acceptance-performance-only"), owner = "acceptance-owner", saveId = "acceptance-save";
  if (!await repo.acquireLease(saveId, owner, 1000)) throw new Error("BENCHMARK_LEASE");
  const saveMs: number[] = [], loadMs: number[] = [];
  let revision: number | null = null, finalHash = "";
  try {
    for (let sample = 0; sample < 20; sample++) {
      const { stateSha256: _, ...core } = result.state; void _;
      const state = await sealT20SeasonState({ ...core, revision: 56 + sample });
      const began = performance.now();
      await repo.commit({ saveId, kind: "AUTO", title: "Acceptance benchmark", ownerId: owner, expectedRevision: revision, state, command: null, now: 1001 + sample, updatedAt: "2026-10-28T00:00:00.000Z", setActive: true });
      saveMs.push(performance.now() - began); revision = state.revision;
      const loadBegan = performance.now(), active = await repo.activeSaveId(), loaded = await repo.load(active!);
      loadMs.push(performance.now() - loadBegan);
      if (loaded?.state.stateSha256 !== state.stateSha256) throw new Error("BENCHMARK_LOAD_HASH");
      finalHash = state.stateSha256;
    }
  } finally { await repo.releaseLease(saveId, owner); }
  return { t20Ms: result.t20Ms, red5Ms: result.red5Ms, leagueMs: result.leagueMs, eventHashes: result.eventHashes,
    completedFixtures: result.state.completedMatches.length, saveMs, loadMs, finalHash,
    memoryScope: "Main-window JavaScript heap excludes workers and native allocations; total application memory remains unmeasured." };
};
