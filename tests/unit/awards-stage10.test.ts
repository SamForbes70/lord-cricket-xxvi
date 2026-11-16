import { describe, expect, it } from "vitest";
import {
  AWARDS_LEDGER_VERSION,
  AWARDS_MODEL_VERSION,
  CareerAwardsLedgerSchema,
  canonicalJson,
  type CareerAwardsLedger,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";
import {
  computeMatchAward,
  computeSeasonAwards,
  createEmptyCareerAwardsLedger,
  reconcileCareerAwardsLedger,
  recordMatchAwardIdempotent,
  recordSeasonAwardsIdempotent,
  type AnyMatchScorecard,
} from "@lcxxvi/projections";
import {
  createPersistentWorldPortableArchiveV3,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV3,
  validateAnyCareerMatchEventArchive,
  validateAnyPersistentWorldState,
  validateCompletedCareerMatchEventArchive,
  validateStoredWorldCopy,
  validateT20SeasonState,
  type AnyCareerMatchEventArchive,
  type PersistentWorldDurableCommit,
  type PersistentWorldLoadResult,
  type SeasonDurableCommit,
  type SeasonLoadResult,
} from "@lcxxvi/persistence";
import {
  CareerApplicationService,
  careerWorld,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";
import { createNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";

class InMemorySeasonRepo implements CareerSeasonRepository {
  private activeId: string | null = null;
  private readonly leases = new Map<string, string>();
  private readonly slots = new Map<string, { summary: SeasonSaveSummary; worldCopy: NewGameWorldCopy | null; stateJson: string; archives: Map<string, AnyCareerMatchEventArchive>; awards: CareerAwardsLedger | null }>();
  async list() { return [...this.slots.values()].map((s) => s.summary); }
  async activeSaveId() { return this.activeId; }
  async setActiveSaveId(id: string) { this.activeId = id; }
  async clearActiveSaveId(id: string) { if (this.activeId === id) this.activeId = null; }
  async acquireLease(id: string, owner: string) { const cur = this.leases.get(id); if (cur && cur !== owner) return false; this.leases.set(id, owner); return true; }
  async releaseLease(id: string, owner: string) { if (this.leases.get(id) === owner) this.leases.delete(id); }
  async commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary> {
    const state = await validateT20SeasonState(input.state);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : null;
    const existing = this.slots.get(input.saveId);
    const archives = new Map(existing?.archives ?? []);
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateCompletedCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    const summary: SeasonSaveSummary = {
      saveId: input.saveId, kind: input.kind, title: input.title, seasonId: state.seasonId, careerId: state.careerId,
      controlledTeamId: state.controlledTeamId, currentDate: state.careerState.currentDate, revision: state.revision,
      completedFixtures: state.completedMatches.length, phase: state.phase, stateSha256: state.stateSha256, updatedAt: input.updatedAt,
    };
    this.slots.set(input.saveId, { summary, worldCopy, stateJson: canonicalJson(state), archives, awards: existing?.awards ?? null });
    if (input.setActive !== false) this.activeId = input.saveId;
    return summary;
  }
  async load(id: string): Promise<SeasonLoadResult | null> {
    const slot = this.slots.get(id); if (!slot) return null;
    return { summary: slot.summary, state: await validateT20SeasonState(JSON.parse(slot.stateJson)), recovered: false, recoveredFromGeneration: null, corruptedGenerations: [], worldCopy: slot.worldCopy };
  }
  async loadMatchEventArchives(id: string) {
    const archives = [...(this.slots.get(id)?.archives.values() ?? [])].filter((a): a is Extract<AnyCareerMatchEventArchive, { archiveVersion: "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1" }> => a.archiveVersion === "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1");
    return { archives, damagedFixtureIds: [], totalBytes: 0 };
  }
  async loadAwardsLedger(id: string) { return this.slots.get(id)?.awards ?? null; }
  async saveAwardsLedger(id: string, ledger: CareerAwardsLedger) {
    const valid = CareerAwardsLedgerSchema.parse(ledger);
    const slot = this.slots.get(id); if (slot) slot.awards = valid;
    return valid;
  }
  async inspectCheckpoints(id: string): Promise<SeasonCheckpointInspection> { return { saveId: id, title: this.slots.get(id)!.summary.title, currentGeneration: 0, currentSerial: 0, validGenerations: [], corruptedGenerations: [] }; }
  async loadGeneration(id: string) { return (await this.load(id))!; }
}

class InMemoryPersistentWorldRepo implements CareerPersistentWorldRepository {
  private readonly leases = new Map<string, string>();
  private readonly slots = new Map<string, { summary: PersistentWorldSaveSummary; worldCopy: NewGameWorldCopy | null; commands: Map<string, string>; stateJson: string; archives: Map<string, AnyCareerMatchEventArchive>; awards: CareerAwardsLedger | null }>();
  constructor(private readonly seasonRepo: InMemorySeasonRepo) {}
  async recordTypeOf(id: string) { return this.slots.has(id) ? PERSISTENT_WORLD_RECORD_TYPE : null; }
  async list() { return [...this.slots.values()].map((s) => s.summary); }
  async activeSaveId() { return this.seasonRepo.activeSaveId(); }
  async clearActiveSaveId(id: string) { await this.seasonRepo.clearActiveSaveId(id); }
  async acquireLease(id: string, owner: string) { const cur = this.leases.get(id); if (cur && cur !== owner) return false; this.leases.set(id, owner); return true; }
  async releaseLease(id: string, owner: string) { if (this.leases.get(id) === owner) this.leases.delete(id); }
  async commit(input: PersistentWorldDurableCommit) {
    const existing = this.slots.get(input.saveId);
    if (input.command && existing?.commands.has(input.command.commandId)) return { summary: existing.summary, idempotentReplay: true };
    const state = await validateAnyPersistentWorldState(input.state);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : existing?.worldCopy ?? null;
    const archives = new Map(existing?.archives ?? []);
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateAnyCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    const commands = new Map(existing?.commands ?? []);
    if (input.command) commands.set(input.command.commandId, input.command.requestCanonical);
    const summary: PersistentWorldSaveSummary = {
      saveId: input.saveId, kind: input.kind, title: input.title, worldId: state.worldIdentity.worldId, careerId: state.careerId,
      controlledTeamId: state.controlledTeamId, currentSeasonNumber: state.currentSeasonNumber, currentCalendarYear: state.currentCalendarYear,
      completedSeasonCount: state.completedSeasons.length, seasonId: state.currentSeason.seasonId, currentDate: state.currentSeason.careerState.currentDate,
      revision: state.revision, completedFixtures: state.currentSeason.completedMatches.length, phase: state.currentSeason.phase,
      stateSha256: state.stateSha256, updatedAt: input.updatedAt,
    };
    this.slots.set(input.saveId, { summary, worldCopy, commands, stateJson: canonicalJson(state), archives, awards: existing?.awards ?? null });
    if (input.setActive !== false) await this.seasonRepo.setActiveSaveId(input.saveId);
    return { summary, idempotentReplay: false };
  }
  async load(id: string): Promise<PersistentWorldLoadResult | null> {
    const slot = this.slots.get(id); if (!slot) return null;
    return { summary: slot.summary, state: await validateAnyPersistentWorldState(JSON.parse(slot.stateJson)), recovered: false, recoveredFromGeneration: null, corruptedGenerations: [], worldCopy: slot.worldCopy };
  }
  async loadMatchEventArchives(id: string) { return { archives: [...(this.slots.get(id)?.archives.values() ?? [])], damagedFixtureIds: [], totalBytes: 0 }; }
  async loadAwardsLedger(id: string) { return this.slots.get(id)?.awards ?? null; }
  async saveAwardsLedger(id: string, ledger: CareerAwardsLedger) {
    const valid = CareerAwardsLedgerSchema.parse(ledger);
    const slot = this.slots.get(id); if (slot) slot.awards = valid;
    return valid;
  }
  async inspectCheckpoints(id: string): Promise<SeasonCheckpointInspection> { return { saveId: id, title: this.slots.get(id)!.summary.title, currentGeneration: 0, currentSerial: 0, validGenerations: [], corruptedGenerations: [] }; }
  async loadGeneration(id: string) { return (await this.load(id))!; }
}

function makeSyntheticCompletion(input: { fixtureId: string; matchId: string; ordinal: number; round: number; homeTeamId: string; awayTeamId: string; winnerTeamId: string; homeBatting: Record<string, { runs: number; ballsFaced: number; fours: number; sixes: number; dismissed: boolean }>; awayBatting: Record<string, { runs: number; ballsFaced: number; fours: number; sixes: number; dismissed: boolean }>; homeBowling: Record<string, { legalBalls: number; runsConceded: number; wickets: number; maidens: number }>; awayBowling: Record<string, { legalBalls: number; runsConceded: number; wickets: number; maidens: number }>; hashChar: string }): T20SeasonMatchCompletion {
  const pad = (ids: string[], pfx: string) => { const r = [...ids]; while (r.length < 11) r.push(`${pfx}-${r.length}`); return r.slice(0, 11); };
  const h = pad(Object.keys(input.homeBatting), "ph"); const a = pad(Object.keys(input.awayBatting), "pa");
  const hRuns = Object.values(input.homeBatting).reduce((s, x) => s + x.runs, 0);
  const aRuns = Object.values(input.awayBatting).reduce((s, x) => s + x.runs, 0);
  return {
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1", seasonId: "season-synth", scheduleSha256: input.hashChar.repeat(64),
    fixtureId: input.fixtureId, matchId: input.matchId, fixtureOrdinal: input.ordinal, roundNumber: input.round,
    matchDayDate: `2027-04-${String(input.round).padStart(2, "0")}`, homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId, source: "OFFSCREEN",
    selectedTeams: [{ teamId: input.homeTeamId, playerIds: h, captainId: h[0]!, keeperId: h[1]! }, { teamId: input.awayTeamId, playerIds: a, captainId: a[0]!, keeperId: a[1]! }],
    scorecard: {
      matchId: input.matchId,
      innings: [
        { battingTeamId: input.homeTeamId, bowlingTeamId: input.awayTeamId, runs: hRuns, wickets: 5, legalBalls: 120, overs: "20.0", extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 }, batting: input.homeBatting, bowling: input.awayBowling, fallOfWickets: [], targetToWin: null },
        { battingTeamId: input.awayTeamId, bowlingTeamId: input.homeTeamId, runs: aRuns, wickets: 6, legalBalls: 120, overs: "20.0", extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 }, batting: input.awayBatting, bowling: input.homeBowling, fallOfWickets: [], targetToWin: hRuns + 1 },
      ],
      result: { kind: "WIN", winnerTeamId: input.winnerTeamId, marginType: "RUNS", marginRuns: Math.abs(hRuns - aRuns) || 1, marginWickets: null, completionReason: "COMPLETED" },
    },
    scorecardSha256: input.hashChar.repeat(64), sourceCompletionSha256: input.hashChar.repeat(64),
  };
}

describe("Stage 10 — Match and season awards (S10-01)", () => {
  it("computes transparent Player of the Match across T20, ODI, and RED_BALL including losing-side winners and NO_RESULT gating", () => {
    const scorecardBase: AnyMatchScorecard = {
      matchId: "m-t20-1",
      innings: [
        {
          battingTeamId: "team-a", bowlingTeamId: "team-b", runs: 165, wickets: 7, legalBalls: 120, overs: "20.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: { pA1: { runs: 108, ballsFaced: 54, fours: 10, sixes: 6, dismissed: false }, pA2: { runs: 22, ballsFaced: 22, fours: 2, sixes: 0, dismissed: true } },
          bowling: { pB1: { legalBalls: 24, runsConceded: 28, wickets: 2, maidens: 0 } },
          fallOfWickets: [], targetToWin: null,
        },
        {
          battingTeamId: "team-b", bowlingTeamId: "team-a", runs: 168, wickets: 6, legalBalls: 118, overs: "19.4",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: { pB1: { runs: 48, ballsFaced: 38, fours: 5, sixes: 1, dismissed: true }, pB2: { runs: 42, ballsFaced: 30, fours: 4, sixes: 1, dismissed: false } },
          bowling: { pA1: { legalBalls: 24, runsConceded: 24, wickets: 2, maidens: 0 } },
          fallOfWickets: [], targetToWin: 166,
        },
      ],
      result: { kind: "WIN", winnerTeamId: "team-b", marginType: "WICKETS", marginRuns: null, marginWickets: 4, completionReason: "COMPLETED" },
    };

    const t20Award = computeMatchAward({
      format: "T20",
      scorecard: scorecardBase,
      events: [{ type: "DELIVERY_RECORDED", payload: { event: { bowlingTeamId: "team-b", dismissal: { kind: "CAUGHT", fielderId: "pB1" } } } }],
      participantTeamByPlayerId: { pA1: "team-a", pA2: "team-a", pB1: "team-b", pB2: "team-b" },
      playerNames: { pA1: "Losing Hero", pB1: "Winning Allrounder" },
      teamNames: { "team-a": "Club A", "team-b": "Club B" },
    });
    expect(t20Award.awardVersion).toBe(AWARDS_MODEL_VERSION);
    expect(t20Award.awardProvenance).toBe("GAME_AWARD");
    expect(t20Award.status).toBe("AWARDED");
    expect(t20Award.winnerPlayerId).toBe("pA1");
    expect(t20Award.fromLosingTeam).toBe(true);
    expect(t20Award.fromWinningTeam).toBe(false);
    expect(t20Award.fieldingSourceStatus).toBe("ARCHIVE_EVENTS");
    expect(t20Award.components?.battingPointsX100).toBeGreaterThan(10000);

    const odiAward = computeMatchAward({ format: "ODI", scorecard: scorecardBase });
    expect(odiAward.status).toBe("AWARDED");
    expect(odiAward.winnerPlayerId).toBe("pA1");
    expect(odiAward.fieldingSourceStatus).toBe("SCORECARD_NOT_ATTRIBUTABLE");

    const redBallAward = computeMatchAward({
      format: "RED_BALL",
      scorecard: {
        ...scorecardBase,
        result: { kind: "DRAW", winnerTeamId: null, marginType: null, marginRuns: null, marginWickets: null, completionReason: "TIME_EXPIRED" },
      },
    });
    expect(redBallAward.status).toBe("AWARDED");
    expect(redBallAward.winnerPlayerId).toBe("pA1");

    const noResultAward = computeMatchAward({
      format: "T20",
      scorecard: {
        ...scorecardBase,
        result: { kind: "NO_RESULT", winnerTeamId: null, marginType: null, marginRuns: null, marginWickets: null, completionReason: "WEATHER_ABANDONED" },
      },
    });
    expect(noResultAward.status).toBe("NO_RESULT_NOT_AWARDED");
    expect(noResultAward.winnerPlayerId).toBeNull();
  });

  it("applies deterministic tiebreaking and computes all 5 season award categories cleanly", () => {
    const tiedScorecard: AnyMatchScorecard = {
      matchId: "m-tie",
      innings: [
        {
          battingTeamId: "t1", bowlingTeamId: "t2", runs: 100, wickets: 1, legalBalls: 120, overs: "20.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: { "p-zeta": { runs: 50, ballsFaced: 30, fours: 4, sixes: 2, dismissed: true }, "p-alpha": { runs: 50, ballsFaced: 30, fours: 4, sixes: 2, dismissed: true } },
          bowling: {}, fallOfWickets: [], targetToWin: null,
        },
        {
          battingTeamId: "t2", bowlingTeamId: "t1", runs: 90, wickets: 2, legalBalls: 120, overs: "20.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: {}, bowling: {}, fallOfWickets: [], targetToWin: 101,
        },
      ],
      result: { kind: "WIN", winnerTeamId: "t1", marginType: "RUNS", marginRuns: 10, marginWickets: null, completionReason: "COMPLETED" },
    };
    const tieAward = computeMatchAward({ format: "T20", scorecard: tiedScorecard });
    expect(tieAward.status).toBe("AWARDED");
    expect(tieAward.candidates.length).toBe(2);
    expect(tieAward.candidates[0]!.totalPointsX100).toBe(tieAward.candidates[1]!.totalPointsX100);
    expect(tieAward.winnerPlayerId).toBe("p-alpha");

    const completion = makeSyntheticCompletion({
      fixtureId: "fix-1", matchId: "m-1", ordinal: 0, round: 1, homeTeamId: "t1", awayTeamId: "t2", winnerTeamId: "t1", hashChar: "a",
      homeBatting: { starBat: { runs: 82, ballsFaced: 46, fours: 8, sixes: 3, dismissed: false } },
      awayBatting: { oppBat: { runs: 35, ballsFaced: 30, fours: 3, sixes: 0, dismissed: true } },
      homeBowling: { starBowl: { legalBalls: 24, runsConceded: 16, wickets: 4, maidens: 0 } },
      awayBowling: { oppBowl: { legalBalls: 24, runsConceded: 32, wickets: 1, maidens: 0 } },
    });
    const seasonAwards = computeSeasonAwards({
      seasonNumber: 1, calendarYear: 2027, completedMatches: [completion],
      playerNames: { starBat: "Star Batter", starBowl: "Star Bowler" }, teamNames: { t1: "Club One", t2: "Club Two" },
    });
    expect(seasonAwards.awards).toHaveLength(5);
    expect(seasonAwards.awards.find((a) => a.category === "LEADING_RUN_SCORER")?.winnerPlayerId).toBe("starBat");
    expect(seasonAwards.awards.find((a) => a.category === "LEADING_WICKET_TAKER")?.winnerPlayerId).toBe("starBowl");
    expect(seasonAwards.awards.find((a) => a.category === "BEST_FIELDER")?.status).toBe("UNAVAILABLE");
    expect(seasonAwards.awards.find((a) => a.category === "EMERGING_YOUTH_PLAYER")?.status).toBe("UNAVAILABLE");
  });

  it("records awards idempotently, preserves match/season hashes, and round-trips through portable archives and CareerApplicationService", async () => {
    const worldCopy = createNewGameWorldCopy(structuredClone(careerWorld), careerWorld);
    const seasonRepo = new InMemorySeasonRepo();
    const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const svc = new CareerApplicationService("owner-1", seasonRepo, undefined, persistentRepo);
    await svc.boot();
    const s1 = await svc.createCareer(careerWorld.teams[0]!.teamId, worldCopy, {
      seed: "stage10-awards-seed",
      worldId: "world-stage10",
      careerId: "career-stage10",
    });
    const beforeStateSha = svc.getPersistentState()!.stateSha256;
    await svc.simulateToNextUserFixture();
    await svc.simulateManagedFixture();
    const afterRound = svc.getState()!;
    expect(afterRound.completedMatches.length).toBeGreaterThan(0);

    const ledger1 = await svc.syncAwardsLedger();
    expect(ledger1).not.toBeNull();
    expect(ledger1!.ledgerVersion).toBe(AWARDS_LEDGER_VERSION);
    expect(ledger1!.matchAwards.length).toBe(afterRound.completedMatches.length);

    // Re-sync is idempotent and yields identical ledgerSha256 without modifying simulation stateSha256.
    const ledger2 = await svc.syncAwardsLedger();
    expect(ledger2!.ledgerSha256).toBe(ledger1!.ledgerSha256);
    expect(svc.getPersistentState()!.stateSha256).not.toBe(beforeStateSha);
    const shaAfterSim = svc.getPersistentState()!.stateSha256;
    const reReconciled = reconcileCareerAwardsLedger({ worldOrCareerId: svc.getPersistentState()!.worldIdentity.worldId, existingLedger: ledger1, persistentWorld: svc.getPersistentState() });
    expect(reReconciled.changed).toBe(false);
    expect(reReconciled.ledger.ledgerSha256).toBe(ledger1!.ledgerSha256);
    expect(svc.getPersistentState()!.stateSha256).toBe(shaAfterSim);

    // Idempotent helper rejects conflicting hash for same fixture key.
    const empty = createEmptyCareerAwardsLedger("w1");
    const firstEntry = ledger1!.matchAwards[0]!;
    const rec1 = recordMatchAwardIdempotent(empty, firstEntry);
    expect(rec1.changed).toBe(true);
    expect(recordMatchAwardIdempotent(rec1.ledger, firstEntry).changed).toBe(false);
    expect(() => recordMatchAwardIdempotent(rec1.ledger, { ...firstEntry, sourceCompletionSha256: "f".repeat(64) })).toThrow("CAREER_AWARD_CONFLICT");

    // Season ledger idempotency + portable archive export/import round-trip.
    const exported = await svc.exportCareer();
    const readBack = await readPersistentWorldPortableArchiveV3(exported);
    expect(readBack.awardsLedger?.ledgerSha256).toBe(ledger1!.ledgerSha256);
    const importedState = await svc.importCareer(exported);
    expect(importedState.careerId).toBe(s1.careerId);
    const afterImportLedger = await svc.syncAwardsLedger();
    expect(afterImportLedger?.ledgerSha256).toBe(ledger1!.ledgerSha256);

    // Direct archive writer preserves optional awardsLedger.
    const directBytes = await createPersistentWorldPortableArchiveV3(svc.getPersistentState()!, (await persistentRepo.list())[0]!, "2027-01-01T00:00:00.000Z", worldCopy, null, null, ledger1);
    const directParsed = await readPersistentWorldPortableArchiveV3(directBytes);
    expect(directParsed.awardsLedger?.ledgerSha256).toBe(ledger1!.ledgerSha256);

    // Duplicate season awards with same seal are a no-op.
    const synthSeason = computeSeasonAwards({ seasonNumber: 1, calendarYear: 2027, sealedAtSeasonSha256: "e".repeat(64), completedMatches: afterRound.completedMatches });
    const sRec = recordSeasonAwardsIdempotent(empty, synthSeason);
    expect(sRec.changed).toBe(true);
    expect(recordSeasonAwardsIdempotent(sRec.ledger, synthSeason).changed).toBe(false);
  }, 60_000);
});
