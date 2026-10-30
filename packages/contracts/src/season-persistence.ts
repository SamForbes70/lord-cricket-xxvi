import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema } from "./core.js";
import { SeasonScheduleSchema } from "./competition.js";
import { CareerDayStateV2Schema } from "./career.js";
import { T20SeasonMatchCompletionSchema, T20SeasonProjectionStateSchema, SeasonTeamTableRowSchema, SeasonLeaderboardsSchema } from "./season-projections.js";

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

export type T20SeasonStateCore = z.infer<typeof T20SeasonStateCoreSchema>;
export type T20SeasonState = z.infer<typeof T20SeasonStateSchema>;
export type SeasonSaveSummary = z.infer<typeof SeasonSaveSummarySchema>;
export type SeasonDurableCommand = z.infer<typeof SeasonDurableCommandSchema>;
export type SeasonArchiveCore = z.infer<typeof SeasonArchiveCoreSchema>;
export type SeasonArchive = z.infer<typeof SeasonArchiveSchema>;
export type SeasonRecoveryDiagnostic = z.infer<typeof SeasonRecoveryDiagnosticSchema>;
export type SeasonPortableManifest = z.infer<typeof SeasonPortableManifestSchema>;
export type SeasonPortableManifestV2 = z.infer<typeof SeasonPortableManifestV2Schema>;
