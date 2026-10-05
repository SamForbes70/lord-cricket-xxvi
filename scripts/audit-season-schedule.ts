import { readFile, writeFile } from "node:fs/promises";
import { canonicalJson } from "@lcxxvi/contracts";
import { generateSeasonSchedule } from "@lcxxvi/simulation";

const request = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const golden = JSON.parse(await readFile("tests/fixtures/season/schedule-golden.json", "utf8"));
const schedule = generateSeasonSchedule(request);
const pairs = schedule.fixtures.map((fixture) => `${fixture.homeTeamId}>${fixture.awayTeamId}`);
const teamCounts = Object.fromEntries(schedule.teamIds.map((teamId) => [teamId, {
  home: schedule.fixtures.filter((fixture) => fixture.homeTeamId === teamId).length,
  away: schedule.fixtures.filter((fixture) => fixture.awayTeamId === teamId).length,
  matches: schedule.fixtures.filter((fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId).length,
}]));
const summary = {
  status: "PASS",
  schedulerVersion: schedule.scheduleVersion,
  schedulerAlgorithm: schedule.schedulerAlgorithm,
  scheduleSha256: schedule.scheduleSha256,
  seasonSeedHash: schedule.seasonSeedHash,
  rounds: schedule.rounds.length,
  fixtures: schedule.fixtures.length,
  orderedPairs: new Set(pairs).size,
  uniqueFixtureIds: new Set(schedule.fixtures.map((fixture) => fixture.fixtureId)).size,
  uniqueMatchIds: new Set(schedule.fixtures.map((fixture) => fixture.matchId)).size,
  uniqueMatchSeeds: new Set(schedule.fixtures.map((fixture) => fixture.matchSeed)).size,
  firstRound: schedule.fixtures.filter((fixture) => fixture.roundNumber === 1).map((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
  eighthRound: schedule.fixtures.filter((fixture) => fixture.roundNumber === 8).map((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
  firstDate: schedule.rounds[0]!.matchDayDate,
  finalDate: schedule.rounds[13]!.matchDayDate,
  teamCounts,
};
if (summary.rounds !== 14 || summary.fixtures !== 56 || summary.orderedPairs !== 56 ||
    summary.uniqueFixtureIds !== 56 || summary.uniqueMatchIds !== 56 || summary.uniqueMatchSeeds !== 56 ||
    Object.values(teamCounts).some((counts) => counts.home !== 7 || counts.away !== 7 || counts.matches !== 14)) {
  throw new Error("PASS_12A_SCHEDULE_AUDIT_FAILED");
}
const firstFixture = schedule.fixtures[0]!;
const lastFixture = schedule.fixtures[55]!;
for (const [label, actual, expected] of [
  ["scheduleSha256", schedule.scheduleSha256, golden.scheduleSha256],
  ["seasonSeedHash", schedule.seasonSeedHash, golden.seasonSeedHash],
] as const) {
  if (actual !== expected) throw new Error(`PASS_12A_GOLDEN_MISMATCH:${label}`);
}
for (const [label, actual, expected] of [
  ["firstFixture", firstFixture, golden.firstFixture],
  ["lastFixture", lastFixture, golden.lastFixture],
] as const) {
  for (const [key, value] of Object.entries(expected)) {
    if ((actual as Record<string, unknown>)[key] !== value) throw new Error(`PASS_12A_GOLDEN_MISMATCH:${label}.${key}`);
  }
}
if (process.argv.includes("--write")) {
  await writeFile("docs/verification-pass12a/season-schedule-audit.json", `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(canonicalJson(summary));
