import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {ScoringContextSchema, type DeliveryResolution} from "@lcxxvi/contracts";
import {M7J_VERSION} from "@lcxxvi/contracts/m7j";
import {adjudicateM7J} from "@lcxxvi/domain/m7j";

const corpus=JSON.parse(readFileSync("tests/fixtures/scoring/corpus.json","utf8"));
const context=ScoringContextSchema.parse(corpus.deliveries[0].context);
const baseDelivery:DeliveryResolution={
 stage:"DELIVERY",legality:"LEGAL",batRuns:0,
 extras:{wides:0,noBalls:0,byes:0,legByes:0,penalties:0},
 completedRuns:0,attemptedRuns:0,boundary:"NONE",dismissal:null,
 endsAfter:context.endsBefore,batContact:false,attemptedStroke:true,
 shotSector:null,trajectory:null,executedLength:null,fieldOutcome:"NONE",elapsedSeconds:25,
};
const evidence={independentlyAdjudicated:true,chronologyConfirmed:true,sourceReference:"cricsheet-check-reviewed"} as const;
const request=(delivery:DeliveryResolution|null,administration:unknown[]=[],c=context)=>({
 contractVersion:M7J_VERSION,context:c,delivery,administration,evidence,
});
const penalty=(beneficiary:"BATTING"|"FIELDING"="BATTING",id="award-1")=>({
 kind:"PENALTY_AWARD",commandId:id,sourceEventId:"match-1-over-2-ball-1",
 deadBallConfirmed:true,beneficiary,amount:5,lawReference:"41.17",umpireSignalConfirmed:true,
});
const retirement=(playerId=context.strikerId,status:"RETIRED_OUT"|"RETIRED_NOT_OUT"="RETIRED_OUT",id="retire-1")=>({
 kind:"BATTER_RETIREMENT",commandId:id,sourceEventId:"match-1-over-2-ball-1",
 deadBallConfirmed:true,playerId,status,umpireNotified:true,finalStatusConfirmed:true,
});

describe("M7J explicit versioned dead-ball administrative research adjudication",()=>{
 it("retirement after a completed dot ball adds one wicket without another delivery or bowler credit",()=>{
   const c={...context,runs:70,wickets:3,legalBalls:30,deliveryIndex:31,ballAgeLegalBalls:30};
   const x=adjudicateM7J(request(baseDelivery,[retirement()],c));
   expect(x.contractVersion).toBe(M7J_VERSION);
   expect(x.baseDelivery?.legality).toBe("LEGAL");
   expect(x.totals).toEqual({battingRuns:70,fieldingPenaltyRuns:0,wickets:4,legalBalls:31,
     deliveryAttempts:32,bowlerRunsConcededDelta:0,bowlerWicketsDelta:0});
   expect(x.replacementRequired).toEqual([context.strikerId]);
   expect(x.adminEvents[0]).toMatchObject({kind:"BATTER_RETIRED",wicketDelta:1,bowlerWicketDelta:0,legalBallsDelta:0});
   expect(x.gameplayIntegrationPermitted).toBe(false);
 });
 it("injury retirement does not count as a dismissal but still requires a replacement",()=>{
   const x=adjudicateM7J(request(null,[retirement(context.nonStrikerId,"RETIRED_NOT_OUT")]));
   expect(x.totals.wickets).toBe(context.wickets);
   expect(x.totals.deliveryAttempts).toBe(context.deliveryIndex);
   expect(x.replacementRequired).toEqual([context.nonStrikerId]);
 });
 it("five penalty runs to batting after legal delivery never debit bowler or consume ball",()=>{
   const c={...context,runs:100,wickets:4,legalBalls:50,deliveryIndex:51,ballAgeLegalBalls:50};
   const x=adjudicateM7J(request(baseDelivery,[penalty()],c));
   expect(x.totals.battingRuns).toBe(105);
   expect(x.totals.legalBalls).toBe(51);
   expect(x.totals.bowlerRunsConcededDelta).toBe(0);
   expect(x.adminEvents[0]).toMatchObject({battingTeamDelta:5,fieldingTeamDelta:0,legalBallsDelta:0});
 });
 it("penalty awarded to fielding side is separate pending team score, not batting extras",()=>{
   const x=adjudicateM7J(request(null,[penalty("FIELDING")]));
   expect(x.totals.battingRuns).toBe(context.runs);
   expect(x.totals.fieldingPenaltyRuns).toBe(5);
   expect(x.adminEvents[0]).toMatchObject({battingTeamDelta:0,fieldingTeamDelta:5});
 });
 it("dead-ball retirement after single legal dismissal of the *other* active batter is representable if separately certified",()=>{
   const dismissed:DeliveryResolution={...baseDelivery,dismissal:{kind:"BOWLED",playerId:context.strikerId,
     wicketEnd:context.strikerEnd,fielderId:null},endsAfter:{...baseDelivery.endsAfter,
     [context.strikerEnd==="NORTH"?"north":"south"]:null}};
   const x=adjudicateM7J(request(dismissed,[retirement(context.nonStrikerId)]));
   expect(x.totals.wickets).toBe(context.wickets+2);
   expect(x.totals.bowlerWicketsDelta).toBe(1);
   expect(x.adminEvents[0]).toMatchObject({wicketDelta:1,bowlerWicketDelta:0});
 });
 it("a retirement cannot dismiss the player already dismissed on the delivery",()=>{
   const dismissed:DeliveryResolution={...baseDelivery,dismissal:{kind:"BOWLED",playerId:context.strikerId,
     wicketEnd:context.strikerEnd,fielderId:null},endsAfter:{...baseDelivery.endsAfter,
     [context.strikerEnd==="NORTH"?"north":"south"]:null}};
   expect(()=>adjudicateM7J(request(dismissed,[retirement()]))).toThrow("ALREADY_DISMISSED");
 });
 it("wide + hit wicket accepted by original scorer without new scoring rules",()=>{
   const wideHit:DeliveryResolution={...baseDelivery,legality:"WIDE",
     extras:{...baseDelivery.extras,wides:1},dismissal:{kind:"HIT_WICKET",playerId:context.strikerId,
     fielderId:null,wicketEnd:context.strikerEnd},endsAfter:{...baseDelivery.endsAfter,
     [context.strikerEnd==="NORTH"?"north":"south"]:null},attemptedStroke:false};
   const x=adjudicateM7J(request(wideHit));
   expect(x.totals.battingRuns).toBe(context.runs+1);
   expect(x.totals.wickets).toBe(context.wickets+1);
   expect(x.totals.legalBalls).toBe(context.legalBalls);
   expect(x.totals.bowlerWicketsDelta).toBe(1);
 });
 it("unadjudicated events and unclear chronology cannot enter versioned path",()=>{
   expect(()=>adjudicateM7J({...request(null,[retirement()]), evidence:{...evidence,chronologyConfirmed:false}})).toThrow("INVALID_CONTRACT");
   expect(()=>adjudicateM7J({...request(null,[penalty()]), evidence:{...evidence,independentlyAdjudicated:false}})).toThrow("INVALID_CONTRACT");
   expect(()=>adjudicateM7J(request(null,[{...retirement(),deadBallConfirmed:false}]))).toThrow("INVALID_CONTRACT");
 });
 it("more than one no-ball extra is not silently reallocated as a bye or penalty",()=>{
   const invalid:DeliveryResolution={...baseDelivery,legality:"NO_BALL",
     extras:{...baseDelivery.extras,noBalls:2}};
   expect(()=>adjudicateM7J(request(invalid))).toThrow("INVALID_EXTRAS");
 });
 it("free-hit catches remain invalid even in the new research boundary",()=>{
   const c={...context,freeHitPending:true};
   const catchEvent:DeliveryResolution={...baseDelivery,batContact:true,trajectory:"AERIAL",
     dismissal:{kind:"CAUGHT",playerId:context.strikerId,fielderId:context.keeperId,
       wicketEnd:context.strikerEnd},fieldOutcome:"CATCH",
     endsAfter:{...baseDelivery.endsAfter,[context.strikerEnd==="NORTH"?"north":"south"]:null}};
   expect(()=>adjudicateM7J(request(catchEvent,[],c))).toThrow("INVALID_DISMISSAL");
 });
 it("duplicate command identity and duplicate retirements are rejected atomically",()=>{
   expect(()=>adjudicateM7J(request(null,[penalty("BATTING","p1"),penalty("BATTING","p1")]))).toThrow("DUPLICATE_COMMAND");
   expect(()=>adjudicateM7J(request(null,[retirement(),retirement(context.strikerId,"RETIRED_OUT","r2")]))).toThrow("DUPLICATE_RETIREMENT");
 });
 it("wickets never exceed ten and finished innings may receive penalties but not retirements",()=>{
   const c={...context,wickets:9};
   expect(()=>adjudicateM7J(request(null,[retirement(context.strikerId),retirement(context.nonStrikerId,"RETIRED_OUT","r2")],c))).toThrow("ALL_OUT");
   const chase={...context,runs:99,targetToWin:100};
   const extra=adjudicateM7J(request(null,[penalty()],chase));
   expect(extra.inningsClosed).toBe(true);
   expect(()=>adjudicateM7J(request(null,[penalty(),retirement(context.strikerId,"RETIRED_OUT","r2")],chase))).toThrow("INNINGS_ALREADY_CLOSED");
 });
});
