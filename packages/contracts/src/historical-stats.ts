import { z } from "zod";
import { CounterSchema, FormatSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";
import { MAX_PERSISTENT_SEASONS } from "./persistent-world.js";

export const HISTORICAL_STATS_PROJECTION_VERSION = "LC_HISTORICAL_STATISTICS_PROJECTION_V1" as const;

export const HistoricalSourceClassSchema = z.enum(["CAREER"]);

export const HistoricalBattingPositionBandSchema = z.enum([
  "ALL",
  "OPENER",
  "TOP_ORDER",
  "MIDDLE_ORDER",
  "LOWER_ORDER",
]);

export const HistoricalPlayerStatusFilterSchema = z.enum(["ALL", "ACTIVE", "RETIRED"]);

export const HistoricalSeasonScopeSchema = z.union([
  z.literal("ALL"),
  z.literal("ACTIVE"),
  PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
]);

export const HistoricalFilterQuerySchema = z.strictObject({
  seasonScope: HistoricalSeasonScopeSchema,
  format: z.literal("T20"),
  competitionId: z.string().min(1).max(64),
  opponentTeamId: z.string().min(1).max(64),
  venueGroundId: z.string().min(1).max(64),
  battingPositionBand: HistoricalBattingPositionBandSchema,
  battingPositionExact: PositiveCounterSchema.max(11).nullable(),
  playerStatus: HistoricalPlayerStatusFilterSchema,
  teamId: z.string().min(1).max(64),
});

export const HistoricalSeasonOptionSchema = z.strictObject({
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  phase: z.enum(["ACTIVE", "COMPLETE"]),
  matchesCount: CounterSchema,
});

export const HistoricalCompetitionOptionSchema = z.strictObject({
  competitionId: IDSchema,
  label: z.string().min(1).max(120),
  format: FormatSchema,
});

export const HistoricalFilterSupportSchema = z.strictObject({
  formats: z.array(FormatSchema).min(1).max(3),
  unsupportedFormatsNote: z.string().min(1).max(240),
  competitions: z.array(HistoricalCompetitionOptionSchema).max(32),
  seasons: z.array(HistoricalSeasonOptionSchema).max(MAX_PERSISTENT_SEASONS),
  opponents: z.array(IDSchema).max(64),
  teams: z.array(IDSchema).max(64),
  venues: z.strictObject({
    available: z.boolean(),
    coverage: z.enum(["ALL_RESOLVED", "PARTIAL", "UNAVAILABLE"]),
    groundIds: z.array(IDSchema).max(64),
    note: z.string().min(1).max(240),
  }),
  battingPosition: z.strictObject({
    available: z.literal(true),
    bands: z.array(HistoricalBattingPositionBandSchema).min(1),
    note: z.string().min(1).max(240),
  }),
  fielding: z.strictObject({
    available: z.boolean(),
    archiveCoverageCount: CounterSchema,
    totalMatchesCount: CounterSchema,
    coverage: z.enum(["ALL_ARCHIVED", "PARTIAL_ARCHIVES", "UNAVAILABLE"]),
    note: z.string().min(1).max(240),
  }),
});

export const HistoricalContributingMatchSchema = z.strictObject({
  fixtureId: IDSchema,
  matchId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  roundNumber: PositiveCounterSchema.max(14),
  matchDayDate: z.iso.date(),
  competitionId: IDSchema,
  format: z.literal("T20"),
  groundId: IDSchema.nullable(),
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  teamId: IDSchema,
  opponentTeamId: IDSchema,
  battedInnings: PositiveCounterSchema.max(2).nullable(),
  battingPosition: PositiveCounterSchema.max(11).nullable(),
  runsScored: CounterSchema.nullable(),
  ballsFaced: CounterSchema.nullable(),
  fours: CounterSchema.nullable(),
  sixes: CounterSchema.nullable(),
  notOut: z.boolean().nullable(),
  bowledLegalBalls: CounterSchema.nullable(),
  bowlingRunsConceded: CounterSchema.nullable(),
  bowlingWickets: CounterSchema.max(10).nullable(),
  maidens: CounterSchema.max(4).nullable(),
  catches: CounterSchema.nullable(),
  stumpings: CounterSchema.nullable(),
  runOuts: CounterSchema.nullable(),
  archiveEvaluated: z.boolean(),
  archiveReplayAvailable: z.boolean(),
  resultSummary: z.string().min(1).max(240),
  sourceCompletionSha256: HashSchema,
});

export const HistoricalPlayerRecordSchema = z.strictObject({
  playerId: IDSchema,
  status: z.enum(["ACTIVE", "RETIRED"]),
  currentTeamId: IDSchema,
  careerTeamIds: z.array(IDSchema).min(1).max(64),
  retiredAfterSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS).nullable(),
  retiredCalendarYear: z.number().int().min(1900).max(9999).nullable(),
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
  highScoreFixtureId: IDSchema.nullable(),
  battingAverageX100: CounterSchema.nullable(),
  strikeRateX100: CounterSchema.nullable(),
  boundaryRunsPercentX100: CounterSchema.nullable(),
  bowlingInnings: CounterSchema,
  bowlingRunsConceded: CounterSchema,
  bowlingLegalBalls: CounterSchema,
  bowlingWickets: CounterSchema,
  maidens: CounterSchema,
  threeWicketHauls: CounterSchema,
  fourWicketHauls: CounterSchema,
  fiveWicketHauls: CounterSchema,
  bestBowlingWickets: CounterSchema.max(10),
  bestBowlingRuns: CounterSchema.nullable(),
  bestBowlingFixtureId: IDSchema.nullable(),
  bowlingAverageX100: CounterSchema.nullable(),
  economyX100: CounterSchema.nullable(),
  bowlingStrikeRateX100: CounterSchema.nullable(),
  fieldingMatchesArchived: CounterSchema,
  catches: CounterSchema,
  stumpings: CounterSchema,
  runOuts: CounterSchema,
  totalFieldingDismissals: CounterSchema,
  bestMatchCatches: CounterSchema,
  bestMatchFieldingDismissals: CounterSchema,
  bestFieldingFixtureId: IDSchema.nullable(),
  contributingMatches: z.array(HistoricalContributingMatchSchema).max(MAX_PERSISTENT_SEASONS * 14),
});

export const HistoricalLeaderboardMetricSchema = z.enum([
  "RUNS",
  "BATTING_AVERAGE",
  "BATTING_STRIKE_RATE",
  "HIGH_SCORE",
  "SIXES",
  "WICKETS",
  "BOWLING_AVERAGE",
  "ECONOMY",
  "BOWLING_STRIKE_RATE",
  "BEST_BOWLING",
  "FIELDING_DISMISSALS",
  "CATCHES",
]);

export const HistoricalLeaderboardEntrySchema = z.strictObject({
  rank: PositiveCounterSchema,
  tied: z.boolean(),
  playerId: IDSchema,
  teamId: IDSchema,
  status: z.enum(["ACTIVE", "RETIRED"]),
  qualified: z.boolean(),
  primaryDisplay: z.string().min(1).max(64),
  primaryValueX100: CounterSchema,
  secondaryDisplay: z.string().min(1).max(96),
  denominatorCount: CounterSchema,
  denominatorLabel: z.string().min(1).max(64),
  contributingFixtureIds: z.array(IDSchema).min(1).max(MAX_PERSISTENT_SEASONS * 14),
});

export const HistoricalLeaderboardQualificationRuleSchema = z.strictObject({
  summary: z.string().min(1).max(200),
  minDenominator: CounterSchema,
  denominatorField: z.string().min(1).max(64),
  secondaryRule: z.string().min(1).max(160).nullable(),
});

export const HistoricalLeaderboardTableSchema = z.strictObject({
  metric: HistoricalLeaderboardMetricSchema,
  title: z.string().min(1).max(80),
  sortDirection: z.enum(["DESC", "ASC"]),
  qualificationRule: HistoricalLeaderboardQualificationRuleSchema,
  denominatorDefinition: z.string().min(1).max(160),
  nullPolicy: z.string().min(1).max(160),
  tieRule: z.string().min(1).max(160),
  entries: z.array(HistoricalLeaderboardEntrySchema).max(200),
  qualifiedCount: CounterSchema,
  totalCandidatesCount: CounterSchema,
});

export const HistoricalFilteredTeamRecordSchema = z.strictObject({
  teamId: IDSchema,
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

export const HistoricalStatisticsProjectionSchema = z.strictObject({
  projectionVersion: z.literal(HISTORICAL_STATS_PROJECTION_VERSION),
  sourceClass: HistoricalSourceClassSchema,
  separationNotice: z.string().min(1).max(240),
  filterQuery: HistoricalFilterQuerySchema,
  filterSupport: HistoricalFilterSupportSchema,
  totalSourceMatches: CounterSchema,
  filteredMatchesCount: CounterSchema,
  players: z.array(HistoricalPlayerRecordSchema).max(10000),
  leaderboards: z.strictObject({
    RUNS: HistoricalLeaderboardTableSchema,
    BATTING_AVERAGE: HistoricalLeaderboardTableSchema,
    BATTING_STRIKE_RATE: HistoricalLeaderboardTableSchema,
    HIGH_SCORE: HistoricalLeaderboardTableSchema,
    SIXES: HistoricalLeaderboardTableSchema,
    WICKETS: HistoricalLeaderboardTableSchema,
    BOWLING_AVERAGE: HistoricalLeaderboardTableSchema,
    ECONOMY: HistoricalLeaderboardTableSchema,
    BOWLING_STRIKE_RATE: HistoricalLeaderboardTableSchema,
    BEST_BOWLING: HistoricalLeaderboardTableSchema,
    FIELDING_DISMISSALS: HistoricalLeaderboardTableSchema,
    CATCHES: HistoricalLeaderboardTableSchema,
  }),
  teamStandings: z.array(HistoricalFilteredTeamRecordSchema).max(64),
  projectionDigest: z.string().regex(/^[0-9a-f]{32}$/),
});

export type HistoricalSourceClass = z.infer<typeof HistoricalSourceClassSchema>;
export type HistoricalBattingPositionBand = z.infer<typeof HistoricalBattingPositionBandSchema>;
export type HistoricalPlayerStatusFilter = z.infer<typeof HistoricalPlayerStatusFilterSchema>;
export type HistoricalSeasonScope = z.infer<typeof HistoricalSeasonScopeSchema>;
export type HistoricalFilterQuery = z.infer<typeof HistoricalFilterQuerySchema>;
export type HistoricalSeasonOption = z.infer<typeof HistoricalSeasonOptionSchema>;
export type HistoricalCompetitionOption = z.infer<typeof HistoricalCompetitionOptionSchema>;
export type HistoricalFilterSupport = z.infer<typeof HistoricalFilterSupportSchema>;
export type HistoricalContributingMatch = z.infer<typeof HistoricalContributingMatchSchema>;
export type HistoricalPlayerRecord = z.infer<typeof HistoricalPlayerRecordSchema>;
export type HistoricalLeaderboardMetric = z.infer<typeof HistoricalLeaderboardMetricSchema>;
export type HistoricalLeaderboardEntry = z.infer<typeof HistoricalLeaderboardEntrySchema>;
export type HistoricalLeaderboardQualificationRule = z.infer<
  typeof HistoricalLeaderboardQualificationRuleSchema
>;
export type HistoricalLeaderboardTable = z.infer<typeof HistoricalLeaderboardTableSchema>;
export type HistoricalFilteredTeamRecord = z.infer<typeof HistoricalFilteredTeamRecordSchema>;
export type HistoricalStatisticsProjection = z.infer<typeof HistoricalStatisticsProjectionSchema>;
