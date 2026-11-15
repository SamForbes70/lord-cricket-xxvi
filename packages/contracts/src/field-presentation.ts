import { z } from "zod";
import {
  CounterSchema,
  FormatSchema,
  HandSchema,
  HashSchema,
  IDSchema,
  NameSchema,
  PositiveCounterSchema,
} from "./core.js";

export const FIELD_PRESENTATION_VERSION = "LC_FIELD_PRESENTATION_V1" as const;

export const HighlightPacingModeSchema = z.enum([
  "EVERY_BALL",
  "KEY_MOMENT",
  "FAST",
]);

export const HighlightMotionModeSchema = z.enum(["AUTO", "REDUCED"]);

export const HighlightMomentKindSchema = z.enum([
  "WICKET",
  "SIX",
  "FOUR",
  "FREE_HIT",
  "EXTRA",
  "RUNS",
  "DOT",
]);

export const HighlightSectorStatusSchema = z.enum([
  "RECORDED_SECTOR",
  "PITCH_CHANNEL_ONLY",
]);

export const FieldLegalityCodeSchema = z.enum([
  "SLOT_COUNT",
  "UNIQUE_PLAYERS",
  "DUPLICATE_POSITION",
  "UNSUPPORTED_POSITION",
  "CIRCLE_RESTRICTION",
  "LEG_SIDE_LIMIT",
  "BEHIND_SQUARE_LEG_LIMIT",
]);

export const FieldLegalityViolationSchema = z.strictObject({
  code: FieldLegalityCodeSchema,
  message: z.string().min(1).max(240),
  affectedSlotIds: z.array(IDSchema).max(9),
});

export const FieldPlacementLegalityReportSchema = z.strictObject({
  isLegal: z.boolean(),
  format: FormatSchema,
  strikerHand: HandSchema,
  phaseLabel: z.string().min(1).max(120),
  outsideCircleCount: CounterSchema.max(9),
  maxOutsideCircle: CounterSchema.max(9),
  legSideCount: CounterSchema.max(9),
  maxLegSide: z.literal(5),
  behindSquareLegCount: CounterSchema.max(9),
  maxBehindSquareLeg: z.literal(2),
  duplicateSlotIds: z.array(IDSchema).max(9),
  violations: z.array(FieldLegalityViolationSchema).max(16),
  summaryText: z.string().min(1).max(320),
});

/** Exact tenths of a 200x200 SVG viewport (0..2000 -> 0.0..200.0). */
export const FieldPointX10Schema = z.strictObject({
  x10: CounterSchema.max(2000),
  y10: CounterSchema.max(2000),
});

export const FieldPositionViewSchema = z.strictObject({
  slotId: IDSchema,
  label: NameSchema,
  sector: CounterSchema.max(7),
  displaySector: CounterSchema.max(7),
  depth: z.enum(["INNER", "MIDDLE", "DEEP"]),
  insideCircle: z.boolean(),
  legSideForStriker: z.boolean(),
  behindSquare: z.boolean(),
  point: FieldPointX10Schema,
  occupiedByPlayerId: IDSchema.nullable(),
  occupiedByName: NameSchema.nullable(),
});

export const DeliveryHighlightCueSchema = z.strictObject({
  sequence: PositiveCounterSchema,
  eventHash: HashSchema,
  inningsIndex: CounterSchema.max(3),
  deliveryIndex: CounterSchema,
  overBallLabel: z.string().min(1).max(24),
  strikerId: IDSchema,
  strikerName: NameSchema,
  strikerHand: HandSchema,
  bowlerId: IDSchema,
  bowlerName: NameSchema,
  momentKind: HighlightMomentKindSchema,
  isKeyMoment: z.boolean(),
  runsScored: CounterSchema,
  batRuns: CounterSchema,
  boundary: z.enum(["NONE", "FOUR", "SIX"]),
  legality: z.enum(["LEGAL", "WIDE", "NO_BALL", "DEAD"]),
  dismissalKind: z
    .enum(["BOWLED", "LBW", "CAUGHT", "RUN_OUT", "STUMPED", "HIT_WICKET"])
    .nullable(),
  dismissedPlayerName: NameSchema.nullable(),
  fieldOutcome: z.enum(["NONE", "STOP", "DROP", "CATCH", "MISS", "RUN_OUT"]),
  executedLength: z
    .enum(["YORKER", "FULL", "GOOD", "SHORT", "FULL_TOSS"])
    .nullable(),
  trajectory: z.enum(["GROUND", "AERIAL", "EDGE"]).nullable(),
  recordedSector: CounterSchema.max(7).nullable(),
  displaySector: CounterSchema.max(7).nullable(),
  sectorStatus: HighlightSectorStatusSchema,
  releasePoint: FieldPointX10Schema,
  pitchBouncePoint: FieldPointX10Schema,
  strikerCreasePoint: FieldPointX10Schema,
  targetPoint: FieldPointX10Schema,
  headline: z.string().min(1).max(160),
  detailText: z.string().min(1).max(280),
  trackingDisclaimer: z.string().min(1).max(220),
});

export const LiveFieldPresentationSchema = z.strictObject({
  version: z.literal(FIELD_PRESENTATION_VERSION),
  format: FormatSchema,
  phase: z.string().min(1).max(64),
  activeInningsIndex: CounterSchema.max(3),
  strikerId: IDSchema.nullable(),
  strikerName: NameSchema.nullable(),
  strikerHand: HandSchema,
  nonStrikerId: IDSchema.nullable(),
  nonStrikerName: NameSchema.nullable(),
  bowlerId: IDSchema.nullable(),
  bowlerName: NameSchema.nullable(),
  keeperId: IDSchema.nullable(),
  keeperName: NameSchema.nullable(),
  keeperPoint: FieldPointX10Schema,
  bowlerReleasePoint: FieldPointX10Schema,
  strikerPoint: FieldPointX10Schema,
  nonStrikerPoint: FieldPointX10Schema,
  boundaryRadiusX10: z.literal(840),
  circleRadiusX10: z.literal(480),
  positions: z.array(FieldPositionViewSchema).min(11).max(12),
  legality: FieldPlacementLegalityReportSchema,
  recentHighlights: z.array(DeliveryHighlightCueSchema).max(24),
  latestHighlight: DeliveryHighlightCueSchema.nullable(),
  orientationNote: z.string().min(1).max(200),
  trackingDisclaimer: z.string().min(1).max(220),
});

export type HighlightPacingMode = z.infer<typeof HighlightPacingModeSchema>;
export type HighlightMotionMode = z.infer<typeof HighlightMotionModeSchema>;
export type HighlightMomentKind = z.infer<typeof HighlightMomentKindSchema>;
export type HighlightSectorStatus = z.infer<typeof HighlightSectorStatusSchema>;
export type FieldLegalityCode = z.infer<typeof FieldLegalityCodeSchema>;
export type FieldLegalityViolation = z.infer<
  typeof FieldLegalityViolationSchema
>;
export type FieldPlacementLegalityReport = z.infer<
  typeof FieldPlacementLegalityReportSchema
>;
export type FieldPointX10 = z.infer<typeof FieldPointX10Schema>;
export type FieldPositionView = z.infer<typeof FieldPositionViewSchema>;
export type DeliveryHighlightCue = z.infer<typeof DeliveryHighlightCueSchema>;
export type LiveFieldPresentation = z.infer<typeof LiveFieldPresentationSchema>;
