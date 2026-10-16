/** A pure, opt-in RESEARCH-only research adjudication boundary for dead-ball
 * administrative actions. Normal deliveries go through the frozen scorer.
 * This result does not mutate a match, archive or official scorer's ledger. */
import {
 M7J_VERSION, M7JAdjudicationRequestSchema, M7JAdjudicationResultSchema,
 type M7JAdjudicationResult,
} from "@lcxxvi/contracts/m7j";
import {scoreDelivery,reduceScoringBoundary,addCounters} from "./scoring-kernel.js";

export class M7JAdjudicationError extends Error {
 constructor(readonly code:string,detail:string){super(`${code}: ${detail}`);this.name="M7JAdjudicationError";}
}
function ensure(test:boolean,code:string,detail:string):void{
 if(!test)throw new M7JAdjudicationError(code,detail);
}
export function adjudicateM7J(input:unknown):M7JAdjudicationResult{
 const p=M7JAdjudicationRequestSchema.safeParse(input);
 if(!p.success)throw new M7JAdjudicationError("INVALID_CONTRACT",p.error.issues[0]?.message??"Invalid request");
 const {context:c,delivery,administration}=p.data;
 ensure(delivery!==null||administration.length>0,"EMPTY_ADJUDICATION","No action");
 // Retirement and five-run penalty are administrative actions after the ball is dead.
 // They do not consume a delivery, award runs to the striker or debit the bowler.
 const base=delivery===null?null:scoreDelivery(c,delivery);
 const projection=base===null?null:reduceScoringBoundary(c,base);
 let runs=projection?.totals.runs??c.runs;
 let wickets=projection?.totals.wickets??c.wickets;
 let fieldingPenaltyRuns=0;
 const legalBalls=projection?.totals.legalBalls??c.legalBalls;
 const closedBeforeAdmin=projection?.inningsComplete??false;
 const seenCommands=new Set<string>();
 const retiredIds=new Set<string>();
 const replacementRequired:string[]=[];
 let battingPenaltyAfterTarget=false;
 const events:M7JAdjudicationResult["adminEvents"]=[];
 for(const action of administration){
  ensure(!seenCommands.has(action.commandId),"DUPLICATE_COMMAND","Duplicate administrative command id");
  seenCommands.add(action.commandId);
  // An innings may have reached its target or become all out on the base ball;
  // five-run penalties may still be awarded at a dead ball by the Laws, but
  // a retired out cannot be appended after innings completion.
  if(action.kind==="PENALTY_AWARD"){
    if(action.beneficiary==="BATTING"){
      runs=addCounters(runs,action.amount);
      battingPenaltyAfterTarget ||=c.targetToWin!==null && runs>=c.targetToWin;
    }else{
      fieldingPenaltyRuns=addCounters(fieldingPenaltyRuns,action.amount);
    }
    events.push({kind:"PENALTY_AWARDED",commandId:action.commandId,sourceEventId:action.sourceEventId,
      battingTeamDelta:action.beneficiary==="BATTING"?5:0,
      fieldingTeamDelta:action.beneficiary==="FIELDING"?5:0,
      legalBallsDelta:0,bowlerConcededDelta:0});
    continue;
  }
  ensure(!closedBeforeAdmin&&!battingPenaltyAfterTarget,"INNINGS_ALREADY_CLOSED","No retirement after result/innings ended");
  ensure(wickets<10,"ALL_OUT","No retirement after all out");
  ensure(!retiredIds.has(action.playerId),"DUPLICATE_RETIREMENT","Player already retired");
  ensure(action.playerId===c.strikerId||action.playerId===c.nonStrikerId,
   "NOT_ACTIVE_BATTER","Administrative retirement requires active batter");
  ensure(base?.dismissal?.playerId!==action.playerId,"ALREADY_DISMISSED","Player was dismissed on delivery");
  ensure(!retiredIds.has(action.playerId),"DUPLICATE_RETIREMENT","Repeated player");
  retiredIds.add(action.playerId);
  const wicketDelta=action.status==="RETIRED_OUT"?1 as const:0 as const;
  wickets=addCounters(wickets,wicketDelta);
  replacementRequired.push(action.playerId);
  events.push({kind:"BATTER_RETIRED",commandId:action.commandId,sourceEventId:action.sourceEventId,
    playerId:action.playerId,retirementStatus:action.status,
    battingTeamDelta:0,wicketDelta,bowlerWicketDelta:0,legalBallsDelta:0});
 }
 ensure(wickets<=10,"TOO_MANY_WICKETS","Wickets exceed 10");
 const inningsClosed=closedBeforeAdmin||wickets===10||
  (c.targetToWin!==null&&runs>=c.targetToWin);
 // Do not claim an explicit two-retirement event occurred in the source merely
 // because both appear on the same JSON delivery row.
 return M7JAdjudicationResultSchema.parse({
  contractVersion:M7J_VERSION,baseDelivery:base,adminEvents:events,
  totals:{battingRuns:runs,fieldingPenaltyRuns,wickets,legalBalls,
    deliveryAttempts:c.deliveryIndex+(base?1:0),
    bowlerRunsConcededDelta:projection?.delta.bowlerRuns??0,
    bowlerWicketsDelta:projection?.delta.bowlerWickets??0},
  replacementRequired,inningsClosed,gameplayIntegrationPermitted:false,
 });
}
