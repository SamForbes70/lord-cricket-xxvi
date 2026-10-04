import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, MatchResultSchema, BattingPlanSchema, BowlingPlanSchema } from "./core.js";
/** Pass 07B additive protocols: older 91 schema names and identifiers are unchanged. */
export const ODI_MATCH_VERSION = "LC_ODI_MATCH_V1" as const;
export const ODI_EVENT_CHAIN_VERSION = "LC_ODI_EVENT_CHAIN_V1" as const;
export const ODI_CONDITIONS_VERSION = "LC_ODI_CONDITIONS_V1" as const;
export const ODIMatchExecutionManifestSchema = z.strictObject({
  engine: z.literal(ODI_MATCH_VERSION), eventChain: z.literal(ODI_EVENT_CHAIN_VERSION),
  conditionPolicy: z.literal(ODI_CONDITIONS_VERSION), conditionPolicyHash: HashSchema,
  setupHash: HashSchema, worldHash: HashSchema, rulesHash: HashSchema,
  modelHash: HashSchema, stagePackHash: HashSchema, randomVersion: z.literal("SHA256_COUNTER_V1"),
  scoringVersion: z.literal("LC_SCORING_V1"), probabilityVersion: z.literal("LC_INTEGER_PROBABILITY_V1"),
});
export const ODICommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("CONFIRM_TEAMS"),payload:z.strictObject({})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("CALL_TOSS"),payload:z.strictObject({teamId:IDSchema,call:z.enum(["HEADS","TAILS"])})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("CHOOSE_INNINGS"),payload:z.strictObject({teamId:IDSchema,choice:z.enum(["BAT","BOWL"])})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("SET_BATTER"),payload:z.strictObject({teamId:IDSchema,playerId:IDSchema})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("SET_BOWLER"),payload:z.strictObject({teamId:IDSchema,bowlerId:IDSchema})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("SET_FIELD"),payload:z.strictObject({teamId:IDSchema,fieldSlots:z.array(z.strictObject({slotId:IDSchema,playerId:IDSchema})).length(9)})}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("SET_BATTING_PLAN"),payload:BattingPlanSchema}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("SET_BOWLING_PLAN"),payload:BowlingPlanSchema}),
  z.strictObject({commandId:IDSchema,expectedRevision:CounterSchema,actorId:IDSchema,kind:z.literal("ADVANCE"),payload:z.strictObject({scope:z.enum(["DELIVERY","OVER"])})}),
]);
export const ODIMatchEventSchema = z.strictObject({
  version:z.literal(ODI_EVENT_CHAIN_VERSION),sequence:CounterSchema.min(1),commandId:IDSchema,
  type:IDSchema,payload:z.json(),previousHash:HashSchema,stateHash:HashSchema,eventHash:HashSchema,
});
export const ODICommandReceiptSchema = z.strictObject({
  commandId:IDSchema,committedRevision:CounterSchema.min(1),fromSequence:CounterSchema.min(1),toSequence:CounterSchema.min(1),lastEventHash:HashSchema,
});
export const ODIEventChainManifestSchema = z.strictObject({
  version:z.literal(ODI_EVENT_CHAIN_VERSION),genesisHash:HashSchema,finalEventHash:HashSchema,
  finalStateHash:HashSchema,eventCount:CounterSchema,executionManifestHash:HashSchema,
});
export const ODIScorecardSchema=z.strictObject({
  matchId:IDSchema,innings:z.array(z.strictObject({battingTeamId:IDSchema,bowlingTeamId:IDSchema,runs:CounterSchema,wickets:CounterSchema,legalBalls:CounterSchema,overs:z.string(),extras:z.strictObject({wides:CounterSchema,noBalls:CounterSchema,byes:CounterSchema,legByes:CounterSchema,penalties:CounterSchema}),batting:z.record(IDSchema,z.strictObject({runs:CounterSchema,ballsFaced:CounterSchema,fours:CounterSchema,sixes:CounterSchema,dismissed:z.boolean()})),bowling:z.record(IDSchema,z.strictObject({runsConceded:CounterSchema,legalBalls:CounterSchema,wickets:CounterSchema,maidens:CounterSchema})),fallOfWickets:z.array(z.strictObject({playerId:IDSchema,runs:CounterSchema,legalBalls:CounterSchema,sequence:CounterSchema})),targetToWin:CounterSchema.nullable()})).length(2),result:MatchResultSchema,
});
export type ODICommand=z.infer<typeof ODICommandSchema>;
export type ODIMatchEvent=z.infer<typeof ODIMatchEventSchema>;
export type ODICommandReceipt=z.infer<typeof ODICommandReceiptSchema>;
export type ODIMatchExecutionManifest=z.infer<typeof ODIMatchExecutionManifestSchema>;
export type ODIScorecard=z.infer<typeof ODIScorecardSchema>;
export const ODIReplayCaseSchema=z.strictObject({
  caseId:IDSchema,seed:z.string().min(1).max(256),teamIds:z.tuple([IDSchema,IDSchema]),groundId:IDSchema,
  modelId:z.literal("synthetic-alpha-01"),rulesId:z.literal("LC_ODI_01"),
  stagePackId:z.literal("synthetic-alpha-01-delivery-v1"),
  fixtureCaptainPolicyId:z.literal("LC_FIXTURE_CAPTAIN_V1"),
  expectedFinalEventHash:HashSchema.nullable(),expectedScorecardSha256:HashSchema.nullable(),
  oracleStatus:z.enum(["NOT_AUTHORED_UNTIL_PASS_07B","GENERATED_FROM_PRODUCTION_NOT_INDEPENDENT"]),
});
export type ODIReplayCase=z.infer<typeof ODIReplayCaseSchema>;
