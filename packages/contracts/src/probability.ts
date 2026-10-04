import { z } from "zod";
import { HashSchema, IDSchema } from "./core.js";
import { RandomAddressSchema } from "./determinism.js";

/** Versions are part of event reproducibility. Never silently substitute a new LUT. */
export const PROBABILITY_VERSION = "LC_INTEGER_PROBABILITY_V1" as const;
export const EXP_LUT_VERSION = "LC_EXP_LUT_V1" as const;
export const PROBABILITY_MODEL_ID = "synthetic-alpha-01" as const;
export const PROBABILITY_SCALE = 10000 as const;
export const PROBABILITY_MASS = 4294967296 as const;

/** All floating point values are rejected at the runtime contract. */
export const SignedFeatureBpSchema = z.number().int().min(-20000).max(20000);
export const SignedCoefficientBpSchema = z.number().int().min(-100000).max(100000);
export const SignedInterceptBpSchema = z.number().int().min(-200000).max(200000);
export const ProbabilityTermSchema = z.strictObject({
  coefficientBp: SignedCoefficientBpSchema,
  featureBp: SignedFeatureBpSchema,
});
export const ProbabilityCategorySchema = z.strictObject({
  id: IDSchema,
  /** Zero is an explicitly non-sampleable category even when its mask is true. */
  baseWeight: z.number().int().min(0).max(1_000_000_000),
  allowed: z.boolean(),
  interceptBp: SignedInterceptBpSchema,
  /** Applied strictly in array order, rounding each product before addition. */
  terms: z.array(ProbabilityTermSchema).max(32),
});
export const ProbabilityContextSchema = z.strictObject({
  probabilityVersion: z.literal(PROBABILITY_VERSION),
  modelId: z.literal(PROBABILITY_MODEL_ID),
  modelHash: HashSchema,
  lutVersion: z.literal(EXP_LUT_VERSION),
  lutHash: HashSchema,
  /** Supplied category order is authoritative for largest-remainder ties. */
  categories: z.array(ProbabilityCategorySchema).min(1).max(32),
});
export const NormaliseCategoriesRequestSchema = ProbabilityContextSchema.extend({
  kind: z.literal("NORMALISE_CATEGORIES"),
});
export const SampleCategoryRequestSchema = ProbabilityContextSchema.extend({
  kind: z.literal("SAMPLE_CATEGORY"),
  stageName: IDSchema,
  randomVersion: z.literal("SHA256_COUNTER_V1"),
  address: RandomAddressSchema,
});
export const ProbabilityRequestSchema = z.discriminatedUnion("kind", [
  NormaliseCategoriesRequestSchema,
  SampleCategoryRequestSchema,
]);
export type ProbabilityRequest = z.infer<typeof ProbabilityRequestSchema>;
export type ProbabilityCategory = z.infer<typeof ProbabilityCategorySchema>;
export type ProbabilityContext = z.infer<typeof ProbabilityContextSchema>;
export type ProbabilityMass = {
  readonly id: string;
  readonly allowed: boolean;
  readonly logitBp: number | null;
  readonly lutIndex: number | null;
  readonly mass: number;
  readonly cumulative: number;
};

export const ProbabilityBaselineWeightSchema = z.strictObject({
  id: IDSchema,
  baseWeight: z.number().int().min(0).max(10000),
});
/** The only published pack shape for this bounded implementation. */
export const ProbabilityPackSchema = z.strictObject({
  manifest: z.strictObject({
    modelId: z.literal(PROBABILITY_MODEL_ID),
    schemaVersion: z.literal("1.0.0"),
    status: z.literal("SYNTHETIC_ALPHA"),
    randomId: z.literal("SHA256_COUNTER_V1"),
    fixedPointScale: z.literal(PROBABILITY_SCALE),
    expLutHash: HashSchema,
    featureSpecHash: HashSchema,
    variationIds: z.array(IDSchema),
    effects: z.strictObject({
      overAroundWicket: z.literal(false),
      individualVariations: z.literal(false),
      moisture: z.literal(false),
      geometryEffects: z.literal(false),
      outfieldSpeed: z.literal(false),
    }),
  }),
  probabilityVersion: z.literal(PROBABILITY_VERSION),
  lutVersion: z.literal(EXP_LUT_VERSION),
  lutScale: z.literal("1000000000000"),
  lutStepBp: z.literal(100),
  lutMinDeltaBp: z.literal(-160000),
  lutMaxDeltaBp: z.literal(0),
  logitMinBp: z.literal(-80000),
  logitMaxBp: z.literal(80000),
  coefficients: z.strictObject({
    legality: z.record(IDSchema, z.record(IDSchema, SignedCoefficientBpSchema)),
    contact: z.record(IDSchema, z.record(IDSchema, SignedCoefficientBpSchema)),
  }),
  featureSpec: z.strictObject({
    maxTerms: z.literal(32),
    fixedPointScale: z.literal(10000),
    termMultiplyRounding: z.literal("NEAREST_TIES_AWAY_FROM_ZERO"),
    accumulationOrder: z.literal("INTERCEPT_TERMS_IN_ARRAY_ORDER"),
    clipTiming: z.literal("AFTER_SUM"),
    lutDeltaRounding: z.literal("NEAREST_TIES_AWAY_FROM_ZERO"),
    categoryOrder: z.literal("AS_SUPPLIED"),
    massAllocation: z.literal("LARGEST_REMAINDER_CATEGORY_INDEX"),
  }),
  expLutValues: z.array(z.number().int().min(1).max(1_000_000_000_000)).length(1601),
  baselines: z.strictObject({
    legality: z.array(ProbabilityBaselineWeightSchema).length(3),
    contact: z.record(IDSchema, z.array(ProbabilityBaselineWeightSchema).length(6)),
  }),
});
export type ProbabilityPack = z.infer<typeof ProbabilityPackSchema>;

/** Typed stage inputs. Effective movement is resolved separately in the future conditional generator. */
export const LegalityFeatureInputSchema = z.strictObject({
  controlRating: z.number().int().min(0).max(100),
  fatigueBp: z.number().int().min(0).max(10000),
  line: z.enum(["OFF", "STUMPS", "LEG"]),
  effort: z.enum(["CONSERVE", "NORMAL", "MAXIMUM"]),
});
export const ContactFeatureInputSchema = z.strictObject({
  phase: z.enum(["T20_EARLY", "T20_MIDDLE", "T20_LATE", "ODI_EARLY", "ODI_MIDDLE", "ODI_LATE", "RED_BALL"]),
  defenceRating: z.number().int().min(0).max(100),
  timingRating: z.number().int().min(0).max(100),
  powerRating: z.number().int().min(0).max(100),
  effectiveMovementBp: z.number().int().min(-10000).max(10000),
  aggression: z.number().int().min(0).max(4),
});
