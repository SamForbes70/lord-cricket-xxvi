import { z } from "zod";
import { HashSchema, IDSchema } from "./core.js";
import { MatchSetupManifestSchema } from "./configuration.js";

/** Additive Pass 07A contracts. Generic WorldPackSchema remains unchanged. */
export const DefaultWorldManifestSchema = z.strictObject({
  worldPackId: z.literal("fictional-eight-01"),
  schemaVersion: z.literal("1.0.0"),
  worldGeneratorVersion: z.literal("LC_FICTIONAL_WORLD_GENERATOR_V1"),
  worldSeed: z.string().min(1).max(256),
  generatorSourceSha256: HashSchema,
  provenanceSourceSha256: HashSchema,
  worldFileSha256: HashSchema,
  worldCanonicalSha256: HashSchema,
  worldByteLength: z.number().int().min(1).max(25_000_000),
  rulesIds: z.array(IDSchema).length(3),
  modelId: z.literal("synthetic-alpha-01"),
  modelHash: HashSchema,
  stagePackId: z.literal("synthetic-alpha-01-delivery-v1"),
  stagePackHash: HashSchema,
  randomId: z.literal("SHA256_COUNTER_V1"),
  variationIds: z.array(IDSchema).min(1),
  provenance: z.literal("FICTIONAL"),
  modelStatus: z.literal("SYNTHETIC_ALPHA"),
  teamIds: z.array(IDSchema).length(8),
  groundIds: z.array(IDSchema).length(8),
  homeGroundIds: z.record(IDSchema, IDSchema),
});
export const T20TeamSelectionSchema = z.strictObject({
  teamId: IDSchema,
  playerIds: z.array(IDSchema).length(11),
  captainId: IDSchema,
  keeperId: IDSchema,
});
/** Fixed setup-time asset hashes, never accept a mutable or later runtime substitute. */
export const T20MatchSetupRequestSchema = z.strictObject({
  setup: MatchSetupManifestSchema,
  worldFileSha256: HashSchema,
  worldCanonicalSha256: HashSchema,
  rulesHash: HashSchema,
  modelHash: HashSchema,
  stagePackHash: HashSchema,
  setupVersion: z.literal("LC_T20_SETUP_V1"),
  selectedTeams: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
});
export type DefaultWorldManifest = z.infer<typeof DefaultWorldManifestSchema>;
export type T20TeamSelection = z.infer<typeof T20TeamSelectionSchema>;
export type T20MatchSetupRequest = z.infer<typeof T20MatchSetupRequestSchema>;
/** Pass 10 / M5A ODI setup uses the same XI selection shape with a distinct version boundary. */
export const ODIMatchSetupRequestSchema = z.strictObject({
  setup: MatchSetupManifestSchema,
  worldFileSha256: HashSchema,
  worldCanonicalSha256: HashSchema,
  rulesHash: HashSchema,
  modelHash: HashSchema,
  stagePackHash: HashSchema,
  setupVersion: z.literal("LC_ODI_SETUP_V1"),
  selectedTeams: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
});
export type ODIMatchSetupRequest = z.infer<typeof ODIMatchSetupRequestSchema>;


/** Pass 11 / M5B red-ball setup boundary. */
export const Red5MatchSetupRequestSchema = z.strictObject({
  setup: MatchSetupManifestSchema,
  worldFileSha256: HashSchema, worldCanonicalSha256: HashSchema, rulesHash: HashSchema, modelHash: HashSchema, stagePackHash: HashSchema,
  setupVersion: z.literal("LC_RED5_SETUP_V1"),
  selectedTeams: z.tuple([T20TeamSelectionSchema, T20TeamSelectionSchema]),
});
export type Red5MatchSetupRequest = z.infer<typeof Red5MatchSetupRequestSchema>;
