import { z } from "zod";
import {
  CounterSchema,
  IDSchema,
  MatchVersionsSchema,
  type MatchVersions,
} from "./core.js";
export const RANDOM_VERSION = "SHA256_COUNTER_V1" as const;
export const STATE_HASH_VERSION = "LC_CANONICAL_JSON_V1_SHA256" as const;
export const RandomAddressSchema = z.strictObject({
  seed: z.string().min(1).max(256),
  domain: z.enum([
    "MATCH_DELIVERY",
    "TOSS",
    "WEATHER",
    "AI_TIE_BREAK",
    "CAREER_TRAINING",
    "WORLD_GENERATION",
    "PREDICTION",
  ]),
  entityId: IDSchema,
  eventOrdinal: CounterSchema,
  stageName: IDSchema,
  drawIndex: CounterSchema,
});
export const RandomRequestSchema = z.strictObject({
  kind: z.literal("RANDOM"),
  version: z.literal(RANDOM_VERSION),
  address: RandomAddressSchema,
});
export const StateHashRequestSchema = z.strictObject({
  kind: z.literal("HASH_STATE"),
  version: z.literal(STATE_HASH_VERSION),
  value: z.json(),
});
export const DeterminismRequestSchema = z.discriminatedUnion("kind", [
  RandomRequestSchema,
  StateHashRequestSchema,
]);
export type DeterminismRequest = z.infer<typeof DeterminismRequestSchema>;
export type RandomAddress = z.infer<typeof RandomAddressSchema>;
/** Stateless address service; draw allocation belongs to the caller. */
export interface RandomService {
  readonly version: "SHA256_COUNTER_V1";
  uint32(address: Readonly<RandomAddress>): number;
}
export interface StateHasher {
  readonly version: "LC_CANONICAL_JSON_V1_SHA256";
  hash(value: unknown): string;
}
export interface VersionSupport {
  readonly schema: readonly string[];
  readonly engine: readonly string[];
  readonly random: readonly string[];
  readonly rules: Readonly<Record<string, string>>;
  readonly model: Readonly<Record<string, string>>;
  readonly worldHashes: readonly string[];
}
export function assertSupportedVersions(
  input: unknown,
  support: VersionSupport,
): MatchVersions {
  const v = MatchVersionsSchema.parse(input);
  if (
    !support.schema.includes(v.schema) ||
    !support.engine.includes(v.engine) ||
    !support.random.includes(v.random) ||
    support.rules[v.rules] !== v.rulesHash ||
    support.model[v.model] !== v.modelHash ||
    !support.worldHashes.includes(v.worldHash)
  )
    throw new Error(
      "UNSUPPORTED_VERSION: exact versions and pack hashes are required",
    );
  return v;
}
/** Fixed positional array, as specified by section 6. Does not draw randomness. */
export function randomAddressBytes(input: unknown): string {
  const a = RandomAddressSchema.parse(input);
  return JSON.stringify([
    a.seed,
    a.domain,
    a.entityId,
    a.eventOrdinal,
    a.stageName,
    a.drawIndex,
  ]);
}
/** Caller provides immutable namespace + source key; names/membership are never used implicitly. */
export function stableId(namespace: string, sourceKey: string): string {
  IDSchema.parse(namespace);
  IDSchema.parse(sourceKey);
  return IDSchema.parse(`${namespace.length}:${namespace}:${sourceKey}`);
}
/** LC canonical JSON v1: sorted UTF-16 keys, array order preserved, finite numbers only. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const encode = (v: unknown): string => {
    if (v === null) return "null";
    if (typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("Non-finite JSON number");
      return JSON.stringify(v);
    }
    if (typeof v !== "object") throw new Error("Non-JSON value");
    if (active.has(v)) throw new Error("Cyclic JSON");
    active.add(v);
    let result: string;
    if (Array.isArray(v)) {
      if (
        Object.getOwnPropertyNames(v).length !== v.length + 1 ||
        Object.keys(v).length !== v.length
      )
        throw new Error("Sparse or decorated array");
      if (Object.getOwnPropertySymbols(v).length)
        throw new Error("Symbol keys");
      const entries: string[] = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !("value" in d))
          throw new Error("Sparse array or JSON accessor");
        entries.push(encode(d.value));
      }
      result = "[" + entries.join(",") + "]";
    } else {
      if (
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        throw new Error("Non-plain JSON object");
      if (Object.getOwnPropertySymbols(v).length)
        throw new Error("Symbol keys");
      if (Object.getOwnPropertyNames(v).length !== Object.keys(v).length)
        throw new Error("Non-enumerable JSON property");
      const record = v as Record<string, unknown>;
      result =
        "{" +
        Object.keys(record)
          .sort()
          .map((k) => {
            const d = Object.getOwnPropertyDescriptor(record, k);
            if (!d || !("value" in d))
              throw new Error("JSON accessors forbidden");
            return JSON.stringify(k) + ":" + encode(d.value);
          })
          .join(",") +
        "}";
    }
    active.delete(v);
    return result;
  };
  return encode(value);
}
export const BUILD_CAPABILITIES = Object.freeze({
  pass: "07B",
  milestone: "M2_HEADLESS_T20_COMPLETE_AFTER_ACCEPTANCE",
  contracts: true,
  scoringFixtures: true,
  resolutionValidation: true,
  playableMatches: false,
  scoring: true,
  inningsReducers: true,
  scoringEngine: "LC_SCORING_V1",
  randomService: true,
  randomVersion: RANDOM_VERSION,
  stateHashing: true,
  stateHashVersion: STATE_HASH_VERSION,
  randomSampler: true, // Generic, explicitly addressed category sampling only.
  integerProbabilityModel: true,
  probabilityVersion: "LC_INTEGER_PROBABILITY_V1",
  modelStatus: "SYNTHETIC_ALPHA",
  deliveryGenerator: true, // One validated attempt only; not a playable match.
  deliveryGeneratorVersion: "LC_CONDITIONAL_DELIVERY_V1",
  deliveryGeneratorProductionVerified: true,
  fictionalRoster: true,
  fictionalWorldId: "fictional-eight-01",
  fictionalWorldPlayers: 160,
  fictionalWorldTeams: 8,
  fictionalWorldGrounds: 8,
  headlessT20Engine: true,
  headlessT20EngineVersion: "LC_T20_MATCH_V1",
  eventChainVersion: "LC_T20_EVENT_CHAIN_V1",
  completeMatchReplay: true,
  inMemoryCommandReceipts: true,
  immutableT20Setup: true,
  t20SetupVersion: "LC_T20_SETUP_V1",
  persistence: false,
  prediction: false,
  limitedOversRain: false,
  superOver: false,
  injuries: false,
  nextPass: "Pass 08 / M3: user-facing interactive match UI",
} as const);
