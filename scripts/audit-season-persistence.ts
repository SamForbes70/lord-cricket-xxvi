import { readFile, writeFile, mkdir } from "node:fs/promises";
import { canonicalJson } from "../packages/contracts/src/index.js";
import { T20_LEAGUE_COMPETITION } from "../packages/data/src/index.js";
import { createStateHasher } from "../packages/simulation/src/determinism.js";
import { advanceCareerDayV2, createCareerDayStateV2, generateSeasonSchedule, simulateOffscreenRound } from "../packages/simulation/src/index.js";
import { applyT20SeasonMatchCompletion, completionFromOffscreenOutcome, createT20SeasonProjection } from "../packages/projections/src/index.js";
import { createSeasonPortableArchive, createT20SeasonArchive, readSeasonPortableArchive, sealT20SeasonState, sha256Bytes } from "../packages/persistence/src/index.js";

const write = process.argv.includes("--write");
const hasher = createStateHasher();
const scheduleRequest = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const worldBytes = await readFile("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const schedule = generateSeasonSchedule(scheduleRequest);
let career = createCareerDayStateV2({ careerId: "career-persistence-audit-01", schedule });
let projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
const completions = [];
let activeState = null;

for (let roundNumber = 1; roundNumber <= 14; roundNumber += 1) {
  const round = schedule.rounds[roundNumber - 1]!;
  while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
  const simulated = simulateOffscreenRound({ schedule, careerState: career, roundNumber, worldBytes, worldManifest });
  for (const outcome of simulated.result.outcomes) {
    const completion = completionFromOffscreenOutcome(schedule, outcome);
    projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
    completions.push(completion);
  }
  career = simulated.careerState;
  if (roundNumber === 1) activeState = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId,
    careerId: career.careerId, controlledTeamId: "team-01", schedule, careerState: career, projection,
    completedMatches: [...completions], revision: completions.length, phase: "ACTIVE",
  });
}
if (!activeState) throw new Error("SEASON_PERSISTENCE_ACTIVE_STATE_MISSING");
const completeState = await sealT20SeasonState({
  seasonStateVersion: "LC_T20_SEASON_STATE_V1", seasonId: schedule.seasonId, gameId: schedule.gameId,
  careerId: career.careerId, controlledTeamId: "team-01", schedule, careerState: career, projection,
  completedMatches: completions, revision: completions.length, phase: "COMPLETE",
});
const completedAt = "2026-10-05T10:00:00.000Z";
const seasonArchive = await createT20SeasonArchive(completeState, completedAt);
const summary = {
  saveId: `season:${completeState.seasonId}`, kind: "AUTO" as const, title: "Fictional T20 Season",
  seasonId: completeState.seasonId, careerId: completeState.careerId, controlledTeamId: completeState.controlledTeamId,
  currentDate: completeState.careerState.currentDate, revision: completeState.revision,
  completedFixtures: completeState.completedMatches.length, phase: completeState.phase,
  stateSha256: completeState.stateSha256, updatedAt: completedAt,
};
const portable = await createSeasonPortableArchive(completeState, summary, completedAt, seasonArchive);
const restored = await readSeasonPortableArchive(portable);
if (canonicalJson(restored.state) !== canonicalJson(completeState) || restored.seasonArchive?.archiveSha256 !== seasonArchive.archiveSha256) throw new Error("SEASON_PERSISTENCE_ROUND_TRIP_MISMATCH");
const outputCore = {
  auditVersion: "LC_T20_SEASON_PERSISTENCE_AUDIT_V1",
  scheduleSha256: schedule.scheduleSha256,
  activeStateSha256: activeState.stateSha256,
  activeCompletedFixtures: activeState.completedMatches.length,
  completeStateSha256: completeState.stateSha256,
  completeStateCanonicalSha256: hasher.hash(completeState),
  completedFixtures: completeState.completedMatches.length,
  championTeamId: seasonArchive.championTeamId,
  seasonArchiveSha256: seasonArchive.archiveSha256,
  portableArchiveSha256: await sha256Bytes(portable),
  portableArchiveBytes: portable.length,
  restoredStateSha256: restored.state.stateSha256,
  restoredArchiveSha256: restored.seasonArchive!.archiveSha256,
};
const output = { ...outputCore, summarySha256: hasher.hash(outputCore) };
const goldenPath = "tests/fixtures/season/persistence-golden.json";
const statePath = "tests/fixtures/season/persistence-active-state.json";
if (write) {
  await mkdir("tests/fixtures/season", { recursive: true });
  await writeFile(goldenPath, `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(statePath, `${JSON.stringify(activeState, null, 2)}\n`);
} else {
  const expected = JSON.parse(await readFile(goldenPath, "utf8"));
  const storedActive = JSON.parse(await readFile(statePath, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(output)) throw new Error(`SEASON_PERSISTENCE_GOLDEN_DRIFT\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(output)}`);
  if (canonicalJson(storedActive) !== canonicalJson(activeState)) throw new Error("SEASON_PERSISTENCE_ACTIVE_FIXTURE_DRIFT");
}
console.log(JSON.stringify({ status: "PASS", ...output }));
