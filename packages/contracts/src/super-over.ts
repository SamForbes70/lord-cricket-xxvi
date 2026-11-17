import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

/**
 * Stage 14: super overs for tied T20 and one-day exhibitions (owner decision, 17 November 2026: ICC standard, exhibitions only).
 *
 * This is a new opt-in ruleset, `LC_T20_SUPER_OVER_01`. The tied match itself is unchanged and stays a tie under
 * `LC_T20_MATCH_V1`; the super overs decide a winner on top of it. Every super-over ball is produced by the frozen
 * delivery generator and scoring kernel. Attempt ordinals continue after the match's last delivery, so no match random
 * draw is reused.
 *
 * ICC standard as built: each side bats one over with up to three batters, so an innings ends at 6 legal balls,
 * 2 wickets or the target. The side that batted second in the match bats first in the first super over; afterwards the
 * side that batted second in the previous super over bats first. A batter dismissed in a super over, or a bowler who
 * bowled one, cannot take part in a later super over. Super overs repeat until there is a winner, or until a side can
 * no longer name two eligible batters or one eligible bowler, when the match stays tied.
 */
export const T20_SUPER_OVER_RULES_ID = "LC_T20_SUPER_OVER_01" as const;
export const T20_SUPER_OVER_RECORD_SCHEMA_ID = "LC_T20_SUPER_OVER_RECORD_V1" as const;
/** The same rules for tied one-day exhibitions, under their own ruleset and record identifiers. */
export const ODI_SUPER_OVER_RULES_ID = "LC_ODI_SUPER_OVER_01" as const;
export const ODI_SUPER_OVER_RECORD_SCHEMA_ID = "LC_ODI_SUPER_OVER_RECORD_V1" as const;

export const SuperOverCommandSchema = z.discriminatedUnion("kind", [
  /** The batting side names its batters in order: the first two open, the third comes in after a wicket. */
  z.strictObject({ kind: z.literal("SET_SUPER_OVER_BATTERS"), teamId: IDSchema, playerIds: z.array(IDSchema).min(2).max(3) }),
  z.strictObject({ kind: z.literal("SET_SUPER_OVER_BOWLER"), teamId: IDSchema, playerId: IDSchema }),
  /** Batting intent for a batter at the crease (0 defensive to 4 all-out attack). */
  z.strictObject({ kind: z.literal("SET_SUPER_OVER_AGGRESSION"), playerId: IDSchema, aggression: CounterSchema.max(4) }),
  z.strictObject({ kind: z.literal("BOWL_SUPER_OVER_BALL") }),
]);

/** The durable record of a super-over sequence: the commands, replayed against the completed tied match. */
export const T20SuperOverRecordSchema = z.strictObject({
  schemaId: z.literal(T20_SUPER_OVER_RECORD_SCHEMA_ID),
  rulesId: z.literal(T20_SUPER_OVER_RULES_ID),
  gameId: IDSchema,
  /** The tied match's final event hash: the record only replays against that exact match. */
  baseLastEventHash: HashSchema,
  commands: z.array(SuperOverCommandSchema).max(2000),
  /** Hash of the canonical super-over state after replaying `commands`. */
  stateSha256: HashSchema,
});

export const ODISuperOverRecordSchema = z.strictObject({
  schemaId: z.literal(ODI_SUPER_OVER_RECORD_SCHEMA_ID),
  rulesId: z.literal(ODI_SUPER_OVER_RULES_ID),
  gameId: IDSchema,
  baseLastEventHash: HashSchema,
  commands: z.array(SuperOverCommandSchema).max(2000),
  stateSha256: HashSchema,
});

/** Either format's record; the stored row is read with this. */
export const SuperOverRecordSchema = z.discriminatedUnion("schemaId", [T20SuperOverRecordSchema, ODISuperOverRecordSchema]);

export const SuperOverInningsSummarySchema = z.strictObject({
  battingTeamId: IDSchema,
  runs: CounterSchema,
  wickets: CounterSchema.max(2),
  legalBalls: CounterSchema.max(6),
});

export const SuperOverRoundSummarySchema = z.strictObject({
  roundNumber: PositiveCounterSchema,
  innings: z.array(SuperOverInningsSummarySchema).max(2),
});

export type SuperOverCommand = z.infer<typeof SuperOverCommandSchema>;
export type T20SuperOverRecord = z.infer<typeof T20SuperOverRecordSchema>;
export type ODISuperOverRecord = z.infer<typeof ODISuperOverRecordSchema>;
export type SuperOverRecord = z.infer<typeof SuperOverRecordSchema>;
export type SuperOverInningsSummary = z.infer<typeof SuperOverInningsSummarySchema>;
export type SuperOverRoundSummary = z.infer<typeof SuperOverRoundSummarySchema>;
