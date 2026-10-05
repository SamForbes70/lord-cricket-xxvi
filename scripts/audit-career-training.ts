import { readFile, writeFile } from "node:fs/promises";
import { canonicalJson } from "@lcxxvi/contracts";
import { T20_CAREER_TRAINING_POLICY } from "@lcxxvi/data";
import {
  advanceCareerDayV2,
  applyMatchConditionDeltaV2,
  createCareerDayStateV2,
  generateSeasonSchedule,
  projectSquadTrainingCondition,
  setTrainingDirective,
  validateCareerDayStateV2,
} from "@lcxxvi/simulation";

const scheduleRequest = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const goldenPath = "tests/fixtures/training/career-training-golden.json";
const schedule = generateSeasonSchedule(scheduleRequest);
let state = createCareerDayStateV2({ careerId: "career-training-audit", schedule });
const fixture = schedule.fixtures[0]!;
state = applyMatchConditionDeltaV2(state, {
  deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
  matchCompletionKey: `training-audit-${fixture.matchId}`,
  matchId: fixture.matchId,
  matchDayDate: state.currentDate,
  playerFatigueDeltaBp: { p001: 3500, p002: 3500, p003: 3500, p004: 3500 },
}, schedule);

for (const [playerId, directive] of [
  ["p001", "BATTING_PRACTICE"],
  ["p002", "BOWLING_PRACTICE"],
  ["p003", "FIELDING_PRACTICE"],
] as const) {
  state = setTrainingDirective(state, {
    command: "SET_TRAINING_DIRECTIVE",
    playerId,
    directive,
    effectiveDate: state.currentDate,
    expectedRevision: state.revision,
  }).state;
}

const beforeAdvanceSha256 = state.stateSha256;
const day2 = advanceCareerDayV2(state);
state = day2.state;
const team1Day2 = projectSquadTrainingCondition(state, "team-01");
const player = (id: string) => team1Day2.players.find((entry) => entry.playerId === id)!;

if (player("p001").fatigueBp !== 2100 || player("p004").fatigueBp !== 1500) {
  throw new Error("PASS_12C_RECOVERY_POLICY_MISMATCH");
}
if (player("p001").battingReadiness !== 1 || player("p002").bowlingReadiness !== 1 || player("p003").fieldingReadiness !== 1) {
  throw new Error("PASS_12C_PRACTICE_READINESS_MISMATCH");
}
if (player("p004").battingReadiness !== 0 || player("p004").bowlingReadiness !== 0 || player("p004").fieldingReadiness !== 0) {
  throw new Error("PASS_12C_REST_READINESS_MISMATCH");
}

state = setTrainingDirective(state, {
  command: "SET_TRAINING_DIRECTIVE",
  playerId: "p001",
  directive: "REST",
  effectiveDate: state.currentDate,
  expectedRevision: state.revision,
}).state;
const day3 = advanceCareerDayV2(state);
state = day3.state;
const team1Day3 = projectSquadTrainingCondition(state, "team-01");
const p001Day3 = team1Day3.players.find((entry) => entry.playerId === "p001")!;
if (p001Day3.battingReadiness !== 0 || p001Day3.fatigueBp !== 100) {
  throw new Error("PASS_12C_DECAY_OR_SECOND_DAY_RECOVERY_MISMATCH");
}
validateCareerDayStateV2(state);

const summary = {
  status: "PASS",
  careerStateVersion: state.careerStateVersion,
  conditionPolicyVersion: state.conditionPolicyVersion,
  trainingPolicyVersion: state.trainingPolicyVersion,
  noPermanentAttributeGrowth: T20_CAREER_TRAINING_POLICY.noPermanentAttributeGrowth,
  restRecoveryPerDayBp: T20_CAREER_TRAINING_POLICY.restRecoveryPerDayBp,
  practiceRecoveryPerDayBp: T20_CAREER_TRAINING_POLICY.practiceRecoveryPerDayBp,
  readinessRange: [T20_CAREER_TRAINING_POLICY.readinessMinRatingDelta, T20_CAREER_TRAINING_POLICY.readinessMaxRatingDelta],
  beforeAdvanceSha256,
  day2StateSha256: day2.state.stateSha256,
  day3StateSha256: day3.state.stateSha256,
  day2: {
    date: day2.state.currentDate,
    restPlayers: day2.receipt.restPlayers,
    practicePlayers: day2.receipt.practicePlayers,
    p001FatigueBp: player("p001").fatigueBp,
    p001BattingReadiness: player("p001").battingReadiness,
    p002BowlingReadiness: player("p002").bowlingReadiness,
    p003FieldingReadiness: player("p003").fieldingReadiness,
    p004FatigueBp: player("p004").fatigueBp,
  },
  day3: {
    date: day3.state.currentDate,
    p001FatigueBp: p001Day3.fatigueBp,
    p001BattingReadiness: p001Day3.battingReadiness,
  },
};

if (process.argv.includes("--accept-golden")) {
  await writeFile(goldenPath, `${JSON.stringify({
    beforeAdvanceSha256: summary.beforeAdvanceSha256,
    day2StateSha256: summary.day2StateSha256,
    day3StateSha256: summary.day3StateSha256,
  }, null, 2)}\n`);
} else {
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  for (const key of ["beforeAdvanceSha256", "day2StateSha256", "day3StateSha256"] as const) {
    if (summary[key] !== golden[key]) throw new Error(`PASS_12C_GOLDEN_MISMATCH:${key}`);
  }
}
if (process.argv.includes("--write")) {
  await writeFile("docs/verification-pass12c/career-training-audit.json", `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(canonicalJson(summary));
