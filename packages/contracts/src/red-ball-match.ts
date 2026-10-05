import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, MatchResultSchema, BattingPlanSchema, BowlingPlanSchema } from "./core.js";
export const RED5_MATCH_VERSION = "LC_RED5_MATCH_V1" as const;
export const RED5_EVENT_CHAIN_VERSION = "LC_RED5_EVENT_CHAIN_V1" as const;
export const RED5_CONDITIONS_VERSION = "LC_RED5_CONDITIONS_V1" as const;
export const Red5ClockSchema = z.strictObject({
  day: z.number().int().min(1).max(5),
  localSeconds: z.number().int().min(0).max(24*3600),
  phase: z.enum(["PLAY","LUNCH","TEA","INNINGS_INTERVAL","STUMPS","RAIN","COMPLETE"]),
  dayLegalBalls: CounterSchema,
  finalHourActive: z.boolean(),
  finalHourBallsRemaining: CounterSchema,
  overMustFinish: z.boolean(),
  delaySecondsToday: CounterSchema,
});
export const Red5MatchExecutionManifestSchema = z.strictObject({
  engine:z.literal(RED5_MATCH_VERSION), eventChain:z.literal(RED5_EVENT_CHAIN_VERSION),
  conditionPolicy:z.literal(RED5_CONDITIONS_VERSION), conditionPolicyHash:HashSchema,
  setupHash:HashSchema, worldHash:HashSchema, rulesHash:HashSchema, modelHash:HashSchema, stagePackHash:HashSchema,
  randomVersion:z.literal("SHA256_COUNTER_V1"), scoringVersion:z.literal("LC_SCORING_V1"), probabilityVersion:z.literal("LC_INTEGER_PROBABILITY_V1"),
});
const base=<K extends string,P extends z.ZodType>(kind:K,payload:P)=>z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal(kind),payload});
export const Red5CommandSchema=z.discriminatedUnion("kind",[
  base("CONFIRM_TEAMS",z.strictObject({})),
  base("CALL_TOSS",z.strictObject({teamId:IDSchema,call:z.enum(["HEADS","TAILS"])})),
  base("CHOOSE_INNINGS",z.strictObject({teamId:IDSchema,choice:z.enum(["BAT","BOWL"])})),
  base("SET_BATTER",z.strictObject({teamId:IDSchema,playerId:IDSchema})),
  base("SET_BOWLER",z.strictObject({teamId:IDSchema,bowlerId:IDSchema})),
  base("SET_FIELD",z.strictObject({teamId:IDSchema,fieldSlots:z.array(z.strictObject({slotId:IDSchema,playerId:IDSchema})).length(9)})),
  base("SET_BATTING_PLAN",BattingPlanSchema), base("SET_BOWLING_PLAN",BowlingPlanSchema),
  base("ADVANCE",z.strictObject({scope:z.enum(["DELIVERY","OVER"])})),
  base("DECLARE",z.strictObject({teamId:IDSchema})),
  base("CHOOSE_FOLLOW_ON",z.strictObject({teamId:IDSchema,enforce:z.boolean()})),
  base("TAKE_NEW_BALL",z.strictObject({teamId:IDSchema})),
  base("ADD_RAIN_DELAY",z.strictObject({seconds:z.number().int().min(60).max(6*3600)})),
]);
export const Red5MatchEventSchema=z.strictObject({version:z.literal(RED5_EVENT_CHAIN_VERSION),sequence:CounterSchema.min(1),commandId:IDSchema,type:IDSchema,payload:z.json(),previousHash:HashSchema,stateHash:HashSchema,eventHash:HashSchema});
export const Red5CommandReceiptSchema=z.strictObject({commandId:IDSchema,committedRevision:CounterSchema.min(1),fromSequence:CounterSchema.min(1),toSequence:CounterSchema.min(1),lastEventHash:HashSchema});
export const Red5EventChainManifestSchema=z.strictObject({version:z.literal(RED5_EVENT_CHAIN_VERSION),genesisHash:HashSchema,finalEventHash:HashSchema,finalStateHash:HashSchema,eventCount:CounterSchema,executionManifestHash:HashSchema});
const innings=z.strictObject({battingTeamId:IDSchema,bowlingTeamId:IDSchema,runs:CounterSchema,wickets:CounterSchema,legalBalls:CounterSchema,overs:z.string(),declared:z.boolean(),batting:z.record(IDSchema,z.strictObject({runs:CounterSchema,ballsFaced:CounterSchema,fours:CounterSchema,sixes:CounterSchema,dismissed:z.boolean()})),bowling:z.record(IDSchema,z.strictObject({runsConceded:CounterSchema,legalBalls:CounterSchema,wickets:CounterSchema,maidens:CounterSchema}))});
export const Red5ScorecardSchema=z.strictObject({matchId:IDSchema,innings:z.array(innings).max(4),result:MatchResultSchema,clock:Red5ClockSchema,followOnEnforced:z.boolean()});
export type Red5Command=z.infer<typeof Red5CommandSchema>; export type Red5MatchEvent=z.infer<typeof Red5MatchEventSchema>; export type Red5CommandReceipt=z.infer<typeof Red5CommandReceiptSchema>; export type Red5Scorecard=z.infer<typeof Red5ScorecardSchema>; export type Red5Clock=z.infer<typeof Red5ClockSchema>;
