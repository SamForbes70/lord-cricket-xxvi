import {
  CALIBRATED_T20_02_MODEL_ID, CALIBRATED_T20_MODEL_ID, PROBABILITY_MODEL_ID, type ProbabilityModelId,
} from "@lcxxvi/contracts";
import {
  CALIBRATED_T20_02_DELIVERY_PACK, CALIBRATED_T20_02_DELIVERY_PACK_SHA256, CALIBRATED_T20_02_MODEL_HASH,
  CALIBRATED_T20_02_PACK, CALIBRATED_T20_02_PACK_SHA256,
  CALIBRATED_T20_DELIVERY_PACK, CALIBRATED_T20_DELIVERY_PACK_SHA256, CALIBRATED_T20_MODEL_HASH,
  CALIBRATED_T20_PACK, CALIBRATED_T20_PACK_SHA256, CALIBRATED_T20_TACTICS_PACK, CALIBRATED_T20_TACTICS_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256, MODEL_PACK_SHA256,
} from "@lcxxvi/data";
import { canonicalStateBytes, sha256Hex } from "./determinism.js";

/**
 * Stage C (owner decision, 25 November 2026, option A): probability models keyed by model id.
 * synthetic-alpha-01 is the only gameplay model and is unchanged. calibrated-t20-01 is research only: it adds the
 * CALIBRATED_T20_PACK skill terms to synthetic-alpha-01's packs and is reachable only through
 * validateT20ResearchMatchSetup. Each entry pins the SHA-256 that a set-up records as `versions.modelHash`.
 * C4: calibrated-t20-01 also carries the delivery-outcome component CALIBRATED_T20_DELIVERY_PACK, and its model hash
 * covers both components (CALIBRATED_T20_MODEL_HASH).
 * C5: a third component, the tactics pack CALIBRATED_T20_TACTICS_PACK (bowling length, effort and slip cordon; design
 * choices, not fitted), and the model hash covers all three.
 * C6: a second research model, calibrated-t20-02, a separately versioned refit with its own skill pack (V6) and
 * delivery pack (V3, which adds catch-chance and bowled and lbw terms by phase), and calibrated-t20-01's tactics pack
 * shared unchanged. calibrated-t20-01's entry, packs and hashes are unchanged. Research only: gameplay false.
 */
/** The delivery-outcome pack shape: V2's fields, plus V3's optional phase terms (calibrated-t20-02 only). */
export type CalibratedDeliveryPack = typeof CALIBRATED_T20_DELIVERY_PACK & Partial<Pick<typeof CALIBRATED_T20_02_DELIVERY_PACK,
  "catchOpportunityPhaseBp" | "dismissalPhaseBp">>;
export type RegisteredModel = Readonly<{
  modelId: ProbabilityModelId;
  modelHash: string;
  gameplay: boolean;
  skillPack: typeof CALIBRATED_T20_PACK | null;
  deliveryPack: CalibratedDeliveryPack | null;
  tacticsPack: typeof CALIBRATED_T20_TACTICS_PACK | null;
}>;

if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_PACK)) !== CALIBRATED_T20_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 pack bytes do not match the pinned hash");
if (CALIBRATED_T20_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 base pack is not the pinned synthetic-alpha-01 pack");
if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_DELIVERY_PACK)) !== CALIBRATED_T20_DELIVERY_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 delivery pack bytes do not match the pinned hash");
if (CALIBRATED_T20_DELIVERY_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256 ||
    CALIBRATED_T20_DELIVERY_PACK.manifest.base.stagePackSha256 !== DELIVERY_STAGE_PACK_SHA256 ||
    CALIBRATED_T20_DELIVERY_PACK.manifest.base.skillPackSha256 !== CALIBRATED_T20_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 delivery pack is not built on the pinned packs");
if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_TACTICS_PACK)) !== CALIBRATED_T20_TACTICS_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 tactics pack bytes do not match the pinned hash");
if (CALIBRATED_T20_TACTICS_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256 ||
    CALIBRATED_T20_TACTICS_PACK.manifest.base.stagePackSha256 !== DELIVERY_STAGE_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 tactics pack is not built on the pinned packs");
if (sha256Hex(canonicalStateBytes({ deliveryPackSha256: CALIBRATED_T20_DELIVERY_PACK_SHA256, skillPackSha256: CALIBRATED_T20_PACK_SHA256,
  tacticsPackSha256: CALIBRATED_T20_TACTICS_PACK_SHA256 })) !== CALIBRATED_T20_MODEL_HASH)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-01 model hash does not cover its pinned components");
// C6: calibrated-t20-02's own chain (skill V6, delivery V3 built on skill V6, the shared tactics V1).
if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_02_PACK)) !== CALIBRATED_T20_02_PACK_SHA256 ||
    CALIBRATED_T20_02_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256 ||
    CALIBRATED_T20_02_PACK.manifest.modelId !== CALIBRATED_T20_02_MODEL_ID)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-02 skill pack bytes or base do not match the pinned hash");
if (sha256Hex(canonicalStateBytes(CALIBRATED_T20_02_DELIVERY_PACK)) !== CALIBRATED_T20_02_DELIVERY_PACK_SHA256 ||
    CALIBRATED_T20_02_DELIVERY_PACK.manifest.modelId !== CALIBRATED_T20_02_MODEL_ID ||
    CALIBRATED_T20_02_DELIVERY_PACK.manifest.base.probabilityPackSha256 !== MODEL_PACK_SHA256 ||
    CALIBRATED_T20_02_DELIVERY_PACK.manifest.base.stagePackSha256 !== DELIVERY_STAGE_PACK_SHA256 ||
    CALIBRATED_T20_02_DELIVERY_PACK.manifest.base.skillPackSha256 !== CALIBRATED_T20_02_PACK_SHA256)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-02 delivery pack is not the pinned pack built on the pinned packs");
if (sha256Hex(canonicalStateBytes({ deliveryPackSha256: CALIBRATED_T20_02_DELIVERY_PACK_SHA256, skillPackSha256: CALIBRATED_T20_02_PACK_SHA256,
  tacticsPackSha256: CALIBRATED_T20_TACTICS_PACK_SHA256 })) !== CALIBRATED_T20_02_MODEL_HASH)
  throw new Error("UNSUPPORTED_MODEL_HASH: calibrated-t20-02 model hash does not cover its pinned components");

export const MODEL_REGISTRY: Readonly<Record<ProbabilityModelId, RegisteredModel>> = Object.freeze({
  [PROBABILITY_MODEL_ID]: Object.freeze({ modelId: PROBABILITY_MODEL_ID, modelHash: MODEL_PACK_SHA256, gameplay: true, skillPack: null, deliveryPack: null, tacticsPack: null }),
  [CALIBRATED_T20_MODEL_ID]: Object.freeze({ modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_MODEL_HASH, gameplay: false,
    skillPack: CALIBRATED_T20_PACK, deliveryPack: CALIBRATED_T20_DELIVERY_PACK, tacticsPack: CALIBRATED_T20_TACTICS_PACK }),
  [CALIBRATED_T20_02_MODEL_ID]: Object.freeze({ modelId: CALIBRATED_T20_02_MODEL_ID, modelHash: CALIBRATED_T20_02_MODEL_HASH, gameplay: false,
    skillPack: CALIBRATED_T20_02_PACK, deliveryPack: CALIBRATED_T20_02_DELIVERY_PACK, tacticsPack: CALIBRATED_T20_TACTICS_PACK }),
});

/** The registered model for an id and hash pair, or null when the pair is not registered. */
export function registeredModel(modelId: unknown, modelHash: unknown): RegisteredModel | null {
  if (typeof modelId !== "string" || !Object.hasOwn(MODEL_REGISTRY, modelId)) return null;
  const entry = MODEL_REGISTRY[modelId as ProbabilityModelId];
  return entry.modelHash === modelHash ? entry : null;
}
