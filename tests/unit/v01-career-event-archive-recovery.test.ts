import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
import {
  MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
  MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES,
  canonicalJson,
  type CompletedCareerMatchEventArchive,
  type NewGameWorldCopy,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type T20SeasonState,
} from "@lcxxvi/contracts";
import {
  createSeasonCheckpoint,
  createSeasonPortableArchive,
  describeSeasonPersistenceError,
  inspectSeasonCheckpoints,
  readSeasonPortableArchive,
  recoverSeasonCheckpoint,
  sealCompletedCareerMatchEventArchive,
  seasonSha256Text,
  validateCompletedCareerMatchEventArchive,
  type SeasonCheckpoint,
  type SeasonDurableCommit,
  type SeasonLoadResult,
} from "@lcxxvi/persistence";
import { replayCareerMatchEventArchive } from "@lcxxvi/simulation";
import { CareerApplicationService, type CareerSeasonRepository } from "../../apps/web/src/career/service.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { regenerateManagedResult } from "../../apps/web/src/match/managed-result.js";
import { UI_VERSION, type Action } from "../../apps/web/src/match/protocol.js";

class MultiGenMemorySeasonRepository implements CareerSeasonRepository {
  private games = new Map<
    string,
    {
      summary: SeasonSaveSummary;
      worldCopy: NewGameWorldCopy | null;
      checkpointSerial: number;
      checkpointGeneration: number;
      checkpoints: Map<number, SeasonCheckpoint>;
      eventArchives: Map<string, { payload: string; sha256: string }>;
    }
  >();
  private active: string | null = null;

  async list(): Promise<SeasonSaveSummary[]> {
    return [...this.games.values()].map((g) => g.summary);
  }
  async acquireLease(): Promise<boolean> {
    return true;
  }
  async releaseLease(): Promise<void> {}
  async activeSaveId(): Promise<string | null> {
    return this.active;
  }
  async clearActiveSaveId(saveId: string): Promise<void> {
    if (this.active === saveId) this.active = null;
  }

  async commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary> {
    const existing = this.games.get(input.saveId);
    const serial = (existing?.checkpointSerial ?? -1) + 1;
    const generation = serial % 3;
    const checkpoints = existing?.checkpoints ?? new Map<number, SeasonCheckpoint>();
    const eventArchives = existing?.eventArchives ?? new Map<string, { payload: string; sha256: string }>();
    if (input.copySource) {
      const src = this.games.get(input.copySource.saveId);
      if (src) {
        for (const [k, v] of src.eventArchives.entries()) eventArchives.set(k, { ...v });
      }
    }
    if (input.matchEventArchives?.length) {
      for (const archive of input.matchEventArchives) {
        const validated = await validateCompletedCareerMatchEventArchive(archive);
        const payload = canonicalJson(validated);
        eventArchives.set(validated.fixtureId, { payload, sha256: await seasonSha256Text(payload) });
      }
    }
    let totalBytes = 0;
    for (const row of eventArchives.values()) totalBytes += new TextEncoder().encode(row.payload).length;
    if (totalBytes > MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES) throw new Error("CAREER_MATCH_ARCHIVE_TOTAL_SIZE_EXCEEDED");

    const cp = await createSeasonCheckpoint({
      saveId: input.saveId,
      generation,
      checkpointSerial: serial,
      state: input.state,
      createdAt: input.updatedAt,
    });
    checkpoints.set(generation, cp);
    const summary: SeasonSaveSummary = {
      saveId: input.saveId,
      kind: input.kind,
      title: input.title,
      seasonId: input.state.seasonId,
      careerId: input.state.careerId,
      controlledTeamId: input.state.controlledTeamId,
      currentDate: input.state.careerState.currentDate,
      revision: input.state.revision,
      completedFixtures: input.state.completedMatches.length,
      phase: input.state.phase,
      stateSha256: input.state.stateSha256,
      updatedAt: input.updatedAt,
    };
    this.games.set(input.saveId, {
      summary,
      worldCopy: structuredClone(input.worldCopy ?? existing?.worldCopy ?? null),
      checkpointSerial: serial,
      checkpointGeneration: generation,
      checkpoints,
      eventArchives,
    });
    if (input.setActive !== false) this.active = input.saveId;
    return summary;
  }

  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const game = this.games.get(saveId);
    if (!game) return null;
    const rec = await recoverSeasonCheckpoint([...game.checkpoints.values()], game.checkpointSerial);
    return {
      summary: {
        ...game.summary,
        revision: rec.state.revision,
        completedFixtures: rec.state.completedMatches.length,
        currentDate: rec.state.careerState.currentDate,
        phase: rec.state.phase,
        stateSha256: rec.state.stateSha256,
        updatedAt: rec.recovered ? rec.checkpoint.createdAt : game.summary.updatedAt,
      },
      state: rec.state,
      recovered: rec.recovered,
      recoveredFromGeneration: rec.recovered ? rec.checkpoint.generation : null,
      corruptedGenerations: rec.corruptedGenerations,
      worldCopy: structuredClone(game.worldCopy),
    };
  }

  async loadMatchEventArchives(saveId: string, state?: T20SeasonState) {
    const game = this.games.get(saveId);
    if (!game) return { archives: [] as CompletedCareerMatchEventArchive[], damagedFixtureIds: [] as string[], totalBytes: 0 };
    const archives: CompletedCareerMatchEventArchive[] = [];
    const damagedFixtureIds: string[] = [];
    let totalBytes = 0;
    const completionByFixture = new Map(state?.completedMatches.map((c) => [c.fixtureId, c]) ?? []);
    for (const [fixtureId, row] of game.eventArchives.entries()) {
      totalBytes += new TextEncoder().encode(row.payload).length;
      if ((await seasonSha256Text(row.payload)) !== row.sha256) {
        damagedFixtureIds.push(fixtureId);
        continue;
      }
      try {
        const completion = state ? completionByFixture.get(fixtureId) : undefined;
        if (state && !completion) throw new Error(`UNKNOWN_FIXTURE:${fixtureId}`);
        const parsed = await validateCompletedCareerMatchEventArchive(JSON.parse(row.payload), completion);
        archives.push(parsed);
      } catch {
        damagedFixtureIds.push(fixtureId);
      }
    }
    if (totalBytes > MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES) throw new Error("CAREER_MATCH_ARCHIVE_TOTAL_SIZE_EXCEEDED");
    archives.sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
    return { archives, damagedFixtureIds: damagedFixtureIds.sort(), totalBytes };
  }

  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const game = this.games.get(saveId);
    if (!game) throw new Error("SEASON_SAVE_NOT_FOUND");
    return inspectSeasonCheckpoints({
      saveId,
      title: game.summary.title,
      currentSerial: game.checkpointSerial,
      currentGeneration: game.checkpointGeneration,
      rows: [...game.checkpoints.values()],
    });
  }

  async loadGeneration(saveId: string, generation: number): Promise<SeasonLoadResult> {
    const game = this.games.get(saveId);
    if (!game) throw new Error("SEASON_SAVE_NOT_FOUND");
    const row = game.checkpoints.get(generation);
    if (!row) throw new Error("SEASON_CHECKPOINT_NOT_FOUND");
    const rec = await recoverSeasonCheckpoint([row], row.checkpointSerial);
    return {
      summary: {
        ...game.summary,
        revision: rec.state.revision,
        completedFixtures: rec.state.completedMatches.length,
        currentDate: rec.state.careerState.currentDate,
        phase: rec.state.phase,
        stateSha256: rec.state.stateSha256,
        updatedAt: rec.checkpoint.createdAt,
      },
      state: rec.state,
      recovered: row.checkpointSerial !== game.checkpointSerial,
      recoveredFromGeneration: generation,
      corruptedGenerations: [],
      worldCopy: structuredClone(game.worldCopy),
    };
  }

  corruptCurrentCheckpoint(saveId: string): void {
    const game = this.games.get(saveId)!;
    const row = game.checkpoints.get(game.checkpointGeneration)!;
    game.checkpoints.set(game.checkpointGeneration, { ...row, payload: `${row.payload} ` });
  }

  corruptMatchEventArchive(saveId: string, fixtureId: string): void {
    const game = this.games.get(saveId)!;
    const row = game.eventArchives.get(fixtureId)!;
    game.eventArchives.set(fixtureId, { ...row, payload: `${row.payload} ` });
  }
}

describe("V01-018 completed career event archives and replay", () => {
  it("retains versioned completed-match event history, replays without recomputing, and round-trips via .lcxxvi", { timeout: 20_000 }, async () => {
    const repo = new MultiGenMemorySeasonRepository();
    const service = new CareerApplicationService("owner-1", repo);
    await service.createCareer("team-01");
    await service.simulateToNextUserFixture();
    await service.simulateManagedFixture();

    const state = service.getState()!;
    expect(state.completedMatches.length).toBeGreaterThanOrEqual(1);
    const firstCompletion = state.completedMatches[0]!;

    const replayed = await service.replayFixtureArchive(firstCompletion.fixtureId);
    expect(replayed.status).toBe("READY");
    if (replayed.status !== "READY") throw new Error("Expected READY replay");
    expect(replayed.archive.archiveVersion).toBe("LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1");
    if (replayed.archive.archiveVersion !== "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1") {
      throw new Error("Expected V1 archive");
    }
    expect(replayed.archive.fixtureId).toBe(firstCompletion.fixtureId);
    expect(replayed.replay.scorecard).toEqual(firstCompletion.scorecard);
    expect(replayed.replay.eventCount).toBe(replayed.archive.eventCount);

    const directReplay = replayCareerMatchEventArchive(replayed.archive, worldBytes, worldManifest, firstCompletion);
    expect(directReplay.finalEventHash).toBe(replayed.archive.finalEventHash);

    const archiveBytes = await service.exportCareer();
    const repo2 = new MultiGenMemorySeasonRepository();
    const service2 = new CareerApplicationService("owner-2", repo2);
    await service2.importCareer(archiveBytes);
    const importedReplay = await service2.replayFixtureArchive(firstCompletion.fixtureId);
    expect(importedReplay.status).toBe("READY");
    if (importedReplay.status === "READY") {
      expect(importedReplay.replay.finalEventHash).toBe(replayed.replay.finalEventHash);
      expect(importedReplay.replay.scorecard).toEqual(firstCompletion.scorecard);
    }
  });

  it("preserves existing v1 careers without silent migration and bounds event archive sizes with explicit recovery", { timeout: 20_000 }, async () => {
    const repo = new MultiGenMemorySeasonRepository();
    const service = new CareerApplicationService("owner-v1", repo);
    const created = await service.createCareer("team-01");
    const saveId = service.getSaveId()!;

    // Existing v1 career with zero event archives exports as LC_T20_SEASON_PORTABLE_V1 unchanged.
    const v1Loaded = await repo.load(saveId);
    expect(v1Loaded).not.toBeNull();
    const v1Bytes = await createSeasonPortableArchive(v1Loaded!.state, v1Loaded!.summary, "2027-01-03T00:00:00.000Z");
    const v1Read = await readSeasonPortableArchive(v1Bytes);
    expect(v1Read.manifest.archiveVersion).toBe("LC_T20_SEASON_PORTABLE_V1");
    expect(v1Read.state.stateSha256).toBe(created.stateSha256);

    // Simulate one fixture so an event archive exists, then verify oversize rejection and damaged-archive isolation.
    await service.simulateToNextUserFixture();
    await service.simulateManagedFixture();
    const afterMatch = service.getState()!;
    if (afterMatch.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
      throw new Error("Expected single-season V1 state");
    }
    const completion = afterMatch.completedMatches[0]!;
    const loadedArchives = await repo.loadMatchEventArchives(saveId, afterMatch);
    expect(loadedArchives.archives.length).toBeGreaterThanOrEqual(1);
    expect(loadedArchives.totalBytes).toBeLessThanOrEqual(MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES);

    const sampleArchive = loadedArchives.archives.find((entry) => entry.fixtureId === completion.fixtureId)!;
    await expect(
      validateCompletedCareerMatchEventArchive({ ...sampleArchive, byteLength: MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES + 1 }, completion),
    ).rejects.toThrow();

    // Corrupting one stored event archive isolates damage to that fixture without corrupting the season save.
    repo.corruptMatchEventArchive(saveId, completion.fixtureId);
    const isolated = await repo.loadMatchEventArchives(saveId, afterMatch);
    expect(isolated.damagedFixtureIds).toContain(completion.fixtureId);
    const damagedReplay = await service.replayFixtureArchive(completion.fixtureId);
    expect(damagedReplay.status).toBe("DAMAGED");
    const stillLoadable = await repo.load(saveId);
    expect(stillLoadable?.state.stateSha256).toBe(afterMatch.stateSha256);

    // Sealed archive helper also rejects tampered event payloads.
    const tamperedEvents = sampleArchive.events.map((ev, idx) => (idx === 0 ? { ...ev, type: "TAMPERED" } : ev));
    await expect(
      sealCompletedCareerMatchEventArchive({
        completion,
        setupRequest: sampleArchive.setupRequest,
        eventChain: sampleArchive.eventChain,
        events: tamperedEvents,
      }),
    ).rejects.toThrow();
  });

  it("rehydrates completed live USER_MATCH sessions into sealed event archives and replays identically", { timeout: 30_000 }, async () => {
    const repo = new MultiGenMemorySeasonRepository();
    const service = new CareerApplicationService("owner-user-match", repo);
    await service.createCareer("team-01");
    await service.simulateToNextUserFixture();
    const launch = await service.prepareUserMatch();

    const controller = createMatchController(worldBytes, worldManifest, () => "unused-live-seed");
    let serial = 0;
    let response = controller.handle({
      version: UI_VERSION,
      requestId: `ui-${++serial}`,
      expectedRevision: 0,
      type: "BOOT",
      careerFixture: launch,
    });
    const send = (body: object) => {
      response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: response.revision, ...body } as never);
      expect(response.error).toBeNull();
    };
    send({ type: "START", format: "T20", selections: launch.selections, groundId: launch.groundId, careerFixture: launch });
    const act = (action: Action) => {
      const view = response.view!;
      const innings = view.innings[view.activeIndex]?.innings;
      const teamId = "teamId" in action.payload ? action.payload.teamId : innings?.bowlingTeamId;
      send({
        type: "COMMAND",
        origin: "HUMAN",
        command: { ...action, commandId: `ui-${serial + 1}`, expectedRevision: response.revision, actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${teamId}` },
      });
    };
    for (let steps = 0; response.view!.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(2000);
      const view = response.view!;
      if (view.phase === "TOSS") act({ kind: "CALL_TOSS", payload: { teamId: view.decisionTeamId!, call: "HEADS" } });
      else if (view.phase === "AWAITING_INNINGS") act({ kind: "CHOOSE_INNINGS", payload: { teamId: view.decisionTeamId!, choice: "BAT" } });
      else if (view.phase === "AWAITING_BATTER") act({ kind: "SET_BATTER", payload: { teamId: view.decisionTeamId!, playerId: view.candidates.find((p) => !p.reason)!.id } });
      else if (view.phase === "AWAITING_BOWLER") act({ kind: "SET_BOWLER", payload: { teamId: view.decisionTeamId!, bowlerId: view.candidates.find((p) => !p.reason)!.id } });
      else act({ kind: "ADVANCE", payload: { scope: "OVER" } });
    }
    const session = JSON.parse(JSON.stringify(controller.snapshot())) as unknown;
    const rebuilt = regenerateManagedResult({ session }, launch, worldBytes, worldManifest);
    expect(rebuilt.complete).toBe(true);
    if (!rebuilt.complete || !rebuilt.careerResult) throw new Error("Expected complete careerResult");

    await service.completeUserMatch(rebuilt.careerResult, rebuilt.t20Session);
    const userReplay = await service.replayFixtureArchive(launch.fixtureId);
    expect(userReplay.status).toBe("READY");
    if (userReplay.status === "READY") {
      expect(userReplay.archive.source).toBe("USER_MATCH");
      expect(userReplay.replay.scorecard).toEqual(rebuilt.careerResult.scorecard);
    }
  });
});

describe("V01-019 career save and recovery usability", () => {
  it("retains corrupted originals, offers validated older generations, and explains persistence errors clearly", async () => {
    const repo = new MultiGenMemorySeasonRepository();
    const service = new CareerApplicationService("owner-19", repo);
    const gen0 = await service.createCareer("team-01");
    const originalSaveId = service.getSaveId()!;
    await service.setTraining("p001", "BATTING_PRACTICE");
    const gen1 = service.getState()!;
    await service.setTraining("p002", "BOWLING_PRACTICE");

    // Corrupt the newest checkpoint (generation 2 / revision 2).
    repo.corruptCurrentCheckpoint(originalSaveId);

    const inspection = await service.inspectCareerCheckpoints(originalSaveId);
    expect(inspection.corruptedGenerations).toEqual([2]);
    expect(inspection.validGenerations.map((g) => g.revision)).toEqual([gen1.revision, gen0.revision]);

    // Choose the older generation (gen0) explicitly while retaining the damaged original slot untouched.
    const recoveredState = await service.recoverCareerFromGeneration(originalSaveId, 0, "Recovered Baseline");
    expect(recoveredState.stateSha256).toBe(gen0.stateSha256);
    expect(service.getSaveId()).not.toBe(originalSaveId);

    // Original slot still retains its corrupted generation 2 untouched.
    const originalCheck = await repo.inspectCheckpoints(originalSaveId);
    expect(originalCheck.corruptedGenerations).toEqual([2]);

    // Error descriptions explain lock, corruption and archive issues in plain English.
    const readOnlyHelp = describeSeasonPersistenceError(new Error("SEASON_SAVE_READ_ONLY"));
    expect(readOnlyHelp.summary).toMatch(/another tab/i);
    expect(readOnlyHelp.code).toBe("SEASON_SAVE_READ_ONLY");
    const corruptHelp = describeSeasonPersistenceError(new Error("SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT"));
    expect(corruptHelp.summary).toMatch(/valid checkpoint/i);
  });
});
