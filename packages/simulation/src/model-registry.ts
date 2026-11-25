import {
  CALIBRATED_T20_MODEL_ID, PROBABILITY_MODEL_ID, type ProbabilityModelId,
} from "@lcxxvi/contracts";
import {
  CALIBRATED_T20_PACK, CALIBRATED_T20_PACK_SHA256, MODEL_PACK_SHA256,
} from "@lcxxvi/data";
import { canonicalStateBytes, sha256Hex } from "./determinism.js";

/**
 * Stage C (owner decision, 25 November 2026, option A): probability models keyed by model id.
 * synthetic-alpha-01 is the only gameplay model and is unchanged. calibrated-t20-01 is research only: it adds the
 * CALIBRATED_T20_PACK skill terms to synthetic-alpha-01's packs and is reachable only through
 * validateT20ResearchMatchSetup. Each entry pins the SHA-256 that a set-up records as `versions.modelHash`.
 */
export type RegisteredModel = Readonly<{
  modelId: ProbabilityModelId;
  modelHash: string;
  gameplay: boolean;
  skillPack: typeof CALIBRATED_T20_PACK | null;
}>;

if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_PACK)) !== CALIBRATED_T20_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 pack bytes do not match the pinned hash");
if (CALIBRATED_T20_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 base pack is not the pinned synthetic-alpha-01 pack");

export const MODEL_REGISTRY: Readonly<Record<ProbabilityModelId, RegisteredModel>> = Object.freeze({
  [PROBABILITY_MODEL_ID]: Object.freeze({ modelId: PROBABILITY_MODEL_ID, modelHash: MODEL_PACK_SHA256, gameplay: true, skillPack: null }),
  [CALIBRATED_T20_MODEL_ID]: Object.freeze({ modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_PACK_SHA256, gameplay: false, skillPack: CALIBRATED_T20_PACK }),
});

/** The registered model for an id and hash pair, or null when the pair is not registered. */
export function registeredModel(modelId: unknown, modelHash: unknown): RegisteredModel | null {
  if (typeof modelId !== "string" || !Object.hasOwn(MODEL_REGISTRY, modelId)) return null;
  const entry = MODEL_REGISTRY[modelId as ProbabilityModelId];
  return entry.modelHash === modelHash ? entry : null;
}
