import {
  MAX_PERSISTENT_SEASONS,
  PERSISTENT_WORLD_IDENTITY_VERSION,
  PersistentWorldIdentitySchema,
  type CareerDayStateV2,
  type PersistentWorldIdentity,
  type SeasonSchedule,
  type PlayerTrainingAssignment,
} from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import { createCareerDayStateV2, setTrainingDirective, validateCareerDayStateV2 } from "./career-condition.js";
import { createStateHasher } from "./determinism.js";
import { generateSeasonSchedule } from "./season-scheduler.js";

const hasher = createStateHasher();

export const INITIAL_PERSISTENT_CALENDAR_YEAR = 2027 as const;
export const INITIAL_PERSISTENT_MONTH_DAY = "03-01" as const;
export const INITIAL_PERSISTENT_START_DATE = "2027-03-01" as const;

function assertPersistentSim(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_PERSISTENT_WORLD_SIM_${code}`);
}

export function derivePersistentWorldIdentity(input: {
  worldId: string;
  baseSeed: string;
  originKind: "NEW_PERSISTENT_CAREER" | "COPIED_FROM_SINGLE_SEASON_V1";
  sourceSingleSeasonSaveId?: string | null;
  sourceSingleSeasonFinalStateSha256?: string | null;
}): PersistentWorldIdentity {
  const sourceSaveId = input.sourceSingleSeasonSaveId ?? null;
  const sourceStateSha = input.sourceSingleSeasonFinalStateSha256 ?? null;
  if (input.originKind === "COPIED_FROM_SINGLE_SEASON_V1") {
    assertPersistentSim(
      Boolean(sourceSaveId) && Boolean(sourceStateSha),
      "COPY_ORIGIN_REQUIRES_SOURCE_IDENTIFIERS",
    );
  } else {
    assertPersistentSim(
      sourceSaveId === null && sourceStateSha === null,
      "NEW_ORIGIN_FORBIDS_SOURCE_IDENTIFIERS",
    );
  }
  return PersistentWorldIdentitySchema.parse({
    worldIdentityVersion: PERSISTENT_WORLD_IDENTITY_VERSION,
    worldId: input.worldId,
    worldPackId: FROZEN_WORLD_PINS.worldPackId,
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    baseSeed: input.baseSeed,
    originKind: input.originKind,
    sourceSingleSeasonSaveId: sourceSaveId,
    sourceSingleSeasonFinalStateSha256: sourceStateSha,
  });
}

export function derivePersistentSeasonSeed(input: {
  worldIdentity: PersistentWorldIdentity;
  seasonNumber: number;
  priorSeasonFinalStateSha256: string | null;
}): string {
  const identity = PersistentWorldIdentitySchema.parse(input.worldIdentity);
  assertPersistentSim(
    Number.isInteger(input.seasonNumber) &&
      input.seasonNumber >= 1 &&
      input.seasonNumber <= MAX_PERSISTENT_SEASONS,
    "SEASON_NUMBER_OUT_OF_RANGE",
  );
  if (input.seasonNumber === 1) {
    assertPersistentSim(
      input.priorSeasonFinalStateSha256 === null,
      "SEASON_ONE_FORBIDS_PRIOR_HASH",
    );
  } else {
    assertPersistentSim(
      typeof input.priorSeasonFinalStateSha256 === "string" &&
        input.priorSeasonFinalStateSha256.length === 64,
      "SUBSEQUENT_SEASON_REQUIRES_PRIOR_HASH",
    );
  }
  const digest = hasher.hash({
    domain: "LC_PERSISTENT_WORLD_SEASON_SEED_V1",
    worldId: identity.worldId,
    baseSeed: identity.baseSeed,
    seasonNumber: input.seasonNumber,
    priorSeasonFinalStateSha256: input.priorSeasonFinalStateSha256,
  });
  return `pworld-${identity.worldId}-s${String(input.seasonNumber).padStart(3, "0")}-${digest.slice(0, 24)}`;
}

export function advancePersistentSeasonCalendar(input: {
  closedCalendarYear: number;
  closedEndDate: string;
  seasonStartMonthDay?: string;
}): { nextCalendarYear: number; nextStartDate: string } {
  assertPersistentSim(
    Number.isInteger(input.closedCalendarYear) &&
      input.closedCalendarYear >= 1900 &&
      input.closedCalendarYear < 9999,
    "INVALID_CALENDAR_YEAR",
  );
  const monthDay = input.seasonStartMonthDay ?? INITIAL_PERSISTENT_MONTH_DAY;
  assertPersistentSim(/^\d{2}-\d{2}$/.test(monthDay), "INVALID_MONTH_DAY");
  const nextCalendarYear = input.closedCalendarYear + 1;
  const nextStartDate = `${String(nextCalendarYear).padStart(4, "0")}-${monthDay}`;
  assertPersistentSim(nextStartDate > input.closedEndDate, "NEXT_SEASON_START_NOT_AFTER_PRIOR_END");
  return { nextCalendarYear, nextStartDate };
}

export function createPersistentSeasonScheduleAndDayState(input: {
  worldIdentity: PersistentWorldIdentity;
  careerId: string;
  seasonNumber: number;
  calendarYear: number;
  startDate: string;
  priorSeasonFinalStateSha256: string | null;
  carryForwardDirectives?: readonly PlayerTrainingAssignment[];
}): {
  seasonId: string;
  gameId: string;
  seasonSeed: string;
  schedule: SeasonSchedule;
  careerState: CareerDayStateV2;
} {
  const identity = PersistentWorldIdentitySchema.parse(input.worldIdentity);
  assertPersistentSim(
    identity.worldPackId === FROZEN_WORLD_PINS.worldPackId &&
      identity.worldCanonicalSha256 === FROZEN_WORLD_PINS.worldCanonicalSha256,
    "UNTRUSTED_WORLD_IDENTITY_PINS",
  );
  assertPersistentSim(
    Number.isInteger(input.seasonNumber) &&
      input.seasonNumber >= 1 &&
      input.seasonNumber <= MAX_PERSISTENT_SEASONS,
    "SEASON_NUMBER_OUT_OF_RANGE",
  );
  assertPersistentSim(
    input.startDate.startsWith(`${String(input.calendarYear).padStart(4, "0")}-`),
    "START_DATE_YEAR_MISMATCH",
  );
  const suffix = `s${String(input.seasonNumber).padStart(3, "0")}`;
  const seasonId = `${identity.worldId}-${suffix}`;
  const gameId = `${input.careerId}-game-${suffix}`;
  const seasonSeed = derivePersistentSeasonSeed({
    worldIdentity: identity,
    seasonNumber: input.seasonNumber,
    priorSeasonFinalStateSha256: input.priorSeasonFinalStateSha256,
  });
  const schedule = generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId,
    gameId,
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: identity.worldPackId,
    worldCanonicalSha256: identity.worldCanonicalSha256,
    seasonSeed,
    startDate: input.startDate,
    teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
    groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
    homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
  });
  let careerState = createCareerDayStateV2({
    careerId: input.careerId,
    schedule,
  });
  if (input.carryForwardDirectives?.length) {
    for (const assignment of input.carryForwardDirectives) {
      if (assignment.directive === "REST") continue;
      careerState = setTrainingDirective(careerState, {
        playerId: assignment.playerId,
        directive: assignment.directive,
        effectiveDate: careerState.currentDate,
        expectedRevision: careerState.revision,
      }).state;
    }
  }
  return {
    seasonId,
    gameId,
    seasonSeed,
    schedule,
    careerState: validateCareerDayStateV2(careerState),
  };
}
