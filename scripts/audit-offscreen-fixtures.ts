import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createStateHasher } from "../packages/simulation/src/determinism.js";
import {
  advanceCareerDayV2,
  createCareerDayStateV2,
  generateSeasonSchedule,
  simulateOffscreenRound,
  validateOffscreenFixtureOutcome,
} from "../packages/simulation/src/index.js";
import { T20_OFFSCREEN_FIXTURE_POLICY } from "../packages/data/src/index.js";

const write = process.argv.includes("--write");
const hasher = createStateHasher();
const scheduleRequest = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const worldBytes = await readFile("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const schedule = generateSeasonSchedule(scheduleRequest);
let career = createCareerDayStateV2({ careerId: "career-offscreen-audit-01", schedule });
const outcomes = [];
let totalEvents = 0;
let totalCommands = 0;
const resultCounts: Record<string, number> = {};

for (let roundNumber = 1; roundNumber <= 14; roundNumber += 1) {
  const round = schedule.rounds[roundNumber - 1]!;
  while (career.currentDate < round.matchDayDate) career = advanceCareerDayV2(career).state;
  if (career.currentDate !== round.matchDayDate) throw new Error(`OFFSCREEN_AUDIT_DATE_MISMATCH:${roundNumber}`);
  const simulated = simulateOffscreenRound({
    schedule,
    careerState: career,
    roundNumber,
    worldBytes,
    worldManifest,
  });
  for (const [index, outcome] of simulated.result.outcomes.entries()) {
    validateOffscreenFixtureOutcome(outcome);
    outcomes.push(outcome);
    totalEvents += simulated.sessions[index]!.events.length;
    totalCommands += simulated.sessions[index]!.commands.length;
    const key = outcome.scorecard.result.kind;
    resultCounts[key] = (resultCounts[key] ?? 0) + 1;
  }
  career = simulated.careerState;
}

if (outcomes.length !== 56) throw new Error(`OFFSCREEN_AUDIT_EXPECTED_56:${outcomes.length}`);
if (new Set(outcomes.map((outcome) => outcome.fixtureId)).size !== 56) throw new Error("OFFSCREEN_AUDIT_DUPLICATE_FIXTURE");
if (new Set(outcomes.map((outcome) => outcome.matchId)).size !== 56) throw new Error("OFFSCREEN_AUDIT_DUPLICATE_MATCH");
if (career.appliedMatchConditions.length !== 56) throw new Error("OFFSCREEN_AUDIT_CONDITION_COUNT");
if (career.currentDate !== schedule.rounds[13]!.matchDayDate) throw new Error("OFFSCREEN_AUDIT_FINAL_DATE");

const summary = {
  auditVersion: "LC_T20_OFFSCREEN_AUDIT_V1",
  policyVersion: T20_OFFSCREEN_FIXTURE_POLICY.policyVersion,
  executionVersion: T20_OFFSCREEN_FIXTURE_POLICY.executionVersion,
  scheduleSha256: schedule.scheduleSha256,
  fixtures: outcomes.length,
  uniqueFixtureIds: new Set(outcomes.map((outcome) => outcome.fixtureId)).size,
  uniqueMatchIds: new Set(outcomes.map((outcome) => outcome.matchId)).size,
  outcomeCorpusSha256: hasher.hash(outcomes.map((outcome) => outcome.outcomeSha256)),
  scorecardCorpusSha256: hasher.hash(outcomes.map((outcome) => outcome.scorecardSha256)),
  eventLogCorpusSha256: hasher.hash(outcomes.map((outcome) => outcome.eventLogSha256)),
  commandLogCorpusSha256: hasher.hash(outcomes.map((outcome) => outcome.commandLogSha256)),
  firstFixtureId: outcomes[0]!.fixtureId,
  firstOutcomeSha256: outcomes[0]!.outcomeSha256,
  lastFixtureId: outcomes.at(-1)!.fixtureId,
  lastOutcomeSha256: outcomes.at(-1)!.outcomeSha256,
  totalEvents,
  totalCommands,
  resultCounts,
  appliedMatchConditions: career.appliedMatchConditions.length,
  finalCareerRevision: career.revision,
  finalCareerDate: career.currentDate,
  finalCareerStateSha256: career.stateSha256,
};
const summarySha256 = hasher.hash(summary);
const output = { ...summary, summarySha256 };
const path = "tests/fixtures/season/offscreen-golden.json";
if (write) {
  await mkdir("tests/fixtures/season", { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
} else {
  const expected = JSON.parse(await readFile(path, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(output)) {
    throw new Error(`OFFSCREEN_GOLDEN_DRIFT\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(output)}`);
  }
}
console.log(JSON.stringify({ status: "PASS", ...output }));
