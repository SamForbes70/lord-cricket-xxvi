import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createStateHasher } from "../packages/simulation/src/determinism.js";
import {
  completionFromOffscreenOutcome,
  createT20SeasonProjection,
  applyT20SeasonMatchCompletion,
  validateT20SeasonProjection,
} from "../packages/projections/src/index.js";
import {
  advanceCareerDayV2,
  createCareerDayStateV2,
  generateSeasonSchedule,
  simulateOffscreenRound,
  validateOffscreenFixtureOutcome,
} from "../packages/simulation/src/index.js";
import { T20_LEAGUE_COMPETITION } from "../packages/data/src/index.js";

const write = process.argv.includes("--write");
const hasher = createStateHasher();
const scheduleRequest = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const worldBytes = await readFile("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const schedule = generateSeasonSchedule(scheduleRequest);
let career = createCareerDayStateV2({ careerId: "career-projection-audit-01", schedule });
let projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
let scorecardBatRuns = 0;
let scorecardBowlerWickets = 0;
let totalEvents = 0;
const outcomeHashes: string[] = [];

for (let roundNumber = 1; roundNumber <= 14; roundNumber += 1) {
  const round = schedule.rounds[roundNumber - 1]!;
  while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
  if (career.currentDate !== round.matchDayDate) throw new Error(`PROJECTION_AUDIT_DATE_MISMATCH:${roundNumber}`);
  const simulated = simulateOffscreenRound({ schedule, careerState: career, roundNumber, worldBytes, worldManifest });
  for (const [index, outcome] of simulated.result.outcomes.entries()) {
    validateOffscreenFixtureOutcome(outcome);
    const completion = completionFromOffscreenOutcome(schedule, outcome);
    projection = applyT20SeasonMatchCompletion({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule, completion });
    outcomeHashes.push(outcome.outcomeSha256);
    totalEvents += simulated.sessions[index]!.events.length;
    for (const innings of outcome.scorecard.innings) {
      scorecardBatRuns += Object.values(innings.batting).reduce((sum, line) => sum + line.runs, 0);
      scorecardBowlerWickets += Object.values(innings.bowling).reduce((sum, line) => sum + line.wickets, 0);
    }
  }
  career = simulated.careerState;
}

validateT20SeasonProjection({ state: projection, competition: T20_LEAGUE_COMPETITION, schedule });
if (projection.revision !== 56 || projection.appliedMatches.length !== 56) throw new Error("PROJECTION_AUDIT_MATCH_COUNT");
if (projection.cursor.appliedCount !== 56 || projection.cursor.highestAppliedFixtureOrdinal !== 55 || projection.cursor.missingFixtureOrdinals.length !== 0) throw new Error("PROJECTION_AUDIT_CURSOR");
if (projection.table.some((row) => row.played !== 14)) throw new Error("PROJECTION_AUDIT_PLAYED");
if (projection.table.reduce((sum, row) => sum + row.points, 0) !== 112) throw new Error("PROJECTION_AUDIT_POINTS");
if (projection.table.reduce((sum, row) => sum + row.played, 0) !== 112) throw new Error("PROJECTION_AUDIT_TEAM_APPEARANCES");
if (projection.players.reduce((sum, player) => sum + player.matches, 0) !== 56 * 22) throw new Error("PROJECTION_AUDIT_PLAYER_APPEARANCES");
if (projection.players.reduce((sum, player) => sum + player.runs, 0) !== scorecardBatRuns) throw new Error("PROJECTION_AUDIT_BAT_RUNS");
if (projection.players.reduce((sum, player) => sum + player.bowlingWickets, 0) !== scorecardBowlerWickets) throw new Error("PROJECTION_AUDIT_BOWLING_WICKETS");
if (new Set(projection.table.map((row) => row.rank)).size !== 8) throw new Error("PROJECTION_AUDIT_RANKS");

const champion = projection.table[0]!;
const summary = {
  auditVersion: "LC_T20_SEASON_PROJECTION_AUDIT_V1",
  projectionVersion: projection.projectionVersion,
  scheduleSha256: schedule.scheduleSha256,
  fixturesApplied: projection.revision,
  totalEvents,
  outcomeCorpusSha256: hasher.hash(outcomeHashes),
  projectionSha256: hasher.hash(projection),
  tableSha256: hasher.hash(projection.table),
  playerStatsSha256: hasher.hash(projection.players),
  appliedMatchesSha256: hasher.hash(projection.appliedMatches),
  champion: {
    teamId: champion.teamId,
    points: champion.points,
    wins: champion.wins,
    nrrNumerator: champion.nrrNumerator,
    nrrDenominator: champion.nrrDenominator,
    nrrX1000: champion.nrrX1000,
  },
  tableOrder: projection.table.map((row) => row.teamId),
  playerStatRecords: projection.players.length,
  playerAppearances: projection.players.reduce((sum, player) => sum + player.matches, 0),
  battingRuns: projection.players.reduce((sum, player) => sum + player.runs, 0),
  creditedBowlingWickets: projection.players.reduce((sum, player) => sum + player.bowlingWickets, 0),
  runsLeader: projection.leaders.runs[0] ?? null,
  wicketsLeader: projection.leaders.wickets[0] ?? null,
  cursor: projection.cursor,
};
const output = { ...summary, summarySha256: hasher.hash(summary) };
const path = "tests/fixtures/season/projection-golden.json";
if (write) {
  await mkdir("tests/fixtures/season", { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
} else {
  const expected = JSON.parse(await readFile(path, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(output)) throw new Error(`PROJECTION_GOLDEN_DRIFT\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(output)}`);
}
console.log(JSON.stringify({ status: "PASS", ...output }));
