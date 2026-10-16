/** M7J exception adjudication contract. Research-only; never a substitute for
 * LC_T20_MATCH_V1 or its immutable event/save schemas. */
import {z} from "zod";
import {CounterSchema, IDSchema, DeliveryRecordedSchema} from "./core.js";
import {ScoringContextSchema, DeliveryResolutionSchema} from "./scoring.js";

export const M7J_VERSION="LC_T20_EXCEPTION_ADJUDICATION_RESEARCH_V2" as const;
export const M7JExceptionalCommandSchema=z.discriminatedUnion("kind",[
 z.strictObject({
   kind:z.literal("PENALTY_AWARD"),commandId:IDSchema,sourceEventId:IDSchema,
   deadBallConfirmed:z.literal(true),beneficiary:z.enum(["BATTING","FIELDING"]),
   amount:z.literal(5),lawReference:z.enum(["18.6","28.3","41.17"]),
   umpireSignalConfirmed:z.literal(true),
 }),
 z.strictObject({
   kind:z.literal("BATTER_RETIREMENT"),commandId:IDSchema,sourceEventId:IDSchema,
   deadBallConfirmed:z.literal(true),playerId:IDSchema,
   status:z.enum(["RETIRED_OUT","RETIRED_NOT_OUT"]),
   umpireNotified:z.literal(true),
   // Retired out is only recorded as such when no continuation occurs.
   finalStatusConfirmed:z.literal(true),
 }),
]);
export const M7JAdjudicationRequestSchema=z.strictObject({
  contractVersion:z.literal(M7J_VERSION),
  context:ScoringContextSchema,
  delivery:DeliveryResolutionSchema.nullable(),
  // Accepted delivery is evaluated by the immutable production scoring kernel.
  administration:z.array(M7JExceptionalCommandSchema).max(3),
  evidence:z.strictObject({
    independentlyAdjudicated:z.literal(true),
    chronologyConfirmed:z.literal(true),
    sourceReference:IDSchema,
  }),
});
export const M7JAdminEventSchema=z.discriminatedUnion("kind",[
 z.strictObject({kind:z.literal("PENALTY_AWARDED"),commandId:IDSchema,sourceEventId:IDSchema,
   battingTeamDelta:CounterSchema,fieldingTeamDelta:CounterSchema,legalBallsDelta:z.literal(0),bowlerConcededDelta:z.literal(0)}),
 z.strictObject({kind:z.literal("BATTER_RETIRED"),commandId:IDSchema,sourceEventId:IDSchema,
   playerId:IDSchema,retirementStatus:z.enum(["RETIRED_OUT","RETIRED_NOT_OUT"]),
   battingTeamDelta:z.literal(0),wicketDelta:z.union([z.literal(0),z.literal(1)]),
   bowlerWicketDelta:z.literal(0),legalBallsDelta:z.literal(0)}),
]);
export const M7JAdjudicationResultSchema=z.strictObject({
  contractVersion:z.literal(M7J_VERSION),
  baseDelivery:DeliveryRecordedSchema.nullable(),
  adminEvents:z.array(M7JAdminEventSchema),
  totals:z.strictObject({
    battingRuns:CounterSchema,fieldingPenaltyRuns:CounterSchema,
    wickets:CounterSchema.max(10),legalBalls:CounterSchema,
    deliveryAttempts:CounterSchema,
    bowlerRunsConcededDelta:CounterSchema,bowlerWicketsDelta:CounterSchema,
  }),
  replacementRequired:z.array(IDSchema),
  inningsClosed:z.boolean(),
  /** Not a production-ready match score or credit ledger. */
  gameplayIntegrationPermitted:z.literal(false),
});
export type M7JExceptionalCommand=z.infer<typeof M7JExceptionalCommandSchema>;
export type M7JAdjudicationRequest=z.infer<typeof M7JAdjudicationRequestSchema>;
export type M7JAdjudicationResult=z.infer<typeof M7JAdjudicationResultSchema>;
