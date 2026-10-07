import { readFile } from "node:fs/promises";
import { canonicalJson, T20SeasonMatchCompletionSchema, type T20SeasonMatchCompletion, type T20SeasonProjectionState, type CareerDayStateV2 } from "../packages/contracts/src/index.js";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION } from "../packages/data/src/index.js";
import { advanceCareerDayV2, createCareerDayStateV2, createStateHasher, generateSeasonSchedule, simulateOffscreenFixture, simulateOffscreenRound } from "../packages/simulation/src/index.js";
import { applyT20SeasonMatchCompletion, completionFromOffscreenOutcome, createT20SeasonProjection } from "../packages/projections/src/index.js";
import { createSeasonPortableArchive, createT20SeasonArchive, readSeasonPortableArchive, sealT20SeasonState } from "../packages/persistence/src/index.js";

const hasher = createStateHasher();
const worldBytes = await readFile("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const controlledTeamId = "team-01";
const schedule = generateSeasonSchedule({
  scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
  seasonId: "season-management-acceptance-01",
  gameId: "career-management-acceptance-01",
  competitionId: "LC_T20_LEAGUE_01",
  worldPackId: "fictional-eight-01",
  worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
  seasonSeed: "management-acceptance-seed-01",
  startDate: "2027-01-03",
  teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
  groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
  homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
});
if (schedule.rounds.length !== 14 || schedule.fixtures.length !== 56 || new Set(schedule.fixtures.map((f) => f.fixtureId)).size !== 56) throw new Error("MANAGEMENT_SCHEDULE_CARDINALITY");

type Working = { career: CareerDayStateV2; projection: T20SeasonProjectionState; completions: T20SeasonMatchCompletion[] };

function userCompletion(base: T20SeasonMatchCompletion, finalEventHash: string): T20SeasonMatchCompletion {
  const sourceCompletionSha256 = hasher.hash({
    source: "USER_MATCH",
    seasonId: schedule.seasonId,
    fixtureId: base.fixtureId,
    matchId: base.matchId,
    scorecardSha256: base.scorecardSha256,
    finalEventHash,
  });
  return T20SeasonMatchCompletionSchema.parse({ ...base, source: "USER_MATCH", sourceCompletionSha256 });
}

function executeRound(input: Working, roundNumber: number): Working {
  let { career, projection } = input;
  const completions = [...input.completions];
  const round = schedule.rounds[roundNumber - 1]!;
  while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
  const others = simulateOffscreenRound({ schedule, careerState: career, roundNumber, userTeamId: controlledTeamId, worldBytes, worldManifest });
  for (const outcome of others.result.outcomes) {
    const completion = completionFromOffscreenOutcome(schedule, outcome);
    projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
    completions.push(completion);
  }
  career = others.careerState;
  const userFixtureId = others.result.skippedUserFixtureId;
  if (!userFixtureId) throw new Error(`MANAGEMENT_USER_FIXTURE_MISSING:${roundNumber}`);
  const played = simulateOffscreenFixture({ schedule, careerState: career, fixtureId: userFixtureId, worldBytes, worldManifest });
  career = played.careerState;
  const completion = userCompletion(completionFromOffscreenOutcome(schedule, played.outcome), played.session.lastEventHash);
  projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
  completions.push(completion);
  completions.sort((a,b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
  return { career, projection, completions };
}

async function seal(working: Working, phase: "ACTIVE" | "COMPLETE") {
  return sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId,
    careerId: working.career.careerId, controlledTeamId, schedule, careerState: working.career, projection: working.projection,
    completedMatches: working.completions, revision: working.completions.length, phase,
  });
}

let primary: Working = {
  career: createCareerDayStateV2({ careerId: "career-management-acceptance-01", schedule }),
  projection: createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule }),
  completions: [],
};
const interruptionHashes: string[] = [];
for (let round = 1; round <= 10; round += 1) {
  primary = executeRound(primary, round);
  if ([1, 7, 10].includes(round)) interruptionHashes.push((await seal(primary, "ACTIVE")).stateSha256);
}

const active = await seal(primary, "ACTIVE");
const activeAt = `${schedule.rounds[9]!.matchDayDate}T23:59:59.000Z`;
const activeSummary = {
  saveId: `season:${active.seasonId}`, kind: "AUTO" as const, title: "Management acceptance season",
  seasonId: active.seasonId, careerId: active.careerId, controlledTeamId: active.controlledTeamId,
  currentDate: active.careerState.currentDate, revision: active.revision, completedFixtures: active.completedMatches.length,
  phase: active.phase, stateSha256: active.stateSha256, updatedAt: activeAt,
};
const activePortable = await createSeasonPortableArchive(active, activeSummary, activeAt, null);
const importedActive = await readSeasonPortableArchive(activePortable);
if (canonicalJson(importedActive.state) !== canonicalJson(active)) throw new Error("MANAGEMENT_ACTIVE_EXPORT_IMPORT_MISMATCH");

let imported: Working = {
  career: importedActive.state.careerState,
  projection: importedActive.state.projection,
  completions: [...importedActive.state.completedMatches],
};
for (let round = 11; round <= 14; round += 1) {
  primary = executeRound(primary, round);
  imported = executeRound(imported, round);
}

for (const candidate of [primary, imported]) {
  if (candidate.completions.length !== 56 || new Set(candidate.completions.map((c) => c.fixtureId)).size !== 56) throw new Error("MANAGEMENT_COMPLETION_CARDINALITY");
  if (candidate.career.appliedMatchConditions.length !== 56 || new Set(candidate.career.appliedMatchConditions.map((x) => x.matchId)).size !== 56) throw new Error("MANAGEMENT_CONDITION_CARDINALITY");
  if (candidate.completions.filter((c) => c.source === "USER_MATCH").length !== 14) throw new Error("MANAGEMENT_USER_MATCH_CARDINALITY");
  let rebuilt = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
  for (const completion of candidate.completions) rebuilt = applyT20SeasonMatchCompletion({ state: rebuilt, competition: T20_LEAGUE_COMPETITION, schedule, completion });
  if (canonicalJson(rebuilt) !== canonicalJson(candidate.projection)) throw new Error("MANAGEMENT_PROJECTION_REBUILD_MISMATCH");
}

const complete = await seal(primary, "COMPLETE");
const completeImported = await seal(imported, "COMPLETE");
if (canonicalJson(completeImported) !== canonicalJson(complete)) throw new Error("MANAGEMENT_CONTINUATION_DIVERGENCE");
const completedAt = `${schedule.rounds[13]!.matchDayDate}T23:59:59.000Z`;
const archive = await createT20SeasonArchive(complete, completedAt);
const importedArchive = await createT20SeasonArchive(completeImported, completedAt);
if (canonicalJson(importedArchive) !== canonicalJson(archive)) throw new Error("MANAGEMENT_ARCHIVE_DIVERGENCE");
const finalSummary = { ...activeSummary, currentDate: complete.careerState.currentDate, revision: complete.revision, completedFixtures: 56, phase: complete.phase, stateSha256: complete.stateSha256, updatedAt: completedAt };
const portable = await createSeasonPortableArchive(complete, finalSummary, completedAt, archive);
const restored = await readSeasonPortableArchive(portable);
if (canonicalJson(restored.state) !== canonicalJson(complete) || restored.seasonArchive?.archiveSha256 !== archive.archiveSha256) throw new Error("MANAGEMENT_PORTABLE_ROUND_TRIP");
let duplicateRejected = false;
try {
  await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: complete.seasonId, gameId: complete.gameId,
    careerId: complete.careerId, controlledTeamId, schedule: complete.schedule, careerState: complete.careerState, projection: complete.projection,
    completedMatches: [...complete.completedMatches, complete.completedMatches[0]!], revision: 57, phase: "COMPLETE",
  });
} catch { duplicateRejected = true; }
if (!duplicateRejected) throw new Error("MANAGEMENT_57TH_COMPLETION_NOT_REJECTED");

console.log(JSON.stringify({
  status: "PASS", auditVersion: "LC_T20_MANAGEMENT_ACCEPTANCE_V1", rounds: 14, fixtures: 56,
  completedFixtures: complete.completedMatches.length,
  userMatches: complete.completedMatches.filter((c) => c.source === "USER_MATCH").length,
  offscreenMatches: complete.completedMatches.filter((c) => c.source === "OFFSCREEN").length,
  appliedMatchConditions: complete.careerState.appliedMatchConditions.length,
  championTeamId: archive.championTeamId, finalStateSha256: complete.stateSha256, archiveSha256: archive.archiveSha256,
  interruptionHashes, activeExportImportAtRound: 10, deterministicContinuationEquivalent: true,
  completedPortableRoundTrip: true, duplicate57thCompletionRejected: true,
}));
