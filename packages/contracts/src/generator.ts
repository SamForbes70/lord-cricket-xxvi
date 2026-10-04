import { z } from "zod";
import {
  BasisPointsSchema,
  BowlingStyleSchema,
  CounterSchema,
  FormatSchema,
  HashSchema,
  IDSchema,
  RatingSchema,
} from "./core.js";
import { RandomAddressSchema } from "./determinism.js";
import { PROBABILITY_MODEL_ID, PROBABILITY_VERSION, EXP_LUT_VERSION } from "./probability.js";
import { DeliveryResolutionSchema, ScoringContextSchema } from "./scoring.js";

/** Separate orchestration identifier. Pinned existing probability/model/random semantics are unchanged. */
export const DELIVERY_GENERATOR_VERSION = "LC_CONDITIONAL_DELIVERY_V1" as const;
export const DELIVERY_STAGE_PACK_ID = "synthetic-alpha-01-delivery-v1" as const;

const Line = z.enum(["OFF", "STUMPS", "LEG"]);
const Length = z.enum(["YORKER", "FULL", "GOOD", "SHORT"]);
const Effort = z.enum(["CONSERVE", "NORMAL", "MAXIMUM"]);
const FieldDepth = z.enum(["INNER", "MIDDLE", "DEEP"]);
export const GeneratorFieldSlotSchema = z.strictObject({
  playerId: IDSchema,
  sector: CounterSchema.max(7),
  depth: FieldDepth,
  role: z.enum(["NORMAL", "SLIP", "GULLY"]),
  catchingRating: RatingSchema,
  throwingRating: RatingSchema,
});
/** Full fixture request. Never passed to public AI views because it holds the hidden match seed. */
export const GenerateDeliveryRequestSchema = z.strictObject({
  kind: z.literal("GENERATE_DELIVERY"),
  generatorVersion: z.literal(DELIVERY_GENERATOR_VERSION),
  stagePackId: z.literal(DELIVERY_STAGE_PACK_ID),
  stagePackHash: HashSchema,
  randomVersion: z.literal("SHA256_COUNTER_V1"),
  probabilityVersion: z.literal(PROBABILITY_VERSION),
  modelId: z.literal(PROBABILITY_MODEL_ID),
  modelHash: HashSchema,
  lutVersion: z.literal(EXP_LUT_VERSION),
  lutHash: HashSchema,
  rulesHash: HashSchema,
  matchId: IDSchema,
  seed: z.string().min(1).max(256),
  /** Global ordinal of ALL attempted deliveries, including wides and no-balls. */
  attemptOrdinal: CounterSchema,
  format: FormatSchema,
  phase: z.enum([
    "T20_EARLY", "T20_MIDDLE", "T20_LATE",
    "ODI_EARLY", "ODI_MIDDLE", "ODI_LATE", "RED_BALL",
  ]),
  context: ScoringContextSchema,
  bowling: z.strictObject({
    bowlingStyle: BowlingStyleSchema,
    controlRating: RatingSchema,
    movementRating: RatingSchema,
    fatigueBp: BasisPointsSchema,
    line: Line,
    intendedLength: Length,
    effort: Effort,
    variationId: z.literal("stock"),
  }),
  batting: z.strictObject({
    defenceRating: RatingSchema,
    timingRating: RatingSchema,
    powerRating: RatingSchema,
    rotationRating: RatingSchema,
    vsPaceRating: RatingSchema,
    vsSpinRating: RatingSchema,
    aggression: z.number().int().min(0).max(4),
    intent: z.enum(["NORMAL", "ROTATE", "PROTECT"]),
    attemptedStroke: z.boolean(),
    shotSectorWeights: z.array(z.number().int().min(0).max(10000)).length(8),
  }),
  conditions: z.strictObject({ seamBp: BasisPointsSchema, turnBp: BasisPointsSchema }),
  field: z.strictObject({
    keeper: z.strictObject({ keepingRating: RatingSchema, catchingRating: RatingSchema, throwingRating: RatingSchema }),
    slots: z.array(GeneratorFieldSlotSchema).length(9),
  }),
});
export type GenerateDeliveryRequest = z.infer<typeof GenerateDeliveryRequestSchema>;

export const GeneratorTraceStageSchema = z.strictObject({
  stageName: IDSchema,
  address: RandomAddressSchema,
  draw: z.number().int().min(0).max(4294967295),
  selectedCategoryId: IDSchema,
  categories: z.array(z.strictObject({
    id: IDSchema,
    allowed: z.boolean(),
    logitBp: z.number().int().nullable(),
    lutIndex: z.number().int().nullable(),
    mass: CounterSchema,
    cumulative: CounterSchema,
  })).min(1),
});
export const GeneratedDeliverySchema = z.strictObject({
  kind: z.literal("GENERATED_DELIVERY"),
  generatorVersion: z.literal(DELIVERY_GENERATOR_VERSION),
  modelHash: HashSchema,
  stagePackHash: HashSchema,
  internalOnly: z.literal(true),
  trace: z.array(GeneratorTraceStageSchema).min(2),
  resolution: DeliveryResolutionSchema,
});
export type GeneratedDelivery = z.infer<typeof GeneratedDeliverySchema>;
