import { z } from "zod";
import {
  FormatSchema,
  IDSchema,
  PositiveCounterSchema,
  HashSchema,
} from "./core.js";

export const AUDIO_PRESENTATION_VERSION = "LC_AUDIO_PRESENTATION_V1" as const;
export const AUDIO_PROVENANCE_VERSION = "LC_AUDIO_PROVENANCE_V1" as const;

export const AudioChannelSchema = z.enum([
  "CROWD",
  "EFFECTS",
  "COMMENTARY",
  "INTERFACE",
]);

export const AudioCueKindSchema = z.enum([
  "BAT_BALL_DOT",
  "BAT_BALL_SINGLE",
  "BOUNDARY_FOUR",
  "BOUNDARY_SIX",
  "WICKET_FALL",
  "MILESTONE_CHIME",
  "OVER_BELL",
  "INNINGS_CHANGE",
  "MATCH_COMPLETE",
  "UI_CLICK",
]);

export const AudioAssetOriginSchema = z.enum([
  "ORIGINAL_PROCEDURAL_SYNTH",
  "ORIGINAL_IN_REPO_PCM",
]);

export const AudioPlaybackDecisionStatusSchema = z.enum([
  "PLAYED",
  "QUEUED_AWAITING_GESTURE",
  "DEDUP_SKIPPED",
  "EXPIRED_FAST_FORWARD",
  "MUTED_OR_ZERO_VOLUME",
  "BACKGROUND_TAB_SUPPRESSED",
  "MISSING_ASSET_FALLBACK",
  "DECODE_FAILED_FALLBACK",
]);

export const AudioVolumePercentSchema = z.number().int().min(0).max(100);

export const AudioPreferencesSchema = z.strictObject({
  version: z.literal(AUDIO_PRESENTATION_VERSION),
  muted: z.boolean(),
  crowdVolume: AudioVolumePercentSchema,
  effectsVolume: AudioVolumePercentSchema,
  commentaryVolume: AudioVolumePercentSchema,
  interfaceVolume: AudioVolumePercentSchema,
  narrationEnabled: z.boolean(),
  captionsEnabled: z.boolean(),
});

export const AudioAssetProvenanceSchema = z.strictObject({
  assetId: IDSchema,
  cueKind: AudioCueKindSchema,
  channel: AudioChannelSchema,
  title: z.string().min(1).max(120),
  author: z.string().min(1).max(120),
  license: z.literal("MIT_ORIGINAL_LORD_CRICKET_XXVI"),
  origin: AudioAssetOriginSchema,
  synthesisProfile: z.string().min(1).max(200),
  durationMs: PositiveCounterSchema.max(10_000),
  sha256: HashSchema,
});

export const AudioProvenanceManifestSchema = z.strictObject({
  manifestVersion: z.literal(AUDIO_PROVENANCE_VERSION),
  attributionNotice: z.string().min(1).max(320),
  networkCallsAllowed: z.literal(false),
  assets: z.array(AudioAssetProvenanceSchema).min(1).max(64),
});

export const AudioCueSchema = z.strictObject({
  cueId: IDSchema,
  sequence: PositiveCounterSchema,
  channel: AudioChannelSchema,
  cueKind: AudioCueKindSchema,
  assetId: IDSchema,
  priority: z.number().int().min(1).max(100),
  caption: z.string().min(1).max(280),
  narrationText: z.string().min(1).max(360).optional(),
  ttlMs: PositiveCounterSchema.max(30_000),
});

export const AudioCueQueueSchema = z.strictObject({
  adapterVersion: z.literal(AUDIO_PRESENTATION_VERSION),
  matchId: IDSchema,
  format: FormatSchema,
  cues: z.array(AudioCueSchema),
});

export type AudioChannel = z.infer<typeof AudioChannelSchema>;
export type AudioCueKind = z.infer<typeof AudioCueKindSchema>;
export type AudioAssetOrigin = z.infer<typeof AudioAssetOriginSchema>;
export type AudioPlaybackDecisionStatus = z.infer<
  typeof AudioPlaybackDecisionStatusSchema
>;
export type AudioPreferences = z.infer<typeof AudioPreferencesSchema>;
export type AudioAssetProvenance = z.infer<typeof AudioAssetProvenanceSchema>;
export type AudioProvenanceManifest = z.infer<
  typeof AudioProvenanceManifestSchema
>;
export type AudioCue = z.infer<typeof AudioCueSchema>;
export type AudioCueQueue = z.infer<typeof AudioCueQueueSchema>;
