import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema } from "./core.js";
import { SeasonScheduleSchema } from "./competition.js";
import { CareerDayStateV2Schema } from "./career.js";
import { T20SeasonMatchCompletionSchema, T20SeasonProjectionStateSchema, SeasonTeamTableRowSchema, SeasonLeaderboardsSchema } from "./season-projections.js";
import { T20EventChainManifestSchema, T20MatchEventSchema } from "./t20-match.js";
import { T20MatchSetupRequestSchema } from "./world.js";

export const MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES = 1_000_000 as const;
export const MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES = 16_000_000 as const;
export const COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_VERSION = "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1" as const;

const SeasonStateCoreShape = {
  seasonStateVersion: z.literal("LC_T20_SEASON_STATE_V1"),
  seasonId: IDSchema,
  gameId: IDSchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  schedule: SeasonScheduleSchema,
  careerState: CareerDayStateV2Schema,
  projection: T20SeasonProjectionStateSchema,
  completedMatches: z.array(T20SeasonMatchCompletionSchema).max(56),
  revision: CounterSchema,
  phase: z.enum(["ACTIVE", "COMPLETE"]),
} as const;

export const T20SeasonStateCoreSchema = z.strictObject(SeasonStateCoreShape);
export const T20SeasonStateSchema = z.strictObject({
  ...SeasonStateCoreShape,
  stateSha256: HashSchema,
});

/**
 * Season state V2 (docs/pavilion/CAREER_FIXTURE_POLICY_V2.md): the same shape as V1. The version itself means its
 * computer-run fixtures use career fixture policy V2 (`LC_SEASON_XI_BASELINE_V2` and `LC_FIXTURE_CAPTAIN_V2`).
 * Only world state V6 accepts it; V1 seasons keep policy V1 for ever.
 */
export const T20_SEASON_STATE_V2_VERSION = "LC_T20_SEASON_STATE_V2" as const;
export const T20SeasonStateV2CoreSchema = T20SeasonStateCoreSchema.extend({
  seasonStateVersion: z.literal(T20_SEASON_STATE_V2_VERSION),
});
export const T20SeasonStateV2Schema = z.strictObject({
  ...T20SeasonStateV2CoreSchema.shape,
  stateSha256: HashSchema,
});
export const AnyT20SeasonStateCoreSchema = z.discriminatedUnion("seasonStateVersion", [
  T20SeasonStateCoreSchema,
  T20SeasonStateV2CoreSchema,
]);
export const AnyT20SeasonStateSchema = z.discriminatedUnion("seasonStateVersion", [
  T20SeasonStateSchema,
  T20SeasonStateV2Schema,
]);

export const SeasonSaveSummarySchema = z.strictObject({
  saveId: IDSchema,
  kind: z.enum(["AUTO", "MANUAL", "IMPORTED"]),
  title: z.string().min(1).max(240),
  seasonId: IDSchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  currentDate: z.iso.date(),
  revision: CounterSchema,
  completedFixtures: CounterSchema.max(56),
  phase: z.enum(["ACTIVE", "COMPLETE"]),
  stateSha256: HashSchema,
  updatedAt: z.iso.datetime(),
});

export const SeasonDurableCommandSchema = z.strictObject({
  commandId: IDSchema,
  requestCanonical: z.string(),
  responseJson: z.string(),
  committedRevision: CounterSchema,
});

export const SeasonArchiveCoreSchema = z.strictObject({
  archiveVersion: z.literal("LC_T20_SEASON_ARCHIVE_V1"),
  seasonId: IDSchema,
  careerId: IDSchema,
  scheduleSha256: HashSchema,
  stateSha256: HashSchema,
  projectionRevision: z.literal(56),
  fixtureCount: z.literal(56),
  completedAt: z.iso.datetime(),
  championTeamId: IDSchema,
  finalTable: z.array(SeasonTeamTableRowSchema).length(8),
  leaders: SeasonLeaderboardsSchema,
  completionKeys: z.array(IDSchema).length(56),
});

export const SeasonArchiveSchema = z.strictObject({
  ...SeasonArchiveCoreSchema.shape,
  archiveSha256: HashSchema,
});

export const SeasonRecoveryDiagnosticSchema = z.strictObject({
  saveId: IDSchema,
  requestedGeneration: z.number().int().min(0).max(2).nullable(),
  recoveredGeneration: z.number().int().min(0).max(2).nullable(),
  recoveredCheckpointSerial: CounterSchema.nullable(),
  recoveredRevision: CounterSchema.nullable(),
  corruptedGenerations: z.array(z.number().int().min(0).max(2)).max(3),
});

export const SeasonPortableManifestSchema = z.strictObject({
  archiveVersion: z.literal("LC_T20_SEASON_PORTABLE_V1"),
  saveSchema: z.literal("LC_SEASON_SAVE_V1"),
  exportedAt: z.iso.datetime(),
  summary: SeasonSaveSummarySchema,
  files: z.record(z.string().min(1), z.strictObject({ bytes: CounterSchema, sha256: HashSchema })),
});

export const SeasonPortableManifestV2Schema = SeasonPortableManifestSchema.extend({
  archiveVersion: z.literal("LC_T20_SEASON_PORTABLE_V2"),
  saveSchema: z.literal("LC_SEASON_SAVE_V2_PRESENTATION"),
  worldCopySha256: HashSchema,
});

export const CompletedCareerMatchEventArchiveCoreSchema = z.strictObject({
  archiveVersion: z.literal(COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_VERSION),
  seasonId: IDSchema,
  scheduleSha256: HashSchema,
  fixtureId: IDSchema,
  matchId: IDSchema,
  fixtureOrdinal: CounterSchema.max(55),
  roundNumber: z.number().int().min(1).max(14),
  matchDayDate: z.iso.date(),
  source: z.enum(["OFFSCREEN", "USER_MATCH"]),
  sourceCompletionSha256: HashSchema,
  scorecardSha256: HashSchema,
  setupRequest: T20MatchSetupRequestSchema,
  eventChain: T20EventChainManifestSchema,
  eventCount: CounterSchema.min(1).max(600),
  finalEventHash: HashSchema,
  eventsSha256: HashSchema,
  events: z.array(T20MatchEventSchema).min(1).max(600),
  byteLength: CounterSchema.min(1).max(MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES),
});

export const CompletedCareerMatchEventArchiveSchema = z.strictObject({
  ...CompletedCareerMatchEventArchiveCoreSchema.shape,
  archiveSha256: HashSchema,
});

export const SeasonCheckpointGenerationOptionSchema = z.strictObject({
  generation: z.number().int().min(0).max(2),
  checkpointSerial: CounterSchema,
  revision: CounterSchema,
  completedFixtures: CounterSchema.max(56),
  currentDate: z.iso.date(),
  phase: z.enum(["ACTIVE", "COMPLETE"]),
  stateSha256: HashSchema,
  createdAt: z.iso.datetime(),
});

export const SeasonCheckpointInspectionSchema = z.strictObject({
  saveId: IDSchema,
  title: z.string().min(1).max(240),
  currentSerial: CounterSchema,
  currentGeneration: z.number().int().min(0).max(2),
  corruptedGenerations: z.array(z.number().int().min(0).max(2)).max(3),
  validGenerations: z.array(SeasonCheckpointGenerationOptionSchema).max(3),
});

export const SeasonPortableManifestV3Schema = SeasonPortableManifestSchema.extend({
  archiveVersion: z.literal("LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES"),
  saveSchema: z.enum(["LC_SEASON_SAVE_V1", "LC_SEASON_SAVE_V2_PRESENTATION"]),
  worldCopySha256: HashSchema.optional(),
  matchEventArchiveCount: CounterSchema.min(1).max(56),
});

export type T20SeasonStateCore = z.infer<typeof T20SeasonStateCoreSchema>;
export type T20SeasonState = z.infer<typeof T20SeasonStateSchema>;
export type T20SeasonStateV2Core = z.infer<typeof T20SeasonStateV2CoreSchema>;
export type T20SeasonStateV2 = z.infer<typeof T20SeasonStateV2Schema>;
/** Either frozen-world season state version. */
export type AnyT20SeasonStateCore = z.infer<typeof AnyT20SeasonStateCoreSchema>;
export type AnyT20SeasonState = z.infer<typeof AnyT20SeasonStateSchema>;
export type SeasonSaveSummary = z.infer<typeof SeasonSaveSummarySchema>;
export type SeasonDurableCommand = z.infer<typeof SeasonDurableCommandSchema>;
export type SeasonArchiveCore = z.infer<typeof SeasonArchiveCoreSchema>;
export type SeasonArchive = z.infer<typeof SeasonArchiveSchema>;
export type SeasonRecoveryDiagnostic = z.infer<typeof SeasonRecoveryDiagnosticSchema>;
export type SeasonPortableManifest = z.infer<typeof SeasonPortableManifestSchema>;
export type SeasonPortableManifestV2 = z.infer<typeof SeasonPortableManifestV2Schema>;
export type SeasonPortableManifestV3 = z.infer<typeof SeasonPortableManifestV3Schema>;
export type CompletedCareerMatchEventArchiveCore = z.infer<typeof CompletedCareerMatchEventArchiveCoreSchema>;
export type CompletedCareerMatchEventArchive = z.infer<typeof CompletedCareerMatchEventArchiveSchema>;
export type SeasonCheckpointGenerationOption = z.infer<typeof SeasonCheckpointGenerationOptionSchema>;
export type SeasonCheckpointInspection = z.infer<typeof SeasonCheckpointInspectionSchema>;
