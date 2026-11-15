import { z } from "zod";
import {
  FormatSchema,
  IDSchema,
  PositiveCounterSchema,
} from "./core.js";

export const COMMENTARY_ADAPTER_VERSION = "LC_COMMENTARY_ADAPTER_V1" as const;

export const CommentaryVerbosityModeSchema = z.enum([
  "BRIEF",
  "STANDARD",
  "DETAILED",
  "OFF",
]);

export const CommentaryCategorySchema = z.enum([
  "DELIVERY",
  "OVER",
  "PARTNERSHIP",
  "MILESTONE",
  "DISMISSAL",
  "TACTICAL",
  "CONDITIONS",
  "INNINGS",
  "RESULT",
  "SELECTION",
]);

export const CommentaryFactSourceKindSchema = z.enum([
  "EVENT_FIELD",
  "INNINGS_PROJECTION",
  "BATTER_PROJECTION",
  "BOWLER_PROJECTION",
  "PARTNERSHIP_PROJECTION",
  "CHASE_PROJECTION",
  "MATCH_RESULT",
  "FORMAT_RULE",
]);

export const CommentaryFactSlotSchema = z.strictObject({
  slot: IDSchema,
  value: z.string().min(1).max(160),
  sourceKind: CommentaryFactSourceKindSchema,
  sourceRef: z.string().min(1).max(160),
});

export const CommentaryMilestoneTagSchema = z.enum([
  "BATTER_FIFTY",
  "BATTER_CENTURY",
  "BATTER_150",
  "BATTER_DOUBLE_CENTURY",
  "PARTNERSHIP_FIFTY",
  "PARTNERSHIP_CENTURY",
  "PARTNERSHIP_150",
  "BOWLER_THREE_FOR",
  "BOWLER_FIVE_FOR",
  "MAIDEN_OVER",
  "ALL_OUT",
  "WINNING_DELIVERY",
]);

export const CommentaryEntrySchema = z.strictObject({
  adapterVersion: z.literal(COMMENTARY_ADAPTER_VERSION),
  sequence: PositiveCounterSchema,
  eventType: IDSchema,
  category: CommentaryCategorySchema,
  templateId: IDSchema,
  templateFamily: IDSchema,
  cooldownApplied: z.boolean(),
  presentationDigest: z.string().regex(/^[a-f0-9]{8}$/),
  milestoneTags: z.array(CommentaryMilestoneTagSchema).max(6),
  short: z.string().min(1).max(240),
  text: z.string().min(1).max(640),
  detailed: z.string().min(1).max(960),
  factSlots: z.array(CommentaryFactSlotSchema).min(1).max(24),
});

export const MatchCommentaryFeedSchema = z.strictObject({
  adapterVersion: z.literal(COMMENTARY_ADAPTER_VERSION),
  format: FormatSchema,
  presentationKeyDigest: z.string().regex(/^[a-f0-9]{8}$/),
  repetitionCooldownWindow: PositiveCounterSchema.max(12),
  entries: z.array(CommentaryEntrySchema),
});

export type CommentaryVerbosityMode = z.infer<
  typeof CommentaryVerbosityModeSchema
>;
export type CommentaryCategory = z.infer<typeof CommentaryCategorySchema>;
export type CommentaryFactSourceKind = z.infer<
  typeof CommentaryFactSourceKindSchema
>;
export type CommentaryFactSlot = z.infer<typeof CommentaryFactSlotSchema>;
export type CommentaryMilestoneTag = z.infer<
  typeof CommentaryMilestoneTagSchema
>;
export type CommentaryEntry = z.infer<typeof CommentaryEntrySchema>;
export type MatchCommentaryFeed = z.infer<typeof MatchCommentaryFeedSchema>;
