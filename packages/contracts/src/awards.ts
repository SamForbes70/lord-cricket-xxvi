import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

export const AWARDS_MODEL_VERSION = "LC_AWARDS_HEURISTIC_GAME_V1" as const;
export const AWARDS_LEDGER_VERSION = "LC_CAREER_AWARDS_LEDGER_V1" as const;
export const AWARDS_PROVENANCE_NOTICE =
  "Game award — transparent deterministic match and season heuristic (not an official ICC or broadcast formula)." as const;

const SignedSafeIntegerSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const AwardFormatSchema = z.enum(["T20", "ODI", "RED_BALL"]);

export const MatchAwardComponentBreakdownSchema = z.strictObject({
  battingPointsX100: SignedSafeIntegerSchema,
  bowlingPointsX100: SignedSafeIntegerSchema,
  fieldingPointsX100: CounterSchema,
  resultBonusX100: CounterSchema,
});

export const MatchAwardCandidateSchema = z.strictObject({
  playerId: IDSchema,
  teamId: IDSchema,
  battingPointsX100: SignedSafeIntegerSchema,
  bowlingPointsX100: SignedSafeIntegerSchema,
  fieldingPointsX100: CounterSchema,
  resultBonusX100: CounterSchema,
  totalPointsX100: SignedSafeIntegerSchema,
  fromWinningTeam: z.boolean(),
  summaryLine: z.string().min(1).max(240),
});

export const MatchAwardRecordSchema = z.strictObject({
  awardVersion: z.literal(AWARDS_MODEL_VERSION),
  awardCategory: z.literal("PLAYER_OF_THE_MATCH"),
  awardProvenance: z.literal("GAME_AWARD"),
  format: AwardFormatSchema,
  matchId: IDSchema,
  fixtureId: IDSchema.nullable(),
  seasonNumber: PositiveCounterSchema.nullable(),
  sourceCompletionSha256: HashSchema.nullable(),
  status: z.enum(["AWARDED", "NO_RESULT_NOT_AWARDED"]),
  winnerPlayerId: IDSchema.nullable(),
  winnerTeamId: IDSchema.nullable(),
  fromWinningTeam: z.boolean().nullable(),
  fromLosingTeam: z.boolean(),
  scoreTotalX100: SignedSafeIntegerSchema.nullable(),
  components: MatchAwardComponentBreakdownSchema.nullable(),
  fieldingSourceStatus: z.enum(["ARCHIVE_EVENTS", "SCORECARD_NOT_ATTRIBUTABLE"]),
  explanationText: z.string().min(1).max(400),
  formulaSummary: z.string().min(1).max(400),
  candidates: z.array(MatchAwardCandidateSchema).max(5),
});

export const SeasonAwardCategorySchema = z.enum([
  "PLAYER_OF_THE_SEASON",
  "LEADING_RUN_SCORER",
  "LEADING_WICKET_TAKER",
  "BEST_FIELDER",
  "EMERGING_YOUTH_PLAYER",
]);

export const SeasonAwardEntrySchema = z.strictObject({
  awardVersion: z.literal(AWARDS_MODEL_VERSION),
  category: SeasonAwardCategorySchema,
  label: z.string().min(1).max(120),
  awardProvenance: z.literal("GAME_AWARD"),
  status: z.enum(["AWARDED", "UNAVAILABLE"]),
  unavailableReason: z.string().min(1).max(240).nullable(),
  qualificationRule: z.string().min(1).max(240),
  formulaSummary: z.string().min(1).max(320),
  winnerPlayerId: IDSchema.nullable(),
  winnerTeamId: IDSchema.nullable(),
  headlineStat: z.string().min(1).max(160).nullable(),
  scoreX100: SignedSafeIntegerSchema.nullable(),
  tieBroken: z.boolean(),
  runnerUpPlayerId: IDSchema.nullable(),
  explanationText: z.string().min(1).max(400),
});

export const SeasonAwardsSummarySchema = z.strictObject({
  awardVersion: z.literal(AWARDS_MODEL_VERSION),
  seasonNumber: PositiveCounterSchema,
  calendarYear: z.number().int().min(1900).max(9999),
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  sealedAtSeasonSha256: HashSchema.nullable(),
  provenanceNotice: z.string().min(1).max(320),
  awards: z.array(SeasonAwardEntrySchema).length(5),
});

export const CareerMatchAwardLedgerEntrySchema = z.strictObject({
  key: z.string().min(1).max(256),
  seasonNumber: PositiveCounterSchema,
  fixtureId: IDSchema,
  matchId: IDSchema,
  sourceCompletionSha256: HashSchema,
  award: MatchAwardRecordSchema,
});

export const CareerAwardsLedgerSchema = z.strictObject({
  ledgerVersion: z.literal(AWARDS_LEDGER_VERSION),
  worldOrCareerId: IDSchema,
  matchAwards: z.array(CareerMatchAwardLedgerEntrySchema).max(20000),
  seasonAwards: z.array(SeasonAwardsSummarySchema).max(200),
  ledgerSha256: HashSchema,
});

export type AwardFormat = z.infer<typeof AwardFormatSchema>;
export type MatchAwardComponentBreakdown = z.infer<typeof MatchAwardComponentBreakdownSchema>;
export type MatchAwardCandidate = z.infer<typeof MatchAwardCandidateSchema>;
export type MatchAwardRecord = z.infer<typeof MatchAwardRecordSchema>;
export type SeasonAwardCategory = z.infer<typeof SeasonAwardCategorySchema>;
export type SeasonAwardEntry = z.infer<typeof SeasonAwardEntrySchema>;
export type SeasonAwardsSummary = z.infer<typeof SeasonAwardsSummarySchema>;
export type CareerMatchAwardLedgerEntry = z.infer<typeof CareerMatchAwardLedgerEntrySchema>;
export type CareerAwardsLedger = z.infer<typeof CareerAwardsLedgerSchema>;
