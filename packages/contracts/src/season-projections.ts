import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";
import { T20ScorecardSchema } from "./t20-match.js";
import { T20TeamSelectionSchema } from "./world.js";

const SignedSafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const T20SeasonMatchCompletionSchema = z.strictObject({
  completionVersion: z.literal("LC_T20_SEASON_MATCH_COMPLETION_V1"),
  seasonId: IDSchema,
  scheduleSha256: HashSchema,
  fixtureId: IDSchema,
  matchId: IDSchema,
  fixtureOrdinal: z.number().int().min(0).max(55),
  roundNumber: PositiveCounterSchema.max(14),
  matchDayDate: z.iso.date(),
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  source: z.enum(["OFFSCREEN", "USER_MATCH"]),
  sourceCompletionSha256: HashSchema,
  selectedTeams: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
  scorecard: T20ScorecardSchema,
  scorecardSha256: HashSchema,
});

export const AppliedSeasonMatchSchema = z.strictObject({
  fixtureId: IDSchema,
  matchId: IDSchema,
  fixtureOrdinal: z.number().int().min(0).max(55),
  roundNumber: PositiveCounterSchema.max(14),
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  sourceCompletionSha256: HashSchema,
  resultKind: z.enum(["WIN", "TIE", "NO_RESULT"]),
  winnerTeamId: IDSchema.nullable(),
  homePoints: CounterSchema.max(2),
  awayPoints: CounterSchema.max(2),
  nrrEligible: z.boolean(),
  homeRuns: CounterSchema,
  homeBalls: CounterSchema,
  awayRuns: CounterSchema,
  awayBalls: CounterSchema,
});

export const SeasonTeamTableRowSchema = z.strictObject({
  rank: PositiveCounterSchema.max(8),
  teamId: IDSchema,
  played: CounterSchema.max(14),
  wins: CounterSchema.max(14),
  losses: CounterSchema.max(14),
  ties: CounterSchema.max(14),
  noResults: CounterSchema.max(14),
  points: CounterSchema.max(28),
  runsFor: CounterSchema,
  ballsFor: CounterSchema,
  runsAgainst: CounterSchema,
  ballsAgainst: CounterSchema,
  nrrNumerator: SignedSafeIntegerSchema,
  nrrDenominator: PositiveCounterSchema.nullable(),
  nrrX1000: SignedSafeIntegerSchema.nullable(),
  headToHeadPoints: CounterSchema.max(28),
});

export const SeasonPlayerStatsSchema = z.strictObject({
  playerId: IDSchema,
  teamId: IDSchema,
  matches: CounterSchema.max(14),
  runs: CounterSchema,
  dismissals: CounterSchema.max(14),
  ballsFaced: CounterSchema,
  fours: CounterSchema,
  sixes: CounterSchema,
  battingAverageX100: CounterSchema.nullable(),
  strikeRateX100: CounterSchema.nullable(),
  bowlingRunsConceded: CounterSchema,
  bowlingLegalBalls: CounterSchema,
  bowlingWickets: CounterSchema,
  maidens: CounterSchema,
  bowlingAverageX100: CounterSchema.nullable(),
  economyX100: CounterSchema.nullable(),
  bowlingStrikeRateX100: CounterSchema.nullable(),
});

export const SeasonLeaderboardEntrySchema = z.strictObject({
  playerId: IDSchema,
  teamId: IDSchema,
  value: CounterSchema,
});

export const SeasonLeaderboardsSchema = z.strictObject({
  runs: z.array(SeasonLeaderboardEntrySchema).max(10),
  wickets: z.array(SeasonLeaderboardEntrySchema).max(10),
});

export const SeasonProjectionCursorSchema = z.strictObject({
  appliedCount: CounterSchema.max(56),
  highestAppliedFixtureOrdinal: z.number().int().min(0).max(55).nullable(),
  missingFixtureOrdinals: z.array(z.number().int().min(0).max(55)).max(56),
});

export const T20SeasonProjectionStateSchema = z.strictObject({
  projectionVersion: z.literal("LC_T20_SEASON_PROJECTION_V1"),
  seasonId: IDSchema,
  scheduleSha256: HashSchema,
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  revision: CounterSchema.max(56),
  cursor: SeasonProjectionCursorSchema,
  appliedMatches: z.array(AppliedSeasonMatchSchema).max(56),
  table: z.array(SeasonTeamTableRowSchema).length(8),
  players: z.array(SeasonPlayerStatsSchema).max(160),
  leaders: SeasonLeaderboardsSchema,
});

export type T20SeasonMatchCompletion = z.infer<typeof T20SeasonMatchCompletionSchema>;
export type AppliedSeasonMatch = z.infer<typeof AppliedSeasonMatchSchema>;
export type SeasonTeamTableRow = z.infer<typeof SeasonTeamTableRowSchema>;
export type SeasonPlayerStats = z.infer<typeof SeasonPlayerStatsSchema>;
export type SeasonLeaderboardEntry = z.infer<typeof SeasonLeaderboardEntrySchema>;
export type SeasonLeaderboards = z.infer<typeof SeasonLeaderboardsSchema>;
export type SeasonProjectionCursor = z.infer<typeof SeasonProjectionCursorSchema>;
export type T20SeasonProjectionState = z.infer<typeof T20SeasonProjectionStateSchema>;
