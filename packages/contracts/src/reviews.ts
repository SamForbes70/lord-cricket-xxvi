import { z } from "zod";
import { HashSchema, IDSchema } from "./core.js";
import { RainCommandSchema, RainMatchRecordSchema, ODI_RAIN_RULES_ID, T20_RAIN_RULES_ID } from "./rain-match.js";

/**
 * Stage 14 player reviews (DRS) for T20 and one-day exhibitions (owner decisions B1a to B5a, 18 November 2026; design in
 * docs/DRS_PROPOSAL.md). New opt-in rule sets `LC_T20_DRS_01` and `LC_ODI_DRS_01`, hosted by the same wrapper engine as
 * rain-affected matches (`LC_T20_RAIN_01`, `LC_ODI_RAIN_01`), so the frozen rule sets and engines are unchanged.
 *
 * The frozen generator decides what really happened. An umpire layer, drawn from its own random stage, then gives an
 * on-field decision for close leg-before and caught-behind appeals, with seeded ball-tracking readings for leg-before.
 * Each side has two unsuccessful reviews per innings; an umpire's-call review is not lost.
 */
export const T20_DRS_RULES_ID = "LC_T20_DRS_01" as const;
export const ODI_DRS_RULES_ID = "LC_ODI_DRS_01" as const;
export const EXTRA_RULES_RECORD_SCHEMA_ID = "LC_EXTRA_RULES_RECORD_V1" as const;
export const REVIEWS_PER_INNINGS = 2;

/** Every rain-match command, plus the review decision. */
export const ExtraRulesCommandSchema = z.discriminatedUnion("kind", [
  ...RainCommandSchema.options,
  /** The side entitled to review an on-field decision says whether it does. */
  z.strictObject({ kind: z.literal("REVIEW_DECISION"), teamId: IDSchema, review: z.boolean() }),
]);

/** A reading from ball tracking: in line or hitting, too close to call, or outside or missing. */
export const TrackingReadingSchema = z.enum(["IN", "UMPIRES_CALL", "OUT"]);
export const BallTrackingSchema = z.strictObject({
  pitching: TrackingReadingSchema,
  impact: TrackingReadingSchema,
  wickets: TrackingReadingSchema,
});

/**
 * The durable record of an exhibition played with rain, player reviews or both: the setup choices and commands, replayed
 * by the engine. Rain-only matches keep `LC_RAIN_MATCH_RECORD_V1`.
 */
export const ExtraRulesRecordSchema = z.strictObject({
  schemaId: z.literal(EXTRA_RULES_RECORD_SCHEMA_ID),
  /** The host engine's rule set, which fixes the format. */
  rulesId: z.enum([T20_RAIN_RULES_ID, ODI_RAIN_RULES_ID]),
  /** Whether the seeded weather is on. */
  rain: z.boolean(),
  /** The review rule set, or null when reviews are off. */
  reviewRulesId: z.enum([T20_DRS_RULES_ID, ODI_DRS_RULES_ID]).nullable(),
  gameId: IDSchema,
  matchId: IDSchema,
  seed: z.string().min(1).max(256),
  groundId: IDSchema,
  selectedTeams: z
    .array(z.strictObject({ teamId: IDSchema, playerIds: z.array(IDSchema).length(11), captainId: IDSchema, keeperId: IDSchema }))
    .length(2),
  commands: z.array(ExtraRulesCommandSchema).max(6000),
  stateSha256: HashSchema,
});

export type ExtraRulesCommand = z.infer<typeof ExtraRulesCommandSchema>;
export type TrackingReading = z.infer<typeof TrackingReadingSchema>;
export type BallTracking = z.infer<typeof BallTrackingSchema>;
export type ExtraRulesRecord = z.infer<typeof ExtraRulesRecordSchema>;

/** Either stored record of a rain or reviews exhibition; the stored row is read with this. */
export const ExhibitionRulesRecordSchema = z.discriminatedUnion("schemaId", [RainMatchRecordSchema, ExtraRulesRecordSchema]);
export type ExhibitionRulesRecord = z.infer<typeof ExhibitionRulesRecordSchema>;
