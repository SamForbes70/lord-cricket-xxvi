import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema } from "./core.js";
import { T20TeamSelectionSchema } from "./world.js";
import { T20EventChainManifestSchema, T20ScorecardSchema } from "./t20-match.js";
import { MatchConditionDeltaSchema } from "./career.js";

export const T20OffscreenFixturePolicySchema = z.strictObject({
  policyVersion: z.literal("LC_T20_OFFSCREEN_POLICY_V1"),
  executionVersion: z.literal("LC_T20_OFFSCREEN_FIXTURE_V1"),
  selectionPolicyId: z.literal("LC_SEASON_XI_BASELINE_V1"),
  captainPolicyId: z.literal("LC_FIXTURE_CAPTAIN_V1"),
  conditionDeltaPolicyId: z.literal("LC_ENGINE_FINAL_FATIGUE_DELTA_V1"),
  matchEngineVersion: z.literal("LC_T20_MATCH_V1"),
  selectionScorePolicy: z.literal("SUM_SUPPORTED_T20_SKILLS_PLUS_AREA_READINESS_V1"),
  unavailablePlayersExcluded: z.literal(true),
  fatigueSelectionEffect: z.literal("LOWER_FATIGUE_STABLE_TIEBREAK_ONLY"),
  minimumNonKeeperBowlingCapable: z.literal(5),
  requiresKeeper: z.literal(true),
  noFutureRandomAccess: z.literal(true),
  noAlternateMatchSimulator: z.literal(true),
});

const OffscreenFixtureOutcomeCoreShape = {
  executionVersion: z.literal("LC_T20_OFFSCREEN_FIXTURE_V1"),
  policyVersion: z.literal("LC_T20_OFFSCREEN_POLICY_V1"),
  fixtureId: IDSchema,
  matchId: IDSchema,
  roundNumber: z.number().int().min(1).max(14),
  roundFixtureIndex: z.number().int().min(1).max(4),
  matchDayDate: z.iso.date(),
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  groundId: IDSchema,
  scheduleSha256: HashSchema,
  matchSeedHash: HashSchema,
  careerRevisionBefore: CounterSchema,
  careerRevisionAfter: CounterSchema,
  careerStateSha256Before: HashSchema,
  careerStateSha256After: HashSchema,
  selectionPolicyId: z.literal("LC_SEASON_XI_BASELINE_V1"),
  captainPolicyId: z.literal("LC_FIXTURE_CAPTAIN_V1"),
  conditionDeltaPolicyId: z.literal("LC_ENGINE_FINAL_FATIGUE_DELTA_V1"),
  selectedTeams: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
  eventChain: T20EventChainManifestSchema,
  eventLogSha256: HashSchema,
  commandLogSha256: HashSchema,
  scorecard: T20ScorecardSchema,
  scorecardSha256: HashSchema,
  conditionDelta: MatchConditionDeltaSchema,
  conditionDeltaSha256: HashSchema,
} as const;

export const OffscreenFixtureOutcomeCoreSchema = z.strictObject(OffscreenFixtureOutcomeCoreShape);
export const OffscreenFixtureOutcomeSchema = z.strictObject({
  ...OffscreenFixtureOutcomeCoreShape,
  outcomeSha256: HashSchema,
});

/**
 * An off-screen fixture run under career fixture policy V2 (docs/pavilion/CAREER_FIXTURE_POLICY_V2.md): the V1 record
 * with new execution, policy, selection and captain identifiers. Used only by season states V2; V1 records keep V1.
 */
const OffscreenFixtureOutcomeV2CoreShape = {
  ...OffscreenFixtureOutcomeCoreShape,
  executionVersion: z.literal("LC_T20_OFFSCREEN_FIXTURE_V2"),
  policyVersion: z.literal("LC_T20_OFFSCREEN_POLICY_V2"),
  selectionPolicyId: z.literal("LC_SEASON_XI_BASELINE_V2"),
  captainPolicyId: z.literal("LC_FIXTURE_CAPTAIN_V2"),
} as const;

export const OffscreenFixtureOutcomeV2CoreSchema = z.strictObject(OffscreenFixtureOutcomeV2CoreShape);
export const OffscreenFixtureOutcomeV2Schema = z.strictObject({
  ...OffscreenFixtureOutcomeV2CoreShape,
  outcomeSha256: HashSchema,
});

const OffscreenRoundExecutionCoreShape = {
  executionVersion: z.literal("LC_T20_OFFSCREEN_ROUND_V1"),
  seasonId: IDSchema,
  roundNumber: z.number().int().min(1).max(14),
  matchDayDate: z.iso.date(),
  scheduleSha256: HashSchema,
  userTeamId: IDSchema.nullable(),
  skippedUserFixtureId: IDSchema.nullable(),
  executedFixtureIds: z.array(IDSchema).max(4),
  outcomes: z.array(OffscreenFixtureOutcomeSchema).max(4),
  careerRevisionBefore: CounterSchema,
  careerRevisionAfter: CounterSchema,
  careerStateSha256Before: HashSchema,
  careerStateSha256After: HashSchema,
} as const;

export const OffscreenRoundExecutionCoreSchema = z.strictObject(OffscreenRoundExecutionCoreShape);
export const OffscreenRoundExecutionSchema = z.strictObject({
  ...OffscreenRoundExecutionCoreShape,
  executionSha256: HashSchema,
});

export type T20OffscreenFixturePolicy = z.infer<typeof T20OffscreenFixturePolicySchema>;
export type OffscreenFixtureOutcomeCore = z.infer<typeof OffscreenFixtureOutcomeCoreSchema>;
export type OffscreenFixtureOutcome = z.infer<typeof OffscreenFixtureOutcomeSchema>;
export type OffscreenFixtureOutcomeV2Core = z.infer<typeof OffscreenFixtureOutcomeV2CoreSchema>;
export type OffscreenFixtureOutcomeV2 = z.infer<typeof OffscreenFixtureOutcomeV2Schema>;
export type OffscreenRoundExecutionCore = z.infer<typeof OffscreenRoundExecutionCoreSchema>;
export type OffscreenRoundExecution = z.infer<typeof OffscreenRoundExecutionSchema>;
