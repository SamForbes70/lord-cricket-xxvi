import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

/**
 * Stage 14: rain-affected T20 and one-day exhibitions (owner decisions of 17 and 18 November 2026: seeded rain, opt-in,
 * exhibitions only, kept out of tournament tables; a separate engine that wraps the frozen one).
 *
 * New opt-in rule sets `LC_T20_RAIN_01` and `LC_ODI_RAIN_01`. Every ball goes through the frozen delivery generator,
 * scoring kernel and innings ledger; the rain engine only decides when a shortened innings ends, how many overs each
 * bowler may bowl, the revised target (fictional resource table `LC_RESOURCE_TABLE_01`) and the result. The frozen rule
 * sets `LC_T20_01` and `LC_ODI_01`, their engines, saves and vectors are unchanged.
 *
 * The weather is seeded: the match seed fixes when rain stops play, how many overs are lost, and whether play resumes.
 */
export const T20_RAIN_RULES_ID = "LC_T20_RAIN_01" as const;
export const ODI_RAIN_RULES_ID = "LC_ODI_RAIN_01" as const;
export const RAIN_MATCH_RECORD_SCHEMA_ID = "LC_RAIN_MATCH_RECORD_V1" as const;

export const RainCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CALL_TOSS"), teamId: IDSchema, call: z.enum(["HEADS", "TAILS"]) }),
  z.strictObject({ kind: z.literal("CHOOSE_INNINGS"), teamId: IDSchema, choice: z.enum(["BAT", "BOWL"]) }),
  z.strictObject({ kind: z.literal("SET_BATTER"), teamId: IDSchema, playerId: IDSchema }),
  z.strictObject({ kind: z.literal("SET_BOWLER"), teamId: IDSchema, playerId: IDSchema }),
  /** Batting intent for a batter at the crease (0 defensive to 4 all-out attack). */
  z.strictObject({ kind: z.literal("SET_AGGRESSION"), playerId: IDSchema, aggression: CounterSchema.max(4) }),
  /** Bowl one ball, or to the end of the over (stopping early if a decision is needed). */
  z.strictObject({ kind: z.literal("BOWL"), scope: z.enum(["BALL", "OVER"]) }),
]);

/** One planned stoppage: at the end of an over, in one innings. Drawn from the match seed before play starts. */
export const RainStoppagePlanSchema = z.strictObject({
  inningsIndex: z.union([z.literal(0), z.literal(1)]),
  /** Legal balls bowled in the innings when rain arrives (a whole number of overs). */
  atLegalBall: PositiveCounterSchema,
  /** Overs of play lost in total (shared between the innings when the stoppage is in the first innings). */
  oversLost: PositiveCounterSchema,
  /** No further play: only possible in the second innings. */
  terminal: z.boolean(),
});

export const RainPlanSchema = z.strictObject({ stoppages: z.array(RainStoppagePlanSchema).min(1).max(2) });

/** What actually happened at a stoppage (a planned stoppage is skipped if its innings ended first). */
export const RainStoppageAppliedSchema = z.strictObject({
  inningsIndex: z.union([z.literal(0), z.literal(1)]),
  legalBalls: CounterSchema,
  wickets: CounterSchema.max(10),
  runs: CounterSchema,
  /** Balls this innings lost. */
  ballsLost: CounterSchema,
  /** The innings allocations after the stoppage. */
  allocations: z.tuple([CounterSchema, CounterSchema]),
  terminal: z.boolean(),
  /** The second innings target after the stoppage (null while the first innings is in progress). */
  targetAfter: PositiveCounterSchema.nullable(),
});

export const RainResultSchema = z.strictObject({
  kind: z.enum(["WIN", "TIE", "NO_RESULT"]),
  winnerTeamId: IDSchema.nullable(),
  marginType: z.enum(["RUNS", "WICKETS"]).nullable(),
  margin: CounterSchema.nullable(),
  /** RESOURCE_TABLE when a stoppage changed the target or decided the match. */
  method: z.enum(["STANDARD", "RESOURCE_TABLE"]),
});

/** The durable record of a rain-affected exhibition: its setup choices and commands, replayed by the engine. */
export const RainMatchRecordSchema = z.strictObject({
  schemaId: z.literal(RAIN_MATCH_RECORD_SCHEMA_ID),
  rulesId: z.enum([T20_RAIN_RULES_ID, ODI_RAIN_RULES_ID]),
  gameId: IDSchema,
  matchId: IDSchema,
  seed: z.string().min(1).max(256),
  groundId: IDSchema,
  selectedTeams: z
    .array(z.strictObject({ teamId: IDSchema, playerIds: z.array(IDSchema).length(11), captainId: IDSchema, keeperId: IDSchema }))
    .length(2),
  commands: z.array(RainCommandSchema).max(4000),
  /** Hash of the canonical engine state after replaying `commands`. */
  stateSha256: HashSchema,
});

export type RainCommand = z.infer<typeof RainCommandSchema>;
export type RainStoppagePlan = z.infer<typeof RainStoppagePlanSchema>;
export type RainPlan = z.infer<typeof RainPlanSchema>;
export type RainStoppageApplied = z.infer<typeof RainStoppageAppliedSchema>;
export type RainResult = z.infer<typeof RainResultSchema>;
export type RainMatchRecord = z.infer<typeof RainMatchRecordSchema>;
