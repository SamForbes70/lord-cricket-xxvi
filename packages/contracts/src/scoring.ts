import { z } from "zod";
import {
  CounterSchema,
  PositiveCounterSchema,
  IDSchema,
  EndSchema,
  ExtrasSchema,
  DeliveryRecordedSchema,
  MatchResultSchema,
  ClockStateSchema,
  MatchPhaseSchema,
} from "./core.js";
export const ScoringContextSchema = z.strictObject({
  rulesId: z.enum(["LC_T20_01", "LC_ODI_01", "LC_RED5_01"]),
  inningsIndex: CounterSchema,
  deliveryIndex: CounterSchema,
  battingTeamId: IDSchema,
  bowlingTeamId: IDSchema,
  strikerId: IDSchema,
  nonStrikerId: IDSchema,
  bowlerId: IDSchema,
  keeperId: IDSchema,
  outfieldIds: z.array(IDSchema).length(9),
  endsBefore: z.strictObject({ north: IDSchema, south: IDSchema }),
  strikerEnd: EndSchema,
  runs: CounterSchema,
  wickets: CounterSchema.max(9),
  legalBalls: CounterSchema,
  allocatedBalls: PositiveCounterSchema.nullable(),
  targetToWin: PositiveCounterSchema.nullable(),
  freeHitPending: z.boolean(),
  ballAgeLegalBalls: CounterSchema,
});
/** Adjudicated input, distinct from the score event. Derived counters/credits are absent. */
export const DeliveryResolutionSchema = z.strictObject({
  stage: z.enum(["DELIVERY", "IMMEDIATE_PENALTY"]),
  legality: z.enum(["LEGAL", "WIDE", "NO_BALL", "DEAD"]),
  batRuns: CounterSchema,
  extras: ExtrasSchema,
  completedRuns: CounterSchema,
  attemptedRuns: CounterSchema,
  boundary: z.enum(["NONE", "FOUR", "SIX"]),
  dismissal: z
    .strictObject({
      kind: z.enum([
        "BOWLED",
        "LBW",
        "CAUGHT",
        "RUN_OUT",
        "STUMPED",
        "HIT_WICKET",
      ]),
      playerId: IDSchema,
      fielderId: IDSchema.nullable(),
      wicketEnd: EndSchema,
    })
    .nullable(),
  endsAfter: z.strictObject({
    north: IDSchema.nullable(),
    south: IDSchema.nullable(),
  }),
  batContact: z.boolean(),
  attemptedStroke: z.boolean(),
  shotSector: CounterSchema.max(7).nullable(),
  trajectory: z.enum(["GROUND", "AERIAL", "EDGE"]).nullable(),
  executedLength: z
    .enum(["YORKER", "FULL", "GOOD", "SHORT", "FULL_TOSS"])
    .nullable(),
  fieldOutcome: z.enum(["NONE", "STOP", "DROP", "CATCH", "MISS", "RUN_OUT"]),
  elapsedSeconds: CounterSchema,
});
export const ResolutionErrorCodeSchema = z.enum([
  "INVALID_STRUCTURE",
  "INVALID_CONTEXT",
  "UNSUPPORTED_PENALTY",
  "INVALID_EXTRAS",
  "INVALID_BOUNDARY",
  "INVALID_RUNNING",
  "INVALID_DISMISSAL",
  "INVALID_ENDS",
  "INVALID_IMMEDIATE_PENALTY",
  "UNSAFE_TOTAL",
]);
export const DeliveryExpectationSchema = z.strictObject({
  event: DeliveryRecordedSchema,
  delta: z.strictObject({
    teamRuns: CounterSchema,
    batterRuns: CounterSchema,
    bowlerRuns: CounterSchema,
    legalBalls: CounterSchema.max(1),
    ballsFaced: CounterSchema.max(1),
    wickets: CounterSchema.max(1),
    bowlerWickets: CounterSchema.max(1),
    deliveryAttempts: z.literal(1),
  }),
  totals: z.strictObject({
    runs: CounterSchema,
    wickets: CounterSchema.max(10),
    legalBalls: CounterSchema,
    ballAgeLegalBalls: CounterSchema,
  }),
  strikerEndAfter: EndSchema,
  nextStrikerId: IDSchema.nullable(),
  requiredBatterEnd: EndSchema.nullable(),
  freeHitPending: z.boolean(),
  overCompleted: z.boolean(),
  inningsComplete: z.boolean(),
  result: MatchResultSchema.nullable(),
  events: z
    .array(
      z.enum([
        "DELIVERY_RECORDED",
        "OVER_COMPLETED",
        "INNINGS_COMPLETED",
        "MATCH_COMPLETED",
      ]),
    )
    .min(1),
  nextAction: z.enum([
    "ADVANCE",
    "SELECT_BATTER",
    "SELECT_BOWLER",
    "START_NEXT_INNINGS",
    "NONE",
  ]),
});
const metadata = {
  id: IDSchema,
  source: z.string().min(1),
  description: z.string().min(1),
  reasoning: z.string().min(1),
  tags: z.array(IDSchema).min(1),
};
export const DeliveryFixtureSchema = z.strictObject({
  ...metadata,
  context: ScoringContextSchema,
  resolution: DeliveryResolutionSchema,
  expected: DeliveryExpectationSchema,
});
/** Invalid inputs intentionally remain JSON unknown values until the domain validator receives them. */
export const InvalidResolutionFixtureSchema = z.strictObject({
  ...metadata,
  context: z.json(),
  resolution: z.json(),
  expectedError: ResolutionErrorCodeSchema,
});
export const TerminalFixtureSchema = z.strictObject({
  ...metadata,
  rulesId: z.enum(["LC_T20_01", "LC_ODI_01", "LC_RED5_01"]),
  teamIds: z.tuple([IDSchema, IDSchema]),
  innings: z
    .array(
      z.strictObject({
        teamId: IDSchema,
        runs: CounterSchema,
        wickets: CounterSchema.max(10),
        legalBalls: CounterSchema,
        complete: z.boolean(),
      }),
    )
    .min(1)
    .max(4),
  timeExpired: z.boolean(),
  expected: z.strictObject({
    result: MatchResultSchema.nullable(),
    targetToWin: PositiveCounterSchema.nullable(),
    phase: MatchPhaseSchema,
    nextAction: z.enum(["ADVANCE", "START_NEXT_INNINGS", "NONE"]),
  }),
});
export const ClockFixtureSchema = z.strictObject({
  ...metadata,
  trigger: z.enum([
    "WICKET",
    "INNINGS_COMPLETED",
    "RAIN_DELAY",
    "NEW_BALL",
    "TARGET_REACHED",
  ]),
  before: z.strictObject({
    clock: ClockStateSchema,
    inningsLegalBalls: CounterSchema,
    ballAgeLegalBalls: CounterSchema,
    runs: CounterSchema,
    targetToWin: PositiveCounterSchema.nullable(),
  }),
  input: z.strictObject({
    attemptSeconds: CounterSchema,
    wicketSeconds: CounterSchema,
    overSeconds: CounterSchema,
    delaySeconds: CounterSchema,
    replacementSeconds: CounterSchema,
    batRuns: CounterSchema,
  }),
  expected: z.strictObject({
    clock: ClockStateSchema,
    inningsLegalBalls: CounterSchema,
    ballAgeLegalBalls: CounterSchema,
    phase: MatchPhaseSchema,
    nextAction: z.enum([
      "SELECT_BATTER",
      "START_NEXT_INNINGS",
      "ADVANCE",
      "NONE",
    ]),
    intervalSeconds: CounterSchema,
    events: z.array(IDSchema),
  }),
});
export const DeferredFixtureSchema = z.discriminatedUnion("category", [
  z.strictObject({
    ...metadata,
    category: z.literal("PERSISTENCE"),
    before: z.strictObject({
      durableRevision: CounterSchema,
      lastSequence: CounterSchema,
    }),
    input: z.strictObject({
      commandId: IDSchema,
      retryCommitted: z.boolean(),
      provisionalEvents: CounterSchema,
      abortWrite: z.boolean(),
    }),
    expected: z.strictObject({
      durableRevision: CounterSchema,
      lastSequence: CounterSchema,
      extraCommittedEvents: CounterSchema,
      returnOriginalReceipt: z.boolean(),
      resumeFromPreviousCheckpoint: z.boolean(),
    }),
  }),
  z.strictObject({
    ...metadata,
    category: z.literal("NRR"),
    input: z.strictObject({
      runs: CounterSchema,
      legalBalls: CounterSchema,
      allocatedBalls: PositiveCounterSchema,
      allOut: z.boolean(),
      successfulChase: z.boolean(),
    }),
    expected: z.strictObject({
      battingDenominatorBalls: PositiveCounterSchema,
    }),
  }),
]);
export const ScoringFixtureCorpusSchema = z.strictObject({
  fixtureVersion: z.literal("1.0.0"),
  authority: z.literal("Lord_Cricket_XXVI_Technical_Design_V0_1(1).docx"),
  scorerImplemented: z.literal(false),
  deliveries: z.array(DeliveryFixtureSchema).min(1),
  invalid: z.array(InvalidResolutionFixtureSchema).min(1),
  terminal: z.array(TerminalFixtureSchema).min(1),
  clock: z.array(ClockFixtureSchema).min(1),
  deferred: z.array(DeferredFixtureSchema).min(1),
});
export type ScoringContext = z.infer<typeof ScoringContextSchema>;
export type DeliveryResolution = z.infer<typeof DeliveryResolutionSchema>;
export type ResolutionErrorCode = z.infer<typeof ResolutionErrorCodeSchema>;
export type DeliveryExpectation = z.infer<typeof DeliveryExpectationSchema>;
export type DeliveryFixture = z.infer<typeof DeliveryFixtureSchema>;
export type ScoringFixtureCorpus = z.infer<typeof ScoringFixtureCorpusSchema>;
/** Scoring adapter boundary consumed by fixture verification; implemented by the domain package. */
export interface ScoringFixtureAdapter {
  evaluate(
    context: Readonly<ScoringContext>,
    resolution: Readonly<DeliveryResolution>,
  ): DeliveryExpectation;
}

export const ScoringRequestSchema = z.strictObject({
  context: ScoringContextSchema,
  resolution: DeliveryResolutionSchema,
});
