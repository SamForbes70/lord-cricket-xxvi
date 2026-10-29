import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson, type SeasonSaveSummary, type T20SeasonState } from "@lcxxvi/contracts";
import { T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import {
  advanceCareerDayV2,
  createCareerDayStateV2,
  generateSeasonSchedule,
  simulateOffscreenRound,
  simulateOffscreenFixture,
} from "@lcxxvi/simulation";
import {
  applyT20SeasonMatchCompletion,
  completionFromOffscreenOutcome,
  createT20SeasonProjection,
} from "@lcxxvi/projections";
import {
  createSeasonCheckpoint,
  createSeasonPortableArchive,
  createT20SeasonArchive,
  readSeasonPortableArchive,
  recoverSeasonCheckpoint,
  sealT20SeasonState,
  seasonSha256Text,
  validateT20SeasonArchive,
  validateT20SeasonState,
} from "@lcxxvi/persistence";

const scheduleRequest = JSON.parse(readFileSync("tests/fixtures/season/schedule-request.json", "utf8"));
const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

let partialState: T20SeasonState;
let pausedBeforeUserState: T20SeasonState;
let afterUserState: T20SeasonState;
let completeState: T20SeasonState;

async function buildState(roundLimit: number): Promise<T20SeasonState> {
  const schedule = generateSeasonSchedule(scheduleRequest);
  let career = createCareerDayStateV2({ careerId: "career-persist-01", schedule });
  let projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
  const completedMatches = [];
  for (let roundNumber = 1; roundNumber <= roundLimit; roundNumber += 1) {
    const round = schedule.rounds[roundNumber - 1]!;
    while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
    const simulated = simulateOffscreenRound({ schedule, careerState: career, roundNumber, worldBytes, worldManifest });
    for (const outcome of simulated.result.outcomes) {
      const completion = completionFromOffscreenOutcome(schedule, outcome);
      projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
      completedMatches.push(completion);
    }
    career = simulated.careerState;
  }
  return sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: schedule.seasonId,
    gameId: schedule.gameId,
    careerId: career.careerId,
    controlledTeamId: "team-01",
    schedule,
    careerState: career,
    projection,
    completedMatches,
    revision: completedMatches.length,
    phase: completedMatches.length === 56 ? "COMPLETE" : "ACTIVE",
  });
}

function summary(state: T20SeasonState): SeasonSaveSummary {
  return {
    saveId: `season:${state.seasonId}`,
    kind: "AUTO",
    title: "Fictional T20 Season",
    seasonId: state.seasonId,
    careerId: state.careerId,
    controlledTeamId: state.controlledTeamId,
    currentDate: state.careerState.currentDate,
    revision: state.revision,
    completedFixtures: state.completedMatches.length,
    phase: state.phase,
    stateSha256: state.stateSha256,
    updatedAt: "2026-10-05T10:00:00.000Z",
  };
}

function tamperLocalEntry(bytes: Uint8Array, targetName: string): Uint8Array {
  const out = Uint8Array.from(bytes), decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 < out.length) {
    const sig = (out[offset]! | (out[offset + 1]! << 8) | (out[offset + 2]! << 16) | (out[offset + 3]! << 24)) >>> 0;
    if (sig !== 0x04034b50) break;
    const size = (out[offset + 22]! | (out[offset + 23]! << 8) | (out[offset + 24]! << 16) | (out[offset + 25]! << 24)) >>> 0;
    const nameLen = out[offset + 26]! | (out[offset + 27]! << 8), extraLen = out[offset + 28]! | (out[offset + 29]! << 8);
    const nameStart = offset + 30, dataStart = nameStart + nameLen + extraLen;
    const name = decoder.decode(out.slice(nameStart, nameStart + nameLen));
    if (name === targetName) { const target = dataStart + Math.min(8, Math.max(0, size - 1)); out[target] = out[target]! ^ 1; return out; }
    offset = dataStart + size;
  }
  throw new Error(`missing ${targetName}`);
}

// This hook simulates a complete season before any assertions run.
beforeAll(async () => {
  partialState = await buildState(1);
  completeState = await buildState(14);

  const schedule = generateSeasonSchedule(scheduleRequest);
  let career = createCareerDayStateV2({ careerId: "career-persist-managed-01", schedule });
  let projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
  const skipped = simulateOffscreenRound({ schedule, careerState: career, roundNumber: 1, userTeamId: "team-01", worldBytes, worldManifest });
  const completions = skipped.result.outcomes.map((outcome) => completionFromOffscreenOutcome(schedule, outcome));
  for (const completion of completions) projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
  career = skipped.careerState;
  pausedBeforeUserState = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId, careerId: career.careerId,
    controlledTeamId: "team-01", schedule, careerState: career, projection, completedMatches: completions, revision: 3, phase: "ACTIVE",
  });
  const userFixture = schedule.fixtures.find((fixture) => fixture.roundNumber === 1 && [fixture.homeTeamId, fixture.awayTeamId].includes("team-01"))!;
  const userPlayed = simulateOffscreenFixture({ schedule, careerState: career, fixtureId: userFixture.fixtureId, worldBytes, worldManifest });
  const userCompletion = { ...completionFromOffscreenOutcome(schedule, userPlayed.outcome), source: "USER_MATCH" as const };
  projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion: userCompletion });
  afterUserState = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId, careerId: userPlayed.careerState.careerId,
    controlledTeamId: "team-01", schedule, careerState: userPlayed.careerState, projection,
    completedMatches: [...completions, userCompletion].sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal), revision: 4, phase: "ACTIVE",
  });
}, 300_000);

describe("M6F durable season state and archive", () => {
  it("binds schedule, career, projection and canonical completions into one hashed state", async () => {
    expect(partialState.phase).toBe("ACTIVE");
    expect(partialState.completedMatches).toHaveLength(4);
    expect(partialState.projection.revision).toBe(4);
    expect(partialState.careerState.appliedMatchConditions).toHaveLength(4);
    expect((await validateT20SeasonState(partialState)).stateSha256).toBe(partialState.stateSha256);
    const tampered = structuredClone(partialState);
    tampered.projection.table[0]!.points += 2;
    await expect(validateT20SeasonState(tampered)).rejects.toThrow(/HASH_MISMATCH/);
  });

  it("rejects a semantically inconsistent state even when its outer hash is recomputed", async () => {
    const tampered = structuredClone(partialState);
    tampered.phase = "COMPLETE";
    const { stateSha256, ...core } = tampered;
    void stateSha256;
    tampered.stateSha256 = await seasonSha256Text(canonicalJson(core));
    await expect(validateT20SeasonState(tampered)).rejects.toThrow(/PHASE_MISMATCH/);
  });

  it("recovers the newest valid rolling checkpoint without mutating the corrupt generation", async () => {
    const states = await Promise.all([10, 11, 12].map(async (revision) => {
      const { stateSha256, ...core } = partialState;
      void stateSha256;
      return sealT20SeasonState({ ...core, revision });
    }));
    const checkpoints = await Promise.all(states.map((state, serial) => createSeasonCheckpoint({
      saveId: "season:test", generation: serial % 3, checkpointSerial: serial, state, createdAt: `2026-10-05T10:0${serial}:00.000Z`,
    })));
    const corruptLatest = { ...checkpoints[2]!, payload: `${checkpoints[2]!.payload} ` };
    const recovered = await recoverSeasonCheckpoint([checkpoints[0]!, checkpoints[1]!, corruptLatest], 2);
    expect(recovered.recovered).toBe(true);
    expect(recovered.checkpoint.checkpointSerial).toBe(1);
    expect(recovered.state.revision).toBe(11);
    expect(recovered.corruptedGenerations).toEqual([2]);
    expect(corruptLatest.payload.endsWith(" ")).toBe(true);
  });

  it("persists a pause before the managed fixture and accepts the same fixture through the USER_MATCH completion boundary", async () => {
    expect(pausedBeforeUserState.completedMatches).toHaveLength(3);
    expect(pausedBeforeUserState.projection.revision).toBe(3);
    expect(pausedBeforeUserState.careerState.appliedMatchConditions).toHaveLength(3);
    expect(afterUserState.completedMatches).toHaveLength(4);
    expect(afterUserState.completedMatches.some((completion) => completion.source === "USER_MATCH")).toBe(true);
    expect(afterUserState.projection.revision).toBe(4);
    expect(afterUserState.careerState.appliedMatchConditions).toHaveLength(4);
    await expect(validateT20SeasonState(pausedBeforeUserState)).resolves.toBeTruthy();
    await expect(validateT20SeasonState(afterUserState)).resolves.toBeTruthy();
  });

  it("rebuilds the final projection exactly from canonical completion records", async () => {
    let rebuilt = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: completeState.schedule });
    for (const completion of completeState.completedMatches)
      rebuilt = applyT20SeasonMatchCompletion({ state: rebuilt, competition: T20_LEAGUE_COMPETITION, schedule: completeState.schedule, completion });
    expect(canonicalJson(rebuilt)).toBe(canonicalJson(completeState.projection));
  });

  it("creates an immutable completed-season archive only after all 56 fixtures reconcile", async () => {
    await expect(createT20SeasonArchive(partialState, "2026-10-05T10:00:00.000Z")).rejects.toThrow(/ARCHIVE_REQUIRES_COMPLETE_SEASON/);
    const archive = await createT20SeasonArchive(completeState, "2026-10-05T10:00:00.000Z");
    expect(archive.fixtureCount).toBe(56);
    expect(archive.projectionRevision).toBe(56);
    expect(archive.championTeamId).toBe(completeState.projection.table[0]!.teamId);
    expect(new Set(archive.completionKeys).size).toBe(56);
    expect((await validateT20SeasonArchive(archive)).archiveSha256).toBe(archive.archiveSha256);
  });

  it("round-trips an active season portable save byte-for-byte in canonical state", async () => {
    const bytesA = await createSeasonPortableArchive(partialState, summary(partialState), "2026-10-05T10:00:00.000Z");
    const bytesB = await createSeasonPortableArchive(partialState, summary(partialState), "2026-10-05T10:00:00.000Z");
    expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(true);
    const read = await readSeasonPortableArchive(bytesA);
    expect(canonicalJson(read.state)).toBe(canonicalJson(partialState));
    expect(read.seasonArchive).toBeNull();
    expect(read.summary).toEqual(summary(partialState));
  });

  it("reloads an active portable save and can advance into the next scheduled round", async () => {
    const bytes = await createSeasonPortableArchive(afterUserState, summary(afterUserState), "2026-10-05T10:00:00.000Z");
    const restored = (await readSeasonPortableArchive(bytes)).state;
    let career = restored.careerState;
    const round2 = restored.schedule.rounds[1]!;
    while (career.currentDate < round2.matchDayDate) career = advanceCareerDayV2(career).state;
    const simulated = simulateOffscreenRound({ schedule: restored.schedule, careerState: career, roundNumber: 2, userTeamId: "team-01", worldBytes, worldManifest });
    expect(simulated.result.outcomes).toHaveLength(3);
    expect(simulated.careerState.appliedMatchConditions).toHaveLength(7);
    expect(new Set(simulated.careerState.appliedMatchConditions.map((entry) => entry.matchId)).size).toBe(7);
  });

  it("round-trips a complete season with its immutable archive and rejects payload tampering", async () => {
    const archive = await createT20SeasonArchive(completeState, "2026-10-05T10:00:00.000Z");
    const bytes = await createSeasonPortableArchive(completeState, summary(completeState), "2026-10-05T10:00:00.000Z", archive);
    const read = await readSeasonPortableArchive(bytes);
    expect(canonicalJson(read.state)).toBe(canonicalJson(completeState));
    expect(read.seasonArchive?.archiveSha256).toBe(archive.archiveSha256);
    await expect(readSeasonPortableArchive(tamperLocalEntry(bytes, "projection.json"))).rejects.toThrow(/CRC|HASH/);
  });

  it("rejects summary/state substitution during import staging", async () => {
    const wrong = { ...summary(partialState), stateSha256: "f".repeat(64) };
    await expect(createSeasonPortableArchive(partialState, wrong, "2026-10-05T10:00:00.000Z")).rejects.toThrow(/SUMMARY_STATE_MISMATCH/);
  });
});
