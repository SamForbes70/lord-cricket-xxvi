import { z } from "zod";
import {
  IDSchema,
  CounterSchema,
  PositiveCounterSchema,
  HashSchema,
  PlayerSchema,
  BattingPlanSchema,
  BowlingPlanSchema,
  FieldSlotSchema,
  DelegationSchema,
  TeamTacticsSchema,
  ConditionsSchema,
  ClockStateSchema,
  MatchResultSchema,
  DeliveryRecordedSchema,
  InningsStateSchema,
} from "./core.js";
const base = {
  commandId: IDSchema,
  aggregateId: IDSchema,
  expectedRevision: CounterSchema,
  actorId: z
    .string()
    .regex(/^(?:(?:USER|AI):[A-Za-z0-9][A-Za-z0-9_.:-]*|SYSTEM)$/),
};
const command = <K extends string, S extends z.ZodRawShape>(
  kind: K,
  shape: S,
) =>
  z.strictObject({
    ...base,
    kind: z.literal(kind),
    payload: z.strictObject(shape),
  });
export const CommandSchema = z.discriminatedUnion("kind", [
  command("SELECT_XI", {
    teamId: IDSchema,
    playerIds: z.array(IDSchema).length(11),
    captainId: IDSchema,
    keeperId: IDSchema,
  }),
  command("CONFIRM_TEAMS", {}),
  command("CALL_TOSS", { teamId: IDSchema, call: z.enum(["HEADS", "TAILS"]) }),
  command("CHOOSE_INNINGS", {
    teamId: IDSchema,
    choice: z.enum(["BAT", "BOWL"]),
  }),
  command("SET_BATTER", { teamId: IDSchema, playerId: IDSchema }),
  command("SET_BOWLER", { teamId: IDSchema, bowlerId: IDSchema }),
  z.strictObject({
    ...base,
    kind: z.literal("SET_BATTING_PLAN"),
    payload: BattingPlanSchema,
  }),
  z.strictObject({
    ...base,
    kind: z.literal("SET_BOWLING_PLAN"),
    payload: BowlingPlanSchema,
  }),
  command("SET_FIELD", {
    teamId: IDSchema,
    fieldSlots: z.array(FieldSlotSchema).length(9),
  }),
  command("SET_DELEGATION", { teamId: IDSchema, delegation: DelegationSchema }),
  command("ADVANCE", {
    scope: z.enum(["DELIVERY", "OVER", "NEXT_DECISION", "INNINGS", "MATCH"]),
  }),
  command("DECLARE", { teamId: IDSchema }),
  command("CHOOSE_FOLLOW_ON", { teamId: IDSchema, enforce: z.boolean() }),
  command("TAKE_NEW_BALL", { teamId: IDSchema }),
  command("RESUME_AFTER_DELAY", {}),
  command("FINISH_MATCH", {}),
]);
const event = <K extends string, S extends z.ZodRawShape>(type: K, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });
export const AdministrativeEventSchema = z.discriminatedUnion("type", [
  event("TEAMS_CONFIRMED", {
    teams: z
      .array(
        z.strictObject({
          teamId: IDSchema,
          players: z.array(PlayerSchema).length(11),
          captainId: IDSchema,
          keeperId: IDSchema,
        }),
      )
      .length(2),
  }),
  event("TOSS_RESOLVED", {
    callingTeamId: IDSchema,
    call: z.enum(["HEADS", "TAILS"]),
    outcome: z.enum(["HEADS", "TAILS"]),
    winnerTeamId: IDSchema,
  }),
  event("INNINGS_STARTED", { innings: InningsStateSchema }),
  event("BATTER_SELECTED", {
    inningsIndex: CounterSchema,
    teamId: IDSchema,
    playerId: IDSchema,
    end: z.enum(["NORTH", "SOUTH"]),
  }),
  event("BOWLER_SELECTED", {
    inningsIndex: CounterSchema,
    teamId: IDSchema,
    bowlerId: IDSchema,
  }),
  event("TACTICS_CHANGED", { teamId: IDSchema, tactics: TeamTacticsSchema }),
  event("OVER_COMPLETED", {
    inningsIndex: CounterSchema,
    bowlerId: IDSchema,
    overIndex: CounterSchema,
  }),
  event("INNINGS_COMPLETED", {
    inningsIndex: CounterSchema,
    reason: z.enum([
      "ALL_OUT",
      "ALLOCATION",
      "TARGET",
      "DECLARATION",
      "TIME",
      "ABANDONMENT",
    ]),
  }),
  event("INTERVAL_STARTED", {
    kind: z.enum(["LUNCH", "TEA", "STUMPS", "INNINGS"]),
    clock: ClockStateSchema,
  }),
  event("INTERVAL_ENDED", { clock: ClockStateSchema }),
  event("WEATHER_CHANGED", {
    conditions: ConditionsSchema,
    clock: ClockStateSchema,
  }),
  event("RULES_ADJUSTED", {
    calculationSequence: PositiveCounterSchema,
    providerId: IDSchema,
    providerVersion: IDSchema,
    auditHash: HashSchema,
    targetToWin: PositiveCounterSchema.nullable(),
    allocations: z.array(PositiveCounterSchema),
    resultEligible: z.boolean(),
  }),
  event("FOLLOW_ON_CHOSEN", {
    teamId: IDSchema,
    enforced: z.boolean(),
    inningsOrder: z.array(IDSchema).length(4),
  }),
  event("BALL_REPLACED", {
    inningsIndex: CounterSchema,
    ballId: IDSchema,
    ballAgeLegalBalls: z.literal(0),
  }),
  event("MATCH_COMPLETED", { result: MatchResultSchema }),
]);
export const EventPayloadSchema = z.union([
  DeliveryRecordedSchema,
  AdministrativeEventSchema,
]);
export const EventEnvelopeSchema = z.strictObject({
  gameId: IDSchema,
  matchId: IDSchema,
  sequence: PositiveCounterSchema,
  commandId: IDSchema,
  previousHash: HashSchema,
  stateHash: HashSchema,
  payload: EventPayloadSchema,
});
export const CommandReceiptSchema = z.strictObject({
  commandId: IDSchema,
  committedRevision: CounterSchema,
  eventRange: z
    .strictObject({ first: PositiveCounterSchema, last: PositiveCounterSchema })
    .nullable(),
});
export const ErrorCodeSchema = z.enum([
  "STALE_REVISION",
  "ILLEGAL_ACTION",
  "INVALID_DATA",
  "UNSUPPORTED_VERSION",
  "PERSISTENCE_FAILED",
  "INTERNAL_INVARIANT",
]);
export const WorkerRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("COMMAND"), command: CommandSchema }),
  z.strictObject({ type: z.literal("CANCEL_BATCH"), commandId: IDSchema }),
]);
export const WorkerResponseSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ACK"), receipt: CommandReceiptSchema }),
  z.strictObject({
    type: z.literal("STATE_DELTA"),
    fromRevision: CounterSchema,
    toRevision: CounterSchema,
    events: z.array(EventEnvelopeSchema),
  }),
  z.strictObject({
    type: z.literal("ERROR"),
    commandId: IDSchema.nullable(),
    code: ErrorCodeSchema,
    message: z.string().min(1).max(1000),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type AdministrativeEvent = z.infer<typeof AdministrativeEventSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;
export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;
