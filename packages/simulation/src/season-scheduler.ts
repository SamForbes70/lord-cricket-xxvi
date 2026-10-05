import {
  SeasonScheduleCoreSchema,
  SeasonScheduleRequestSchema,
  SeasonScheduleSchema,
  type SeasonFixture,
  type SeasonSchedule,
  type SeasonScheduleCore,
  type SeasonScheduleRequest,
} from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";

const hasher = createStateHasher();

function assertCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`INVALID_SEASON_SCHEDULE: ${code}`);
}

function addCalendarDays(isoDate: string, days: number): string {
  const [yearText, monthText, dayText] = isoDate.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  let day = Number(dayText);
  assertCondition(Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day), "INVALID_START_DATE");
  assertCondition(Number.isInteger(days) && days >= 0, "INVALID_DAY_OFFSET");
  const daysInMonth = (y: number, m: number) => {
    if (m === 2) {
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(m) ? 30 : 31;
  };
  for (let offset = 0; offset < days; offset += 1) {
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function firstHalfPairings(teamIds: readonly string[]) {
  const rotating = [...teamIds];
  const rounds: Array<Array<readonly [string, string]>> = [];
  for (let roundIndex = 0; roundIndex < 7; roundIndex += 1) {
    const pairs: Array<readonly [string, string]> = [];
    for (let pairIndex = 0; pairIndex < 4; pairIndex += 1) {
      const left = rotating[pairIndex];
      const right = rotating[rotating.length - 1 - pairIndex];
      assertCondition(left && right && left !== right, "CIRCLE_PAIRING_FAILURE");
      // Venue orientation is deterministic. The second half reverses every pair,
      // guaranteeing exactly seven home and seven away fixtures per team overall.
      pairs.push(roundIndex % 2 === 0 ? [left, right] : [right, left]);
    }
    rounds.push(pairs);
    rotating.splice(1, 0, rotating.pop()!);
  }
  return rounds;
}

function validateRequestReferences(request: SeasonScheduleRequest) {
  const teamIds = [...request.teamIds].sort();
  const groundIds = [...request.groundIds].sort();
  assertCondition(request.worldCanonicalSha256 === FROZEN_WORLD_PINS.worldCanonicalSha256, "UNTRUSTED_WORLD_HASH");
  assertCondition(request.worldPackId === T20_LEAGUE_COMPETITION.worldPackId, "COMPETITION_WORLD_PACK_MISMATCH");
  assertCondition(JSON.stringify(teamIds) === JSON.stringify([...T20_LEAGUE_COMPETITION.teamIds].sort()), "COMPETITION_TEAM_MEMBERSHIP_MISMATCH");
  assertCondition(JSON.stringify(groundIds) === JSON.stringify([...T20_LEAGUE_COMPETITION.groundIds].sort()), "COMPETITION_GROUND_MEMBERSHIP_MISMATCH");
  assertCondition(JSON.stringify(request.homeGroundIds) === JSON.stringify(T20_LEAGUE_COMPETITION.homeGroundIds), "COMPETITION_HOME_GROUNDS_MISMATCH");
  assertCondition(new Set(teamIds).size === 8, "TEAM_IDS_MUST_BE_UNIQUE");
  assertCondition(new Set(groundIds).size === 8, "GROUND_IDS_MUST_BE_UNIQUE");
  assertCondition(Object.keys(request.homeGroundIds).length === 8, "HOME_GROUND_KEYS");
  for (const teamId of teamIds) {
    const groundId = request.homeGroundIds[teamId];
    assertCondition(Boolean(groundId), `MISSING_HOME_GROUND:${teamId}`);
    assertCondition(groundIds.includes(groundId!), `UNKNOWN_HOME_GROUND:${String(groundId)}`);
  }
  for (const key of Object.keys(request.homeGroundIds)) {
    assertCondition(teamIds.includes(key), `UNKNOWN_HOME_GROUND_TEAM:${key}`);
  }
  assertCondition(new Set(Object.values(request.homeGroundIds)).size === 8, "HOME_GROUNDS_MUST_BE_UNIQUE");
  return { teamIds, groundIds };
}

function scheduleCore(input: unknown): SeasonScheduleCore {
  const request = SeasonScheduleRequestSchema.parse(input);
  const { teamIds, groundIds } = validateRequestReferences(request);
  const firstHalf = firstHalfPairings(teamIds);
  const allPairings = [
    ...firstHalf,
    ...firstHalf.map((round) => round.map(([home, away]) => [away, home] as const)),
  ];
  const seasonSeedHash = hasher.hash({ seasonSeed: request.seasonSeed });
  const seasonKey = hasher.hash({
    scheduleVersion: request.scheduleVersion,
    seasonId: request.seasonId,
    gameId: request.gameId,
    competitionId: request.competitionId,
    worldCanonicalSha256: request.worldCanonicalSha256,
    startDate: request.startDate,
    teamIds,
    groundIds,
    homeGroundIds: request.homeGroundIds,
    seasonSeedHash,
  }).slice(0, 16);

  const fixtures: SeasonFixture[] = [];
  const rounds = allPairings.map((pairs, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const matchDayDate = addCalendarDays(request.startDate, roundIndex * T20_LEAGUE_COMPETITION.roundSpacingDays);
    const fixtureIds: string[] = [];
    pairs.forEach(([homeTeamId, awayTeamId], pairIndex) => {
      const roundFixtureIndex = pairIndex + 1;
      const suffix = `r${String(roundNumber).padStart(2, "0")}-m${String(roundFixtureIndex).padStart(2, "0")}`;
      const fixtureId = `fx-${seasonKey}-${suffix}`;
      const matchId = `m-${seasonKey}-${suffix}`;
      const matchSeed = hasher.hash({
        schedulerVersion: request.scheduleVersion,
        seasonSeed: request.seasonSeed,
        fixtureId,
        homeTeamId,
        awayTeamId,
      });
      fixtureIds.push(fixtureId);
      fixtures.push({
        fixtureId,
        matchId,
        ordinal: fixtures.length,
        roundNumber,
        roundFixtureIndex,
        matchDayDate,
        homeTeamId,
        awayTeamId,
        groundId: request.homeGroundIds[homeTeamId]!,
        matchSeed,
        status: "SCHEDULED",
      });
    });
    return { roundNumber, matchDayDate, fixtureIds };
  });

  return SeasonScheduleCoreSchema.parse({
    scheduleVersion: request.scheduleVersion,
    schedulerAlgorithm: T20_LEAGUE_COMPETITION.schedulerAlgorithm,
    seasonId: request.seasonId,
    gameId: request.gameId,
    competitionId: request.competitionId,
    worldPackId: request.worldPackId,
    worldCanonicalSha256: request.worldCanonicalSha256,
    seasonSeedHash,
    startDate: request.startDate,
    teamIds,
    groundIds,
    homeGroundIds: request.homeGroundIds,
    rounds,
    fixtures,
  });
}

export function validateSeasonSchedule(input: unknown): SeasonSchedule {
  const schedule = SeasonScheduleSchema.parse(input);
  const coreInput = Object.fromEntries(
    Object.entries(schedule).filter(([key]) => key !== "scheduleSha256"),
  );
  const core = SeasonScheduleCoreSchema.parse(coreInput);
  assertCondition(hasher.hash(core) === schedule.scheduleSha256, "SCHEDULE_HASH_MISMATCH");

  const seenFixtureIds = new Set<string>();
  const seenMatchIds = new Set<string>();
  const orderedPairs = new Set<string>();
  const homeCounts = new Map(schedule.teamIds.map((id) => [id, 0]));
  const awayCounts = new Map(schedule.teamIds.map((id) => [id, 0]));

  assertCondition(schedule.rounds.length === 14 && schedule.fixtures.length === 56, "CARDINALITY");
  schedule.rounds.forEach((round, roundIndex) => {
    assertCondition(round.roundNumber === roundIndex + 1, "ROUND_NUMBER_SEQUENCE");
    assertCondition(round.matchDayDate === addCalendarDays(schedule.startDate, roundIndex * T20_LEAGUE_COMPETITION.roundSpacingDays), "ROUND_DATE_SEQUENCE");
    const roundFixtures = schedule.fixtures.filter((f) => f.roundNumber === round.roundNumber);
    assertCondition(roundFixtures.length === 4, "ROUND_FIXTURE_COUNT");
    assertCondition(JSON.stringify(round.fixtureIds) === JSON.stringify(roundFixtures.map((f) => f.fixtureId)), "ROUND_FIXTURE_REFERENCES");
    const roundTeams = roundFixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]);
    assertCondition(new Set(roundTeams).size === 8, "TEAM_PLAYS_MORE_THAN_ONCE_IN_ROUND");
  });

  for (const fixture of schedule.fixtures) {
    assertCondition(!seenFixtureIds.has(fixture.fixtureId), "DUPLICATE_FIXTURE_ID");
    assertCondition(!seenMatchIds.has(fixture.matchId), "DUPLICATE_MATCH_ID");
    seenFixtureIds.add(fixture.fixtureId);
    seenMatchIds.add(fixture.matchId);
    assertCondition(schedule.teamIds.includes(fixture.homeTeamId) && schedule.teamIds.includes(fixture.awayTeamId), "UNKNOWN_FIXTURE_TEAM");
    assertCondition(fixture.homeTeamId !== fixture.awayTeamId, "SELF_FIXTURE");
    assertCondition(schedule.groundIds.includes(fixture.groundId), "UNKNOWN_FIXTURE_GROUND");
    assertCondition(schedule.homeGroundIds[fixture.homeTeamId] === fixture.groundId, "FIXTURE_NOT_AT_HOME_GROUND");
    const pair = `${fixture.homeTeamId}>${fixture.awayTeamId}`;
    assertCondition(!orderedPairs.has(pair), `DUPLICATE_ORDERED_PAIR:${pair}`);
    orderedPairs.add(pair);
    homeCounts.set(fixture.homeTeamId, homeCounts.get(fixture.homeTeamId)! + 1);
    awayCounts.set(fixture.awayTeamId, awayCounts.get(fixture.awayTeamId)! + 1);
  }
  assertCondition(orderedPairs.size === 56, "ORDERED_PAIR_COUNT");
  for (const teamId of schedule.teamIds) {
    assertCondition(homeCounts.get(teamId) === 7 && awayCounts.get(teamId) === 7, `VENUE_BALANCE:${teamId}`);
  }
  for (let roundIndex = 0; roundIndex < 7; roundIndex += 1) {
    const first = schedule.fixtures.filter((f) => f.roundNumber === roundIndex + 1);
    const second = schedule.fixtures.filter((f) => f.roundNumber === roundIndex + 8);
    for (let i = 0; i < 4; i += 1) {
      assertCondition(first[i]!.homeTeamId === second[i]!.awayTeamId && first[i]!.awayTeamId === second[i]!.homeTeamId, "SECOND_HALF_VENUE_REVERSAL");
    }
  }
  return schedule;
}

export function generateSeasonSchedule(input: unknown): SeasonSchedule {
  const core = scheduleCore(input);
  return validateSeasonSchedule({ ...core, scheduleSha256: hasher.hash(core) });
}
