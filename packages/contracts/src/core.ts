import { z } from "zod";
export const CounterSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const PositiveCounterSchema = CounterSchema.min(1);
export const IDSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^(?!(?:constructor|prototype)$)[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const VersionSchema = z.string().min(1).max(128);
export const FormatSchema = z.enum(["T20", "ODI", "RED_BALL"]);
export const RatingSchema = CounterSchema.max(100);
export const BasisPointsSchema = CounterSchema.max(10000);
export const HandSchema = z.enum(["R", "L"]);
export const BowlingStyleSchema = z.enum([
  "FAST",
  "MEDIUM",
  "OFF_SPIN",
  "LEG_SPIN",
  "SLOW_LEFT_ARM",
  "LEFT_ARM_WRIST",
]);
export const NameSchema = z.string().regex(/^[\s\S]{1,80}$/u);
export const ProvenanceSchema = z.strictObject({
  kind: z.enum(["FICTIONAL", "LICENSED", "USER_SUPPLIED"]),
  sourceId: IDSchema,
  sourceHash: HashSchema,
  confidenceBp: BasisPointsSchema,
});
export const FormatSkillsSchema = z.strictObject({
  defence: RatingSchema,
  timing: RatingSchema,
  power: RatingSchema,
  rotation: RatingSchema,
  vsPace: RatingSchema,
  vsSpin: RatingSchema,
  control: RatingSchema,
  movement: RatingSchema,
  variation: RatingSchema,
  stamina: RatingSchema,
  catching: RatingSchema,
  groundFielding: RatingSchema,
  throwing: RatingSchema,
  keeping: RatingSchema,
});
export const PlayerSchema = z.strictObject({
  playerId: IDSchema,
  name: NameSchema,
  birthDate: z.iso.date(),
  batHand: HandSchema,
  bowlHand: HandSchema,
  bowlingStyle: BowlingStyleSchema.nullable(),
  role: z.enum(["BATTER", "BOWLER", "ALLROUNDER", "KEEPER"]),
  skills: z.record(FormatSchema, FormatSkillsSchema),
  variations: z.array(IDSchema),
  shotSectorWeights: z.array(CounterSchema).length(8),
  exposureBalls: z.record(FormatSchema, CounterSchema),
  provenance: ProvenanceSchema,
});
export const MatchVersionsSchema = z.strictObject({
  schema: z.literal("1.0.0"),
  engine: VersionSchema,
  random: VersionSchema,
  rules: IDSchema,
  rulesHash: HashSchema,
  model: IDSchema,
  modelHash: HashSchema,
  worldHash: HashSchema,
});
export const BattingPlanSchema = z.strictObject({
  playerId: IDSchema,
  aggression: CounterSchema.max(4),
  intent: z.enum(["NORMAL", "ROTATE", "PROTECT"]),
});
export const BowlingPlanSchema = z.strictObject({
  bowlerId: IDSchema,
  line: z.enum(["OFF", "STUMPS", "LEG"]),
  length: z.enum(["YORKER", "FULL", "GOOD", "SHORT"]),
  variationId: IDSchema,
  effort: z.enum(["CONSERVE", "NORMAL", "MAXIMUM"]),
});
export const FieldSlotSchema = z.strictObject({
  slotId: IDSchema,
  playerId: IDSchema,
});
export const DelegationSchema = z.strictObject({
  battingOrder: z.boolean(),
  bowlerSelection: z.boolean(),
  battingTactics: z.boolean(),
  bowlingTactics: z.boolean(),
  declarations: z.boolean(),
  followOn: z.boolean(),
});
export const TeamTacticsSchema = z.strictObject({
  battingPlans: z.record(IDSchema, BattingPlanSchema),
  bowlingPlan: BowlingPlanSchema,
  fieldSlots: z.array(FieldSlotSchema).length(9),
  nextBatterId: IDSchema.nullable(),
  delegation: DelegationSchema,
});
export const PitchSchema = z.strictObject({
  seamBp: BasisPointsSchema,
  turnBp: BasisPointsSchema,
  variabilityBp: BasisPointsSchema,
  moistureBp: BasisPointsSchema,
  wearPoints: CounterSchema,
});
export const WeatherSchema = z.enum([
  "DRY",
  "OVERCAST",
  "RAIN",
  "UNSAFE_LIGHT",
]);
export const ConditionsSchema = z.strictObject({
  pitch: PitchSchema,
  weather: WeatherSchema,
  outfieldSpeedBp: BasisPointsSchema,
  ballId: IDSchema,
  ballAgeLegalBalls: CounterSchema,
  weatherScheduleId: IDSchema,
});
export const ExtrasSchema = z.strictObject({
  wides: CounterSchema,
  noBalls: CounterSchema,
  byes: CounterSchema,
  legByes: CounterSchema,
  penalties: CounterSchema,
});
export const EndSchema = z.enum(["NORTH", "SOUTH"]);
export const DismissalSchema = z.strictObject({
  kind: z.enum(["BOWLED", "LBW", "CAUGHT", "RUN_OUT", "STUMPED", "HIT_WICKET"]),
  playerId: IDSchema,
  creditedBowlerId: IDSchema.nullable(),
  fielderId: IDSchema.nullable(),
  wicketEnd: EndSchema,
});
export const DeliveryRecordedSchema = z.strictObject({
  type: z.literal("DELIVERY_RECORDED"),
  inningsIndex: CounterSchema,
  deliveryIndex: CounterSchema,
  strikerId: IDSchema,
  nonStrikerId: IDSchema,
  bowlerId: IDSchema,
  legality: z.enum(["LEGAL", "WIDE", "NO_BALL", "DEAD"]),
  legalBall: z.boolean(),
  countsAsBallFaced: z.boolean(),
  batRuns: CounterSchema,
  extras: ExtrasSchema,
  completedRuns: CounterSchema,
  boundary: z.enum(["NONE", "FOUR", "SIX"]),
  dismissal: DismissalSchema.nullable(),
  endsAfter: z.strictObject({
    north: IDSchema.nullable(),
    south: IDSchema.nullable(),
  }),
  shotSector: CounterSchema.max(7).nullable(),
  trajectory: z.enum(["GROUND", "AERIAL", "EDGE"]).nullable(),
  executedLength: z
    .enum(["YORKER", "FULL", "GOOD", "SHORT", "FULL_TOSS"])
    .nullable(),
  fieldOutcome: z.enum(["NONE", "STOP", "DROP", "CATCH", "MISS", "RUN_OUT"]),
  elapsedSeconds: CounterSchema,
  freeHitNext: z.boolean(),
});
export const InningsStateSchema = z.strictObject({
  index: CounterSchema,
  battingTeamId: IDSchema,
  bowlingTeamId: IDSchema,
  runs: CounterSchema,
  wickets: CounterSchema.max(10),
  legalBalls: CounterSchema,
  deliveryAttempts: CounterSchema,
  targetToWin: PositiveCounterSchema.nullable(),
  allocatedBalls: PositiveCounterSchema.nullable(),
  extras: ExtrasSchema,
  northBatterId: IDSchema.nullable(),
  southBatterId: IDSchema.nullable(),
  strikerEnd: EndSchema,
  battingOrder: z.array(IDSchema),
  dismissed: z.array(IDSchema),
  bowlerId: IDSchema.nullable(),
  previousOverBowlerId: IDSchema.nullable(),
  bowlerLegalBalls: z.record(IDSchema, CounterSchema),
  freeHitPending: z.boolean(),
  ballAgeLegalBalls: CounterSchema,
  complete: z.boolean(),
});
export const IntervalSchema = z.enum(["LUNCH", "TEA", "STUMPS", "INNINGS"]);
export const ClockStateSchema = z.strictObject({
  day: PositiveCounterSchema.max(5),
  localSeconds: CounterSchema.max(86399),
  dayLegalBalls: CounterSchema,
  finalHourActive: z.boolean(),
  finalHourBallsRequired: CounterSchema,
  finalHourBallsDelivered: CounterSchema,
  pendingInterval: z.enum(["LUNCH", "TEA", "STUMPS"]).nullable(),
});
const nonWinFields = {
  winnerTeamId: z.null(),
  marginType: z.null(),
  marginRuns: z.null(),
  marginWickets: z.null(),
  completionReason: z.string().min(1).max(240),
};
export const MatchResultSchema = z.union([
  z.strictObject({
    kind: z.literal("WIN"),
    winnerTeamId: IDSchema,
    marginType: z.literal("RUNS"),
    marginRuns: PositiveCounterSchema,
    marginWickets: z.null(),
    completionReason: z.string().min(1).max(240),
  }),
  z.strictObject({
    kind: z.literal("WIN"),
    winnerTeamId: IDSchema,
    marginType: z.literal("WICKETS"),
    marginRuns: z.null(),
    marginWickets: PositiveCounterSchema.max(10),
    completionReason: z.string().min(1).max(240),
  }),
  z.strictObject({
    kind: z.literal("WIN"),
    winnerTeamId: IDSchema,
    marginType: z.literal("INNINGS"),
    marginRuns: PositiveCounterSchema,
    marginWickets: z.null(),
    completionReason: z.string().min(1).max(240),
  }),
  z.strictObject({
    kind: z.enum(["TIE", "DRAW", "NO_RESULT"]),
    ...nonWinFields,
  }),
]);
export const MatchPhaseSchema = z.enum([
  "SETUP",
  "TOSS",
  "AWAITING_INNINGS",
  "READY",
  "AWAITING_BATTER",
  "AWAITING_BOWLER",
  "INTERVAL",
  "WEATHER_DELAY",
  "COMPLETE",
]);
export const MatchStateSchema = z.strictObject({
  matchId: IDSchema,
  revision: CounterSchema,
  versions: MatchVersionsSchema,
  seed: z.string().min(1).max(256),
  format: FormatSchema,
  phase: MatchPhaseSchema,
  teamIds: z.tuple([IDSchema, IDSchema]),
  xi: z.record(IDSchema, z.array(PlayerSchema).length(11)),
  inningsOrder: z.array(IDSchema).max(4),
  innings: z.array(InningsStateSchema).max(4),
  activeInningsIndex: CounterSchema.max(3),
  clock: ClockStateSchema,
  tactics: z.record(IDSchema, TeamTacticsSchema),
  conditions: ConditionsSchema,
  fatigueBp: z.record(IDSchema, BasisPointsSchema),
  result: MatchResultSchema.nullable(),
});
export type ID = z.infer<typeof IDSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type Rating = z.infer<typeof RatingSchema>;
export type Hand = z.infer<typeof HandSchema>;
export type BowlingStyle = z.infer<typeof BowlingStyleSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type FormatSkills = z.infer<typeof FormatSkillsSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type MatchVersions = z.infer<typeof MatchVersionsSchema>;
export type BattingPlan = z.infer<typeof BattingPlanSchema>;
export type BowlingPlan = z.infer<typeof BowlingPlanSchema>;
export type FieldSlot = z.infer<typeof FieldSlotSchema>;
export type Delegation = z.infer<typeof DelegationSchema>;
export type TeamTactics = z.infer<typeof TeamTacticsSchema>;
export type Conditions = z.infer<typeof ConditionsSchema>;
export type Extras = z.infer<typeof ExtrasSchema>;
export type Dismissal = z.infer<typeof DismissalSchema>;
export type DeliveryRecorded = z.infer<typeof DeliveryRecordedSchema>;
export type InningsState = z.infer<typeof InningsStateSchema>;
export type ClockState = z.infer<typeof ClockStateSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
export type MatchState = z.infer<typeof MatchStateSchema>;
