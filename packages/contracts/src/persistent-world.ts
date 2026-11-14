import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";
import {
  SeasonArchiveSchema,
  T20SeasonStateSchema,
} from "./season-persistence.js";
import {
  SeasonLeaderboardEntrySchema,
  SeasonLeaderboardsSchema,
  SeasonPlayerStatsSchema,
  SeasonTeamTableRowSchema,
  T20SeasonMatchCompletionSchema,
} from "./season-projections.js";

export const MAX_PERSISTENT_SEASONS = 200 as const;
export const MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES = 128_000_000 as const;

export const PERSISTENT_WORLD_IDENTITY_VERSION = "LC_PERSISTENT_WORLD_IDENTITY_V1" as const;
export const COMPLETED_SEASON_RECORD_VERSION = "LC_COMPLETED_SEASON_RECORD_V1" as const;
export const PERSISTENT_CAREER_PROJECTION_VERSION = "LC_PERSISTENT_CAREER_PROJECTION_V1" as const;
export const PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION = "LC_PERSISTENT_WORLD_ROLLOVER_RECEIPT_V1" as const;
export const PERSISTENT_WORLD_STATE_VERSION = "LC_PERSISTENT_WORLD_STATE_V1" as const;
export const PERSISTENT_WORLD_SAVE_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V1" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V1_PRESENTATION" as const;
export const PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION = "LC_PERSISTENT_WORLD_PORTABLE_V1" as const;

export const PersistentWorldIdentitySchema = z.strictObject({
  worldIdentityVersion: z.literal(PERSISTENT_WORLD_IDENTITY_VERSION),
  worldId: IDSchema,
  worldPackId: IDSchema,
  worldCanonicalSha256: HashSchema,
  baseSeed: z.string().min(1).max(256),
  originKind: z.enum(["NEW_PERSISTENT_CAREER", "COPIED_FROM_SINGLE_SEASON_V1"]),
  sourceSingleSeasonSaveId: IDSchema.nullable(),
  sourceSingleSeasonFinalStateSha256: HashSchema.nullable(),
});

export const CompletedSeasonRecordCoreSchema = z.strictObject({
  completedSeasonVersion: z.literal(COMPLETED_SEASON_RECORD_VERSION),
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  seasonId: IDSchema,
  gameId: IDSchema,
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  scheduleSha256: HashSchema,
  finalSeasonStateSha256: HashSchema,
  championTeamId: IDSchema,
  runnerUpTeamId: IDSchema,
  seasonArchive: SeasonArchiveSchema,
  table: z.array(SeasonTeamTableRowSchema).length(8),
  players: z.array(SeasonPlayerStatsSchema).max(10000),
  leaders: SeasonLeaderboardsSchema,
  completedMatches: z.array(T20SeasonMatchCompletionSchema).length(56),
});

export const CompletedSeasonRecordSchema = z.strictObject({
  ...CompletedSeasonRecordCoreSchema.shape,
  recordSha256: HashSchema,
});

export const PersistentCareerPlayerStatsSchema = z.strictObject({
  playerId: IDSchema,
  teamId: IDSchema,
  seasonsPlayed: CounterSchema.max(MAX_PERSISTENT_SEASONS),
  matches: CounterSchema,
  battingInnings: CounterSchema,
  notOuts: CounterSchema,
  runs: CounterSchema,
  dismissals: CounterSchema,
  ballsFaced: CounterSchema,
  fours: CounterSchema,
  sixes: CounterSchema,
  fifties: CounterSchema,
  hundreds: CounterSchema,
  ducks: CounterSchema,
  highScoreRuns: CounterSchema,
  highScoreNotOut: z.boolean(),
  battingAverageX100: CounterSchema.nullable(),
  strikeRateX100: CounterSchema.nullable(),
  bowlingInnings: CounterSchema,
  bowlingRunsConceded: CounterSchema,
  bowlingLegalBalls: CounterSchema,
  bowlingWickets: CounterSchema,
  maidens: CounterSchema,
  bestBowlingWickets: CounterSchema,
  bestBowlingRuns: CounterSchema.nullable(),
  bowlingAverageX100: CounterSchema.nullable(),
  economyX100: CounterSchema.nullable(),
  bowlingStrikeRateX100: CounterSchema.nullable(),
});

export const PersistentCareerTeamHistoryRowSchema = z.strictObject({
  teamId: IDSchema,
  seasonsCompleted: CounterSchema.max(MAX_PERSISTENT_SEASONS),
  titles: CounterSchema.max(MAX_PERSISTENT_SEASONS),
  runnerUpFinishes: CounterSchema.max(MAX_PERSISTENT_SEASONS),
  played: CounterSchema,
  wins: CounterSchema,
  losses: CounterSchema,
  ties: CounterSchema,
  noResults: CounterSchema,
  points: CounterSchema,
  runsFor: CounterSchema,
  ballsFor: CounterSchema,
  runsAgainst: CounterSchema,
  ballsAgainst: CounterSchema,
});

export const SeasonRollOfHonourEntrySchema = z.strictObject({
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  seasonId: IDSchema,
  championTeamId: IDSchema,
  runnerUpTeamId: IDSchema,
  leadingRunScorer: SeasonLeaderboardEntrySchema.nullable(),
  leadingWicketTaker: SeasonLeaderboardEntrySchema.nullable(),
  finalSeasonStateSha256: HashSchema,
});

export const PersistentCareerProjectionCoreSchema = z.strictObject({
  careerProjectionVersion: z.literal(PERSISTENT_CAREER_PROJECTION_VERSION),
  worldId: IDSchema,
  completedSeasonCount: CounterSchema.max(MAX_PERSISTENT_SEASONS),
  activeSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  activeSeasonMatchesApplied: CounterSchema.max(56),
  totalMatchesApplied: CounterSchema,
  rollOfHonour: z.array(SeasonRollOfHonourEntrySchema).max(MAX_PERSISTENT_SEASONS),
  teamHistory: z.array(PersistentCareerTeamHistoryRowSchema).length(8),
  players: z.array(PersistentCareerPlayerStatsSchema).max(10000),
  leaders: SeasonLeaderboardsSchema,
});

export const PersistentCareerProjectionSchema = z.strictObject({
  ...PersistentCareerProjectionCoreSchema.shape,
  projectionSha256: HashSchema,
});

export const PersistentWorldRolloverReceiptSchema = z.strictObject({
  receiptVersion: z.literal(PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION),
  fromSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS - 1),
  toSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  closedSeasonId: IDSchema,
  closedSeasonStateSha256: HashSchema,
  closedSeasonRecordSha256: HashSchema,
  nextSeasonId: IDSchema,
  nextStartDate: z.iso.date(),
  nextScheduleSha256: HashSchema,
});

export const PersistentWorldStateCoreSchema = z.strictObject({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_VERSION),
  worldIdentity: PersistentWorldIdentitySchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  currentSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  currentCalendarYear: z.number().int().min(1900).max(9999),
  currentSeason: T20SeasonStateSchema,
  completedSeasons: z.array(CompletedSeasonRecordSchema).max(MAX_PERSISTENT_SEASONS - 1),
  careerProjection: PersistentCareerProjectionSchema,
  lastRolloverReceipt: PersistentWorldRolloverReceiptSchema.nullable(),
  revision: CounterSchema,
});

export const PersistentWorldStateSchema = z.strictObject({
  ...PersistentWorldStateCoreSchema.shape,
  stateSha256: HashSchema,
});

export const PersistentWorldSaveSummarySchema = z.strictObject({
  saveId: IDSchema,
  kind: z.enum(["AUTO", "MANUAL", "IMPORTED"]),
  title: z.string().min(1).max(240),
  worldId: IDSchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  currentSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  currentCalendarYear: z.number().int().min(1900).max(9999),
  completedSeasonCount: CounterSchema.max(MAX_PERSISTENT_SEASONS - 1),
  seasonId: IDSchema,
  currentDate: z.iso.date(),
  revision: CounterSchema,
  completedFixtures: CounterSchema.max(56),
  phase: z.enum(["ACTIVE", "COMPLETE"]),
  stateSha256: HashSchema,
  updatedAt: z.iso.datetime(),
});

export const PersistentWorldPortableManifestSchema = z.strictObject({
  archiveVersion: z.literal(PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION),
  saveSchema: z.enum([
    PERSISTENT_WORLD_SAVE_SCHEMA_VERSION,
    PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION,
  ]),
  exportedAt: z.iso.datetime(),
  summary: PersistentWorldSaveSummarySchema,
  careerProjectionSha256: HashSchema,
  worldCopySha256: HashSchema.optional(),
  matchEventArchiveCount: CounterSchema.max(MAX_PERSISTENT_SEASONS * 56),
  files: z.record(z.string().min(1), z.strictObject({ bytes: CounterSchema, sha256: HashSchema })),
});

export type PersistentWorldIdentity = z.infer<typeof PersistentWorldIdentitySchema>;
export type CompletedSeasonRecordCore = z.infer<typeof CompletedSeasonRecordCoreSchema>;
export type CompletedSeasonRecord = z.infer<typeof CompletedSeasonRecordSchema>;
export type PersistentCareerPlayerStats = z.infer<typeof PersistentCareerPlayerStatsSchema>;
export type PersistentCareerTeamHistoryRow = z.infer<typeof PersistentCareerTeamHistoryRowSchema>;
export type SeasonRollOfHonourEntry = z.infer<typeof SeasonRollOfHonourEntrySchema>;
export type PersistentCareerProjectionCore = z.infer<typeof PersistentCareerProjectionCoreSchema>;
export type PersistentCareerProjection = z.infer<typeof PersistentCareerProjectionSchema>;
export type PersistentWorldRolloverReceipt = z.infer<typeof PersistentWorldRolloverReceiptSchema>;
export type PersistentWorldStateCore = z.infer<typeof PersistentWorldStateCoreSchema>;
export type PersistentWorldState = z.infer<typeof PersistentWorldStateSchema>;
export type PersistentWorldSaveSummary = z.infer<typeof PersistentWorldSaveSummarySchema>;
export type PersistentWorldPortableManifest = z.infer<typeof PersistentWorldPortableManifestSchema>;
