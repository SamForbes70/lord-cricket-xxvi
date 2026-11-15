import { z } from "zod";
import {
  BasisPointsSchema,
  BowlingStyleSchema,
  CounterSchema,
  FieldSlotSchema,
  FormatSchema,
  HandSchema,
  IDSchema,
  NameSchema,
  PositiveCounterSchema,
} from "./core.js";

export const TACTICAL_BRIEFING_VERSION = "LC_TACTICAL_BRIEFING_V1" as const;

export const PitchTendencySchema = z.enum([
  "SEAM_FRIENDLY",
  "SPIN_FRIENDLY",
  "LIVE_BOTH",
  "BALANCED",
  "FLAT",
]);
export type PitchTendency = z.infer<typeof PitchTendencySchema>;

export const PlayerConditionBandSchema = z.enum([
  "FRESH",
  "READY",
  "WORKED",
  "TIRED",
]);
export type PlayerConditionBand = z.infer<typeof PlayerConditionBandSchema>;

export const PreMatchPlayerAvailabilitySchema = z.strictObject({
  playerId: IDSchema,
  name: NameSchema,
  role: z.enum(["BATTER", "BOWLER", "ALLROUNDER", "KEEPER"]),
  batHand: HandSchema,
  bowlingStyle: BowlingStyleSchema.nullable(),
  canBowl: z.boolean(),
  selectedInXI: z.boolean(),
  fatigueBp: BasisPointsSchema,
  readinessDelta: z.number().int().min(-20).max(20),
  conditionBand: PlayerConditionBandSchema,
});
export type PreMatchPlayerAvailability = z.infer<
  typeof PreMatchPlayerAvailabilitySchema
>;

export const PreMatchTeamReadinessSchema = z.strictObject({
  teamId: IDSchema,
  teamName: NameSchema,
  squadSize: PositiveCounterSchema,
  selectedCount: CounterSchema.max(11),
  selectedKeepers: CounterSchema.max(11),
  selectedBowlingOptions: CounterSchema.max(11),
  selectedPaceOptions: CounterSchema.max(11),
  selectedSpinOptions: CounterSchema.max(11),
  selectedLeftHandBatters: CounterSchema.max(11),
  freshInXI: CounterSchema.max(11),
  tiredInXI: CounterSchema.max(11),
  balanceSummary: z.string().min(1).max(320),
  players: z.array(PreMatchPlayerAvailabilitySchema).min(11).max(30),
});
export type PreMatchTeamReadiness = z.infer<typeof PreMatchTeamReadinessSchema>;

export const OpponentObservationSummarySchema = z.strictObject({
  opponentTeamId: IDSchema,
  opponentTeamName: NameSchema,
  poolLabel: z.enum(["SELECTED_XI", "AVAILABLE_SQUAD"]),
  leftHandBatters: CounterSchema.max(30),
  rightHandBatters: CounterSchema.max(30),
  keepers: CounterSchema.max(30),
  paceOptions: CounterSchema.max(30),
  spinOptions: CounterSchema.max(30),
  bowlingStyles: z.array(BowlingStyleSchema).max(6),
  observations: z.array(z.string().min(1).max(280)).min(1).max(6),
});
export type OpponentObservationSummary = z.infer<
  typeof OpponentObservationSummarySchema
>;

export const PreMatchGroundBriefingSchema = z.strictObject({
  groundId: IDSchema,
  groundName: NameSchema,
  seamBp: BasisPointsSchema,
  turnBp: BasisPointsSchema,
  pitchTendency: PitchTendencySchema,
  pitchSummary: z.string().min(1).max(320),
  formatRulesSummary: z.string().min(1).max(320),
  modelLimitsDisclosure: z.string().min(1).max(320),
});
export type PreMatchGroundBriefing = z.infer<typeof PreMatchGroundBriefingSchema>;

export const PreMatchBriefingSchema = z.strictObject({
  version: z.literal(TACTICAL_BRIEFING_VERSION),
  format: FormatSchema,
  ground: PreMatchGroundBriefingSchema,
  teams: z.tuple([PreMatchTeamReadinessSchema, PreMatchTeamReadinessSchema]),
  opponentObservations: z.tuple([
    OpponentObservationSummarySchema,
    OpponentObservationSummarySchema,
  ]),
});
export type PreMatchBriefing = z.infer<typeof PreMatchBriefingSchema>;

export const TacticalControlIdSchema = z.enum([
  "BATTING_AGGRESSION",
  "BATTING_INTENT",
  "BOWLING_LINE",
  "BOWLING_LENGTH",
  "BOWLING_EFFORT",
  "BOWLING_VARIATION",
  "FIELD_PLACEMENT",
]);
export type TacticalControlId = z.infer<typeof TacticalControlIdSchema>;

export const TacticalControlTradeOffSchema = z.strictObject({
  controlId: TacticalControlIdSchema,
  side: z.enum(["BATTING", "BOWLING", "FIELDING"]),
  label: z.string().min(1).max(80),
  currentSetting: z.string().min(1).max(160),
  upside: z.string().min(1).max(280),
  tradeOff: z.string().min(1).max(280),
});
export type TacticalControlTradeOff = z.infer<
  typeof TacticalControlTradeOffSchema
>;

export const TacticalPresetIdSchema = z.enum([
  "BAT_CONSOLIDATE",
  "BAT_ROTATE_STRIKE",
  "BAT_BALANCED_TEMPO",
  "BAT_BOUNDARY_PUSH",
  "BOWL_DISCIPLINED_CHANNEL",
  "BOWL_ATTACK_STUMPS",
  "BOWL_CONSERVE_SPELL",
  "BOWL_YORKER_CLOSE",
  "BOWL_SHORT_TEST",
  "FIELD_SLIP_ATTACK",
  "FIELD_BALANCED_RING",
  "FIELD_BOUNDARY_PROTECT",
]);
export type TacticalPresetId = z.infer<typeof TacticalPresetIdSchema>;

export const TacticalPresetOptionSchema = z.strictObject({
  presetId: TacticalPresetIdSchema,
  commandKind: z.enum(["SET_BATTING_PLAN", "SET_BOWLING_PLAN", "SET_FIELD"]),
  label: z.string().min(1).max(80),
  whenToUse: z.string().min(1).max(240),
  tradeOff: z.string().min(1).max(240),
  contextualMatch: z.boolean(),
  contextualReason: z.string().max(200),
  activeNow: z.boolean(),
  battingPatch: z
    .strictObject({
      aggression: CounterSchema.max(4),
      intent: z.enum(["NORMAL", "ROTATE", "PROTECT"]),
    })
    .optional(),
  bowlingPatch: z
    .strictObject({
      line: z.enum(["OFF", "STUMPS", "LEG"]),
      length: z.enum(["YORKER", "FULL", "GOOD", "SHORT"]),
      effort: z.enum(["CONSERVE", "NORMAL", "MAXIMUM"]),
      variationId: IDSchema,
    })
    .optional(),
  fieldSlots: z.array(FieldSlotSchema).length(9).optional(),
});
export type TacticalPresetOption = z.infer<typeof TacticalPresetOptionSchema>;

export const AcceptedBowlingPlanSummarySchema = z.strictObject({
  primaryLine: z.enum(["OFF", "STUMPS", "LEG"]),
  primaryLength: z.enum(["YORKER", "FULL", "GOOD", "SHORT"]),
  primaryEffort: z.enum(["CONSERVE", "NORMAL", "MAXIMUM"]),
  primaryVariationId: IDSchema,
  latestRingFielders: CounterSchema.max(9),
  latestBoundaryFielders: CounterSchema.max(9),
  latestCloseCatchers: CounterSchema.max(9),
  planChangesCount: CounterSchema,
  fieldChangesCount: CounterSchema,
});
export type AcceptedBowlingPlanSummary = z.infer<
  typeof AcceptedBowlingPlanSummarySchema
>;

export const SpellExecutedLengthsSchema = z.strictObject({
  YORKER: CounterSchema,
  FULL: CounterSchema,
  GOOD: CounterSchema,
  SHORT: CounterSchema,
  FULL_TOSS: CounterSchema,
});
export type SpellExecutedLengths = z.infer<typeof SpellExecutedLengthsSchema>;

export const SpellTrajectoryCountsSchema = z.strictObject({
  GROUND: CounterSchema,
  AERIAL: CounterSchema,
  EDGE: CounterSchema,
  NO_CONTACT: CounterSchema,
});
export type SpellTrajectoryCounts = z.infer<typeof SpellTrajectoryCountsSchema>;

export const SpellFieldOutcomesSchema = z.strictObject({
  STOP: CounterSchema,
  CATCH: CounterSchema,
  DROP: CounterSchema,
  MISS: CounterSchema,
  RUN_OUT: CounterSchema,
});
export type SpellFieldOutcomes = z.infer<typeof SpellFieldOutcomesSchema>;

export const SpellOutcomeFactsSchema = z.strictObject({
  legalBalls: CounterSchema,
  oversDisplay: z.string().regex(/^[0-9]+\.[0-5]$/),
  deliveryAttempts: CounterSchema,
  runsConceded: CounterSchema,
  wickets: CounterSchema,
  dots: CounterSchema,
  singles: CounterSchema,
  boundaries: CounterSchema,
  fours: CounterSchema,
  sixes: CounterSchema,
  wides: CounterSchema,
  noBalls: CounterSchema,
  economyX100: CounterSchema.nullable(),
  intendedLengthMatches: CounterSchema,
  intendedLengthEvaluatedBalls: CounterSchema,
  executedLengths: SpellExecutedLengthsSchema,
  trajectories: SpellTrajectoryCountsSchema,
  fieldOutcomes: SpellFieldOutcomesSchema,
});
export type SpellOutcomeFacts = z.infer<typeof SpellOutcomeFactsSchema>;

export const BowlingSpellReviewSchema = z.strictObject({
  spellId: z.string().min(1).max(160),
  inningsIndex: CounterSchema,
  spellNumberInInnings: PositiveCounterSchema,
  bowlerId: IDSchema,
  bowlerName: NameSchema,
  status: z.enum(["IN_PROGRESS", "BETWEEN_OVERS", "COMPLETED"]),
  startOver: CounterSchema,
  endOver: CounterSchema,
  acceptedPlan: AcceptedBowlingPlanSummarySchema,
  outcomes: SpellOutcomeFactsSchema,
  factualSummary: z.string().min(1).max(420),
});
export type BowlingSpellReview = z.infer<typeof BowlingSpellReviewSchema>;

export const BattingStintReviewSchema = z.strictObject({
  stintId: z.string().min(1).max(160),
  inningsIndex: CounterSchema,
  playerId: IDSchema,
  playerName: NameSchema,
  dismissed: z.boolean(),
  acceptedPlan: z.strictObject({
    primaryAggression: CounterSchema.max(4),
    primaryIntent: z.enum(["NORMAL", "ROTATE", "PROTECT"]),
    planChangesCount: CounterSchema,
  }),
  outcomes: z.strictObject({
    ballsFaced: CounterSchema,
    runs: CounterSchema,
    dots: CounterSchema,
    singles: CounterSchema,
    boundaries: CounterSchema,
    strikeRateX100: CounterSchema.nullable(),
  }),
  factualSummary: z.string().min(1).max(360),
});
export type BattingStintReview = z.infer<typeof BattingStintReviewSchema>;

export const InMatchTacticalSituationSchema = z.strictObject({
  phaseLabel: z.string().min(1).max(120),
  fieldRestrictionLabel: z.string().min(1).max(160),
  scoreContextLabel: z.string().min(1).max(200),
  pitchSummaryLabel: z.string().min(1).max(200),
  activeBowlerWorkloadLabel: z.string().max(200),
});
export type InMatchTacticalSituation = z.infer<
  typeof InMatchTacticalSituationSchema
>;

export const InMatchTacticalAssistantViewSchema = z.strictObject({
  version: z.literal(TACTICAL_BRIEFING_VERSION),
  format: FormatSchema,
  situation: InMatchTacticalSituationSchema,
  controlGuide: z.array(TacticalControlTradeOffSchema).length(7),
  presets: z.array(TacticalPresetOptionSchema).max(16),
  spellReviews: z.array(BowlingSpellReviewSchema),
  battingStintReviews: z.array(BattingStintReviewSchema),
});
export type InMatchTacticalAssistantView = z.infer<
  typeof InMatchTacticalAssistantViewSchema
>;
