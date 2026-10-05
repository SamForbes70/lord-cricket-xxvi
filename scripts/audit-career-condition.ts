import { readFile, writeFile } from "node:fs/promises";
import { canonicalJson } from "@lcxxvi/contracts";
import { FICTIONAL_EIGHT_TEAM_ROSTERS } from "@lcxxvi/data";
import {
  advanceCareerDay,
  applyMatchConditionDelta,
  createCareerDayState,
  generateSeasonSchedule,
  projectSquadCondition,
  validateCareerAvailabilityPack,
  validateCareerDayState,
} from "@lcxxvi/simulation";

const scheduleRequest = JSON.parse(await readFile("tests/fixtures/season/schedule-request.json", "utf8"));
const availabilityInput = JSON.parse(await readFile("tests/fixtures/career/availability-pack.json", "utf8"));
const delta = JSON.parse(await readFile("tests/fixtures/career/match-condition-delta.json", "utf8"));
const world = JSON.parse(await readFile("packages/data/worlds/fictional-eight-01.json", "utf8"));
const goldenPath = "tests/fixtures/career/career-condition-golden.json";

const actualRosterMap = Object.fromEntries(world.teams.map((team: { teamId: string; squadIds: string[] }) => [team.teamId, team.squadIds]));
if (canonicalJson(actualRosterMap) !== canonicalJson(FICTIONAL_EIGHT_TEAM_ROSTERS)) {
  throw new Error("PASS_12B_WORLD_ROSTER_MAP_MISMATCH");
}

const schedule = generateSeasonSchedule(scheduleRequest);
const availabilityPack = validateCareerAvailabilityPack(availabilityInput);
const initial = createCareerDayState({ careerId: "career-condition-audit", schedule, availabilityPack });
const fatigued = applyMatchConditionDelta(initial, delta, schedule);
const duplicate = applyMatchConditionDelta(fatigued, delta, schedule);
if (duplicate.stateSha256 !== fatigued.stateSha256 || duplicate.revision !== fatigued.revision) {
  throw new Error("PASS_12B_DUPLICATE_COMPLETION_NOT_IDEMPOTENT");
}
const day2 = advanceCareerDay(fatigued).state;
const day3 = advanceCareerDay(day2).state;
const team1Day2 = projectSquadCondition(day2, "team-01", availabilityPack);
const team1Day3 = projectSquadCondition(day3, "team-01", availabilityPack);
const p001Day2 = team1Day2.players.find((p) => p.playerId === "p001")!;
const p002Day2 = team1Day2.players.find((p) => p.playerId === "p002")!;
const p001Day3 = team1Day3.players.find((p) => p.playerId === "p001")!;

if (p001Day2.fatigueBp !== 1500 || p002Day2.fatigueBp !== 0 || p001Day2.availability !== "UNAVAILABLE") {
  throw new Error("PASS_12B_DAY2_CONDITION_MISMATCH");
}
if (p001Day3.fatigueBp !== 0 || p001Day3.availability !== "UNAVAILABLE") {
  throw new Error("PASS_12B_DAY3_CONDITION_MISMATCH");
}
if (day2.currentDate !== "2027-01-04" || day3.currentDate !== "2027-01-05") {
  throw new Error("PASS_12B_CAREER_DATE_MISMATCH");
}
if (fatigued.appliedMatchConditions.length !== 1 || fatigued.revision !== 1 || day3.revision !== 3) {
  throw new Error("PASS_12B_REVISION_OR_COMPLETION_MISMATCH");
}
validateCareerDayState(day3);

const summary = {
  status: "PASS",
  careerStateVersion: initial.careerStateVersion,
  conditionPolicyVersion: initial.conditionPolicyVersion,
  worldPackId: initial.worldPackId,
  playerConditions: initial.playerConditions.length,
  teamCount: Object.keys(FICTIONAL_EIGHT_TEAM_ROSTERS).length,
  playersPerTeam: Object.values(FICTIONAL_EIGHT_TEAM_ROSTERS).map((ids) => ids.length),
  initialDate: initial.currentDate,
  finalScheduledDate: initial.finalScheduledDate,
  initialStateSha256: initial.stateSha256,
  fatiguedStateSha256: fatigued.stateSha256,
  day2StateSha256: day2.stateSha256,
  day3StateSha256: day3.stateSha256,
  availabilityPackId: availabilityPack.packId,
  appliedCompletionKeys: fatigued.appliedMatchConditions.map((entry) => entry.matchCompletionKey),
  day2: {
    date: day2.currentDate,
    p001FatigueBp: p001Day2.fatigueBp,
    p001Availability: p001Day2.availability,
    p002FatigueBp: p002Day2.fatigueBp,
  },
  day3: {
    date: day3.currentDate,
    p001FatigueBp: p001Day3.fatigueBp,
    p001Availability: p001Day3.availability,
  },
};

if (process.argv.includes("--accept-golden")) {
  await writeFile(goldenPath, `${JSON.stringify({
    initialStateSha256: summary.initialStateSha256,
    fatiguedStateSha256: summary.fatiguedStateSha256,
    day2StateSha256: summary.day2StateSha256,
    day3StateSha256: summary.day3StateSha256,
  }, null, 2)}\n`);
} else {
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  for (const key of ["initialStateSha256", "fatiguedStateSha256", "day2StateSha256", "day3StateSha256"] as const) {
    if (summary[key] !== golden[key]) throw new Error(`PASS_12B_GOLDEN_MISMATCH:${key}`);
  }
}

if (process.argv.includes("--write")) {
  await writeFile("docs/verification-pass12b/career-condition-audit.json", `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(canonicalJson(summary));
