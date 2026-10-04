import { z } from "zod";
import {
  IDSchema,
  CounterSchema,
  PositiveCounterSchema,
  FormatSchema,
  HashSchema,
  NameSchema,
  PlayerSchema,
  PitchSchema,
  BasisPointsSchema,
  MatchVersionsSchema,
} from "./core.js";
export const CapabilitiesSchema = z.strictObject({
  limitedOversRain: z.literal(false),
  superOver: z.literal(false),
  injuries: z.literal(false),
  prediction: z.boolean(),
});
export const MatchSetupManifestSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  gameId: IDSchema,
  matchId: IDSchema,
  format: FormatSchema,
  worldPackId: IDSchema,
  rulesId: IDSchema,
  modelId: IDSchema,
  randomId: z.literal("SHA256_COUNTER_V1"),
  seed: z.string().min(1).max(256),
  teamIds: z.tuple([IDSchema, IDSchema]),
  groundId: IDSchema,
  capabilities: CapabilitiesSchema,
});
export const TeamSchema = z.strictObject({
  teamId: IDSchema,
  name: NameSchema,
  squadIds: z.array(IDSchema).min(11).max(100),
  colours: z.tuple([
    z.string().regex(/^#[a-fA-F0-9]{6}$/),
    z.string().regex(/^#[a-fA-F0-9]{6}$/),
  ]),
});
export const GroundSchema = z.strictObject({
  groundId: IDSchema,
  name: NameSchema,
  pitchPrior: PitchSchema,
  sectorRadiiCm: z.array(PositiveCounterSchema).length(8),
  outfieldSpeedBp: BasisPointsSchema,
});
export const FieldPositionSchema = z.strictObject({
  slotId: IDSchema,
  sector: CounterSchema.max(7),
  angleDegrees: CounterSchema.max(359),
  depth: z.enum(["INNER", "MIDDLE", "DEEP"]),
  insideCircle: z.boolean(),
  legSide: z.boolean(),
  behindSquare: z.boolean(),
});
export const FieldRegistrySchema = z.strictObject({
  registryId: IDSchema,
  referenceHand: z.literal("R"),
  positions: z.array(FieldPositionSchema).min(9),
});
export const FieldPhaseSchema = z.strictObject({
  fromLegalBall: CounterSchema,
  maxOutside: CounterSchema.max(9),
});
export const RuleManifestSchema = z.strictObject({
  rulesId: IDSchema,
  schemaVersion: z.literal("1.0.0"),
  format: FormatSchema,
  referenceEdition: z.literal("MCC_2017_FOURTH_EDITION_2026"),
  effectiveDate: z.literal("2026-10-01"),
  customProfile: z.literal(true),
  ballsPerOver: z.literal(6),
  playersPerXI: z.literal(11),
  wicketsToAllOut: z.literal(10),
  inningsPerTeam: z.union([z.literal(1), z.literal(2)]),
  allocatedBalls: PositiveCounterSchema.nullable(),
  bowlerMaxBalls: PositiveCounterSchema.nullable(),
  consecutiveOvers: z.literal(false),
  freeHitAfterNoBall: z.boolean(),
  declarations: z.boolean(),
  followOnLead: PositiveCounterSchema.nullable(),
  newBallAfterLegalBalls: PositiveCounterSchema.nullable(),
  fieldPhases: z.array(FieldPhaseSchema),
  maxLegSide: z.literal(5),
  maxBehindSquareLegSide: z.literal(2),
  limitedOversRain: z.literal(false),
  superOver: z.literal(false),
  supportedClauses: z.array(z.string().min(1)),
  localVariations: z.array(z.string().min(1)),
  fixtureIds: z.array(IDSchema),
  validationStatus: z.literal("CONTRACT_ONLY"),
});
export const ModelManifestSchema = z.strictObject({
  modelId: IDSchema,
  schemaVersion: z.literal("1.0.0"),
  status: z.enum(["SYNTHETIC_ALPHA", "EMPIRICALLY_VALIDATED"]),
  randomId: z.literal("SHA256_COUNTER_V1"),
  fixedPointScale: z.literal(10000),
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
});
export const WorldPackSchema = z.strictObject({
  packId: IDSchema,
  schemaVersion: z.literal("1.0.0"),
  players: z.array(PlayerSchema).min(1).max(10000),
  teams: z.array(TeamSchema).min(2).max(500),
  grounds: z.array(GroundSchema).min(1),
  rulesIds: z.array(IDSchema).min(1),
  provenance: z.string().min(1).max(2000),
});
export const ArchiveEntrySchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(240)
    .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9_./-]+$/),
  bytes: CounterSchema.max(100_000_000),
  sha256: HashSchema,
});
export const ArchiveManifestSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  gameId: IDSchema,
  versions: MatchVersionsSchema,
  entries: z.array(ArchiveEntrySchema).min(1).max(2000),
});
export type MatchSetupManifest = z.infer<typeof MatchSetupManifestSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Ground = z.infer<typeof GroundSchema>;
export type FieldRegistry = z.infer<typeof FieldRegistrySchema>;
export type RuleManifest = z.infer<typeof RuleManifestSchema>;
export type ModelManifest = z.infer<typeof ModelManifestSchema>;
export type WorldPack = z.infer<typeof WorldPackSchema>;
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;
