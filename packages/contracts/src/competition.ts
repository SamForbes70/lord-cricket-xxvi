import { z } from "zod";
import { HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

export const T20LeagueCompetitionManifestSchema = z.strictObject({
  competitionVersion: z.literal("LC_T20_LEAGUE_COMPETITION_V1"),
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  format: z.literal("T20"),
  worldPackId: z.literal("fictional-eight-01"),
  worldCanonicalSha256: HashSchema,
  teamIds: z.array(IDSchema).length(8),
  groundIds: z.array(IDSchema).length(8),
  homeGroundIds: z.record(IDSchema, IDSchema),
  teamCount: z.literal(8),
  rounds: z.literal(14),
  matchesPerRound: z.literal(4),
  totalFixtures: z.literal(56),
  roundSpacingDays: z.literal(3),
  playoffs: z.literal(false),
  points: z.strictObject({
    win: z.literal(2),
    tie: z.literal(1),
    noResult: z.literal(1),
    loss: z.literal(0),
  }),
  tableOrder: z.tuple([
    z.literal("POINTS"),
    z.literal("WINS"),
    z.literal("NET_RUN_RATE"),
    z.literal("HEAD_TO_HEAD_POINTS"),
    z.literal("TEAM_ID"),
  ]),
  rainAdjustedNrr: z.literal(false),
  schedulerAlgorithm: z.literal("CIRCLE_REVERSE_VENUES_V1"),
});

export const SeasonScheduleRequestSchema = z.strictObject({
  scheduleVersion: z.literal("LC_T20_SEASON_SCHEDULE_V1"),
  seasonId: IDSchema,
  gameId: IDSchema,
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  worldPackId: z.literal("fictional-eight-01"),
  worldCanonicalSha256: HashSchema,
  seasonSeed: z.string().min(1).max(256),
  startDate: z.iso.date(),
  teamIds: z.array(IDSchema).length(8),
  groundIds: z.array(IDSchema).length(8),
  homeGroundIds: z.record(IDSchema, IDSchema),
});

export const SeasonFixtureSchema = z.strictObject({
  fixtureId: IDSchema,
  matchId: IDSchema,
  ordinal: z.number().int().min(0).max(55),
  roundNumber: PositiveCounterSchema.max(14),
  roundFixtureIndex: PositiveCounterSchema.max(4),
  matchDayDate: z.iso.date(),
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  groundId: IDSchema,
  matchSeed: HashSchema,
  status: z.literal("SCHEDULED"),
});

export const SeasonRoundSchema = z.strictObject({
  roundNumber: PositiveCounterSchema.max(14),
  matchDayDate: z.iso.date(),
  fixtureIds: z.array(IDSchema).length(4),
});

const SeasonScheduleCoreShape = {
  scheduleVersion: z.literal("LC_T20_SEASON_SCHEDULE_V1"),
  schedulerAlgorithm: z.literal("CIRCLE_REVERSE_VENUES_V1"),
  seasonId: IDSchema,
  gameId: IDSchema,
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  worldPackId: z.literal("fictional-eight-01"),
  worldCanonicalSha256: HashSchema,
  seasonSeedHash: HashSchema,
  startDate: z.iso.date(),
  teamIds: z.array(IDSchema).length(8),
  groundIds: z.array(IDSchema).length(8),
  homeGroundIds: z.record(IDSchema, IDSchema),
  rounds: z.array(SeasonRoundSchema).length(14),
  fixtures: z.array(SeasonFixtureSchema).length(56),
} as const;

export const SeasonScheduleCoreSchema = z.strictObject(SeasonScheduleCoreShape);
export const SeasonScheduleSchema = z.strictObject({
  ...SeasonScheduleCoreShape,
  scheduleSha256: HashSchema,
});

export type T20LeagueCompetitionManifest = z.infer<typeof T20LeagueCompetitionManifestSchema>;
export type SeasonScheduleRequest = z.infer<typeof SeasonScheduleRequestSchema>;
export type SeasonFixture = z.infer<typeof SeasonFixtureSchema>;
export type SeasonRound = z.infer<typeof SeasonRoundSchema>;
export type SeasonScheduleCore = z.infer<typeof SeasonScheduleCoreSchema>;
export type SeasonSchedule = z.infer<typeof SeasonScheduleSchema>;
