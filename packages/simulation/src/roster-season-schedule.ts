import {
  RosterSeasonScheduleRequestSchema, RosterSeasonScheduleSchema,
  type RosterSeasonSchedule, type StagedRosterPack,
} from "@lcxxvi/contracts";
import { RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { validateStagedRosterPack } from "./roster-import.js";
import { addCalendarDays, firstHalfPairings } from "./season-scheduler.js";

const hash = createStateHasher().hash;
const verifiedRosterSchedules = new WeakMap<object, StagedRosterPack>();
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function generateRosterSeasonSchedule(rawPack: StagedRosterPack, rawRequest: unknown): RosterSeasonSchedule {
  const request = RosterSeasonScheduleRequestSchema.parse(rawRequest);
  const pack = validateStagedRosterPack(rawPack, RULE_MANIFESTS.map(rule => rule.rulesId), SYNTHETIC_ALPHA_PACK.manifest.variationIds);
  const teamIds = pack.world.teams.map(team => team.teamId).sort();
  const groundIds = pack.world.grounds.map(ground => ground.groundId).sort();
  if (teamIds.length !== 8 || groundIds.length !== 8 || !pack.world.rulesIds.includes("LC_T20_01")) throw new Error("ROSTER_SEASON_REQUIRES_EIGHT_TEAMS_AND_GROUNDS");
  const homeGroundIds = Object.fromEntries(teamIds.map((id, index) => [id, groundIds[index]!]));
  const firstHalf = firstHalfPairings(teamIds);
  const allRounds = [...firstHalf, ...firstHalf.map(round => round.map(([home, away]) => [away, home] as const))];
  const rosterPackHash = hash(pack);
  const worldHash = hash(pack.world);
  const key = hash({ version: "LC_T20_ROSTER_SCHEDULE_V2", request, rosterPackHash, worldHash, teamIds, groundIds }).slice(0, 16);
  const fixtures = allRounds.flatMap((pairs, index) => pairs.map(([homeTeamId, awayTeamId], pairIndex) => {
    const roundNumber = index + 1;
    const suffix = `r${String(roundNumber).padStart(2, "0")}-m${String(pairIndex + 1).padStart(2, "0")}`;
    const fixtureId = `fx-${key}-${suffix}`;
    return { fixtureId, matchId: `m-${key}-${suffix}`, ordinal: index * 4 + pairIndex,
      roundNumber, roundFixtureIndex: pairIndex + 1, matchDayDate: addCalendarDays(request.startDate, index * 3),
      homeTeamId, awayTeamId, groundId: homeGroundIds[homeTeamId]!,
      matchSeed: hash({ version: "LC_T20_ROSTER_SCHEDULE_V2", seed: request.seasonSeed, fixtureId, homeTeamId, awayTeamId }),
      status: "SCHEDULED" as const };
  }));
  const rounds = allRounds.map((_, index) => ({ roundNumber: index + 1,
    matchDayDate: addCalendarDays(request.startDate, index * 3),
    fixtureIds: fixtures.slice(index * 4, index * 4 + 4).map(fixture => fixture.fixtureId) }));
  const core = { version: "LC_T20_ROSTER_SCHEDULE_V2" as const, request, rosterPackHash, worldHash, teamIds, groundIds, homeGroundIds, rounds, fixtures };
  const parsed = deepFreeze(RosterSeasonScheduleSchema.parse({ ...core, scheduleSha256: hash(core) }));
  verifiedRosterSchedules.set(parsed, pack);
  return parsed;
}

export function validateRosterSeasonSchedule(raw: unknown, pack: StagedRosterPack): RosterSeasonSchedule {
  const validatedPack = validateStagedRosterPack(pack, RULE_MANIFESTS.map(rule => rule.rulesId), SYNTHETIC_ALPHA_PACK.manifest.variationIds);
  if (raw !== null && typeof raw === "object" && Object.isFrozen(raw) && verifiedRosterSchedules.get(raw) === validatedPack) {
    return raw as RosterSeasonSchedule;
  }
  const schedule = RosterSeasonScheduleSchema.parse(raw);
  const rebuilt = generateRosterSeasonSchedule(validatedPack, schedule.request);
  if (hash(schedule) !== hash(rebuilt)) throw new Error("ROSTER_SEASON_SCHEDULE_MISMATCH");
  deepFreeze(schedule);
  verifiedRosterSchedules.set(schedule, validatedPack);
  return schedule;
}
