import {
  canonicalJson,
  ProbabilityContextSchema,
  ProbabilityPackSchema,
  LegalityFeatureInputSchema,
  ContactFeatureInputSchema,
  ProbabilityRequestSchema,
  PROBABILITY_MASS,
  PROBABILITY_MODEL_ID,
  PROBABILITY_VERSION,
  EXP_LUT_VERSION,
  RANDOM_VERSION,
  type ProbabilityCategory,
  type ProbabilityContext,
  type ProbabilityMass,
  type ProbabilityPack,
} from "@lcxxvi/contracts";
import {
  SYNTHETIC_ALPHA_PACK,
  EXP_LUT_SHA256,
  MODEL_PACK_SHA256,
} from "@lcxxvi/data";
import { canonicalStateBytes, createRandomService, sha256Hex } from "./determinism.js";

const MASS = BigInt(PROBABILITY_MASS);
const SCALE = 10000n;
const MIN_LOGIT = -80000n;
const MAX_LOGIT = 80000n;
const LUT_STEP = 100n;

/** Integer division rounded to nearest with exact halfway cases away from zero. */
export function roundDivTiesAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("INVALID_DIVISOR: must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return sign * ((magnitude * 2n + denominator) / (2n * denominator));
}

/** Term multiplication is independently rounded BEFORE the next addition. */
export function accumulateLogit(category: Readonly<ProbabilityCategory>): number {
  let logit = BigInt(category.interceptBp);
  for (const term of category.terms) {
    logit += roundDivTiesAway(
      BigInt(term.coefficientBp) * BigInt(term.featureBp),
      SCALE,
    );
  }
  if (logit < MIN_LOGIT) return Number(MIN_LOGIT);
  if (logit > MAX_LOGIT) return Number(MAX_LOGIT);
  return Number(logit);
}

function verifyPack(raw: unknown): ProbabilityPack {
  // Require plain, fully enumerable JSON before Zod reads fields or getters.
  canonicalJson(raw);
  const pack = ProbabilityPackSchema.parse(raw);
  if (sha256Hex(canonicalStateBytes(pack)) !== MODEL_PACK_SHA256) {
    throw new Error("UNSUPPORTED_MODEL_HASH: model pack bytes do not match pinned version");
  }
  if (
    pack.manifest.modelId !== PROBABILITY_MODEL_ID ||
    pack.probabilityVersion !== PROBABILITY_VERSION ||
    pack.lutVersion !== EXP_LUT_VERSION ||
    pack.manifest.expLutHash !== EXP_LUT_SHA256
  ) throw new Error("UNSUPPORTED_MODEL_VERSION");
  const lutSpec = {
    version: pack.lutVersion,
    stepBp: pack.lutStepBp,
    minDeltaBp: pack.lutMinDeltaBp,
    maxDeltaBp: pack.lutMaxDeltaBp,
    scale: pack.lutScale,
    values: pack.expLutValues,
  };
  if (sha256Hex(canonicalStateBytes(lutSpec)) !== pack.manifest.expLutHash) {
    throw new Error("UNSUPPORTED_LUT_HASH: lookup table checksum mismatch");
  }
  if (sha256Hex(canonicalStateBytes(pack.featureSpec)) !== pack.manifest.featureSpecHash) {
    throw new Error("UNSUPPORTED_FEATURE_SPEC_HASH");
  }
  if (pack.expLutValues[0] !== 1_000_000_000_000 ||
      pack.expLutValues.at(-1)! <= 0 ||
      pack.expLutValues.some((n, i, arr) => i > 0 && n > arr[i - 1]!)) {
    throw new Error("INVALID_LUT: nonpositive or non-monotone exponential table");
  }
  const allRows = [pack.baselines.legality, ...Object.values(pack.baselines.contact)];
  if (Object.keys(pack.baselines.contact).length !== 7 || allRows.some(row =>
    row.reduce((sum, entry) => sum + entry.baseWeight, 0) !== 10000 ||
    new Set(row.map(entry => entry.id)).size !== row.length)) {
    throw new Error("INVALID_SYNTHETIC_BASELINES");
  }
  return pack;
}

export type NormalisedProbabilities = {
  readonly probabilityVersion: typeof PROBABILITY_VERSION;
  readonly modelId: typeof PROBABILITY_MODEL_ID;
  readonly modelHash: string;
  readonly lutVersion: typeof EXP_LUT_VERSION;
  readonly lutHash: string;
  readonly totalMass: typeof PROBABILITY_MASS;
  readonly categories: readonly ProbabilityMass[];
};

/** Direct interval selection is exposed for independent zero/maximum boundary tests. */
export function chooseCategoricalMass(
  categories: readonly ProbabilityMass[],
  draw: number,
): { index: number; id: string } {
  if (!Number.isInteger(draw) || draw < 0 || draw >= PROBABILITY_MASS) {
    throw new Error("INVALID_UINT32: draw outside [0, 2^32)");
  }
  if (categories.length === 0 || categories.length > 32) throw new Error("INVALID_CUMULATIVE_MASS");
  let previous = 0;
  let selectedIndex = -1;
  for (let i = 0; i < categories.length; i++) {
    const item = categories[i]!;
    if (!Number.isSafeInteger(item.mass) || !Number.isSafeInteger(item.cumulative) ||
        item.mass < 0 || item.cumulative !== previous + item.mass ||
        (!item.allowed && item.mass !== 0) || item.cumulative > PROBABILITY_MASS) {
      throw new Error("INVALID_CUMULATIVE_MASS");
    }
    if (selectedIndex < 0 && item.mass > 0 && draw < item.cumulative) selectedIndex = i;
    previous = item.cumulative;
  }
  if (previous !== PROBABILITY_MASS || selectedIndex === -1) {
    throw new Error("INVALID_CUMULATIVE_MASS: exact 2^32 coverage required");
  }
  return { index: selectedIndex, id: categories[selectedIndex]!.id };
}

export function createProbabilityService(rawPack: unknown = SYNTHETIC_ALPHA_PACK) {
  const pack = verifyPack(rawPack);
  const lut = Object.freeze(pack.expLutValues.slice());
  const rng = createRandomService(RANDOM_VERSION);

  function normalise(input: unknown): NormalisedProbabilities {
    canonicalJson(input);
    const context: ProbabilityContext = ProbabilityContextSchema.parse(input);
    if (context.modelHash !== MODEL_PACK_SHA256 || context.lutHash !== EXP_LUT_SHA256) {
      throw new Error("UNSUPPORTED_MODEL_OR_LUT_HASH");
    }
    const ids = context.categories.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("DUPLICATE_CATEGORY_ID: canonical category order requires unique IDs");
    }
    const logits = context.categories.map((c) =>
      c.allowed && c.baseWeight > 0 ? accumulateLogit(c) : null,
    );
    const active = logits.filter((n): n is number => n !== null);
    if (!active.length) throw new Error("EMPTY_POSITIVE_MASK: no allowed category has positive weight");
    const maxLogit = active.reduce((a, b) => a > b ? a : b);
    const indices = logits.map((logit) => {
      if (logit === null) return null;
      const delta = BigInt(logit) - BigInt(maxLogit);
      const index = Number(-roundDivTiesAway(delta, LUT_STEP));
      if (index < 0 || index >= lut.length) throw new Error("INVALID_LUT_INDEX");
      return index;
    });
    const weights = context.categories.map((category, index) =>
      indices[index] === null ? 0n :
        BigInt(category.baseWeight) * BigInt(lut[indices[index]!]!),
    );
    const total = weights.reduce((acc, n) => acc + n, 0n);
    if (total <= 0n) throw new Error("INVALID_PROBABILITY_TOTAL");
    const numerators = weights.map((w) => w * MASS);
    const masses = numerators.map((n) => n / total);
    const remainders = numerators.map((n) => n % total);
    const unallocated = MASS - masses.reduce((sum, n) => sum + n, 0n);
    if (unallocated < 0n || unallocated >= BigInt(weights.length)) {
      throw new Error("INVALID_REMAINDER_ALLOCATION");
    }
    const order = weights.map((_, index) => index).sort((a, b) => {
      const comparison = remainders[a]! - remainders[b]!;
      return comparison > 0n ? -1 : comparison < 0n ? 1 : a - b;
    });
    for (let j = 0; j < Number(unallocated); j++) masses[order[j]!]! += 1n;
    let cumulative = 0;
    const categories = context.categories.map((category, index): ProbabilityMass => {
      const mass = Number(masses[index]!);
      cumulative += mass;
      return Object.freeze({
        id: category.id,
        allowed: category.allowed,
        logitBp: logits[index]!,
        lutIndex: indices[index]!,
        mass,
        cumulative,
      });
    });
    if (cumulative !== PROBABILITY_MASS) throw new Error("MASS_NOT_NORMALISED");
    return Object.freeze({
      probabilityVersion: PROBABILITY_VERSION,
      modelId: PROBABILITY_MODEL_ID,
      modelHash: MODEL_PACK_SHA256,
      lutVersion: EXP_LUT_VERSION,
      lutHash: EXP_LUT_SHA256,
      totalMass: PROBABILITY_MASS,
      categories: Object.freeze(categories),
    });
  }

  function execute(input: unknown) {
    canonicalJson(input);
    const request = ProbabilityRequestSchema.parse(input);
    const distribution = normalise({
      probabilityVersion: request.probabilityVersion,
      modelId: request.modelId,
      modelHash: request.modelHash,
      lutVersion: request.lutVersion,
      lutHash: request.lutHash,
      categories: request.categories,
    });
    if (request.kind === "NORMALISE_CATEGORIES") {
      return { kind: request.kind, ...distribution };
    }
    // Caller owns global attempt index and variable-specific draw indices.
    // Never derive an address from the legal-ball count or UI frame count.
    if (request.address.stageName !== request.stageName) {
      throw new Error("STAGE_ADDRESS_MISMATCH: draw address must name its probability stage");
    }
    const draw = rng.uint32(request.address);
    const selected = chooseCategoricalMass(distribution.categories, draw);
    return {
      kind: request.kind,
      ...distribution,
      draw,
      selectedIndex: selected.index,
      selectedCategoryId: selected.id,
    };
  }

  return Object.freeze({
    version: PROBABILITY_VERSION,
    modelId: PROBABILITY_MODEL_ID,
    modelHash: MODEL_PACK_SHA256,
    lutHash: EXP_LUT_SHA256,
    normalise,
    execute,
  });
}

const defaultService = createProbabilityService();
/** Strict API shared by CLI, browser main thread and dedicated worker. */
export function executeProbabilityRequest(input: unknown) {
  return defaultService.execute(input);
}

export function baselineCategories(name: "LEGALITY" | keyof typeof SYNTHETIC_ALPHA_PACK.baselines.contact) {
  const row = name === "LEGALITY" ? SYNTHETIC_ALPHA_PACK.baselines.legality :
    SYNTHETIC_ALPHA_PACK.baselines.contact[name];
  if (!row) throw new Error("UNSUPPORTED_BASELINE_STAGE");
  return row.map((entry) => ({
    id: entry.id,
    baseWeight: entry.baseWeight,
    allowed: true,
    interceptBp: 0,
    terms: [],
  }));
}

/** Appendix F2 provisional coefficients. No legality outcome is sampled here. */
export function legalityCategories(input: unknown): ProbabilityCategory[] {
  canonicalJson(input);
  const v = LegalityFeatureInputSchema.parse(input);
  const features = {
    CONTROL: (v.controlRating - 50) * 200,
    FATIGUE: v.fatigueBp,
    LEG_LINE: v.line === "LEG" ? 10000 : 0,
    MAXIMUM_EFFORT: v.effort === "MAXIMUM" ? 10000 : 0,
    CONSERVE_EFFORT: v.effort === "CONSERVE" ? 10000 : 0,
  };
  return SYNTHETIC_ALPHA_PACK.baselines.legality.map((entry) => {
    const adjustment = Object.entries(SYNTHETIC_ALPHA_PACK.coefficients.legality)
      .find(([name]) => name === entry.id)?.[1];
    const terms = adjustment ? Object.entries(adjustment).map(([name, coefficientBp]) => {
      const featureBp = features[name as keyof typeof features];
      if (featureBp === undefined) throw new Error("UNKNOWN_LEGALITY_FEATURE");
      return { coefficientBp, featureBp };
    }) : [];
    return { id: entry.id, baseWeight: entry.baseWeight,
      allowed: true, interceptBp: 0, terms };
  });
}

/** Appendix F3 provisional baseline adjustments using already-resolved movement. */
export function contactCategories(input: unknown): ProbabilityCategory[] {
  canonicalJson(input);
  const v = ContactFeatureInputSchema.parse(input);
  const features = {
    DEFENCE: (v.defenceRating - 50) * 200,
    TIMING: (v.timingRating - 50) * 200,
    POWER: (v.powerRating - 50) * 200,
    AGGRESSION: (v.aggression - 2) * 10000,
    MOVEMENT: v.effectiveMovementBp,
  };
  return SYNTHETIC_ALPHA_PACK.baselines.contact[v.phase].map((entry) => {
    const adjustment = Object.entries(SYNTHETIC_ALPHA_PACK.coefficients.contact)
      .find(([name]) => name === entry.id)?.[1];
    if (!adjustment) throw new Error("MISSING_CONTACT_COEFFICIENT");
    const terms = Object.entries(adjustment).map(([name, coefficientBp]) => {
      const featureBp = features[name as keyof typeof features];
      if (featureBp === undefined) throw new Error("UNKNOWN_CONTACT_FEATURE");
      return { coefficientBp, featureBp };
    });
    return { id: entry.id, baseWeight: entry.baseWeight,
      allowed: true, interceptBp: 0, terms };
  });
}
