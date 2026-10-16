import {describe,expect,test} from "vitest";
import {readFileSync} from "node:fs";
import {ScoringContextSchema} from "@lcxxvi/contracts";
import {scoreDelivery, reduceScoringBoundary} from "@lcxxvi/domain";
import {parseM7GComponents,validateM7GPack,m7gDraw,adaptM7GToScorer} from "../../packages/simulation/src/m7g-research-scoring.js";
const pack=JSON.parse(readFileSync("tests/fixtures/m7g-joint-candidate.json","utf8"));
const vectors=JSON.parse(readFileSync("tests/fixtures/m7g-cross-language-vectors.json","utf8"));
const fixture=JSON.parse(readFileSync("tests/fixtures/scoring/corpus.json","utf8"));
const context=ScoringContextSchema.parse(fixture.deliveries[0].context);

describe("M7G research scoring attribution, NEVER production enabled",()=>{
 test("entire pack validated with stable cross-language hash and integer masses",()=>{
   const validated=validateM7GPack(pack);
   expect(validated.candidateSha256).toBe(vectors.packHash);
   expect(validated.gameplayIntegrationPermitted).toBe(false);
   for(const v of vectors.vectors){
     expect(m7gDraw(validated,v.regime,v.phase,v.wickets,v.seed,v.ordinal)).toBe(v.expected);
   }
 });
 test("all observed categories have scorer-consistent run attribution",()=>{
   let adapted=0;
   for(const key of pack.categories as string[]){
     const x=parseM7GComponents(key);
     const adaptedEvent=adaptM7GToScorer(context,key);
     const scored=scoreDelivery(context,adaptedEvent.resolution);
     expect(scored.batRuns).toBe(x.batRuns);
     expect(scored.extras.wides).toBe(x.wides);
     expect(scored.extras.noBalls).toBe(x.noBalls);
     expect(scored.extras.byes).toBe(x.byes);
     expect(scored.extras.legByes).toBe(x.legByes);
     expect(scored.dismissal?.kind??"NONE").toBe(x.wicketKind);
     expect(reduceScoringBoundary(context,scored).delta.teamRuns).toBe(x.teamRuns);
     expect(adaptedEvent.syntheticFields).toContain("wicketEnd");
     adapted++;
   }
   expect(adapted).toBe(pack.categories.length);
 });
 test("no-ball free hits suppress non-runout wickets before sampling",()=>{
    const session=validateM7GPack(pack);
    const masked={...context,freeHitPending:true};
    for(const key of session.categories){
      if(!["NONE","RUN_OUT"].includes(parseM7GComponents(key).wicketKind)){
        expect(()=>adaptM7GToScorer(masked,key)).toThrow("M7G_FREE_HIT_MASK");
      }
    }
    for(let ordinal=0;ordinal<200;ordinal++){
      const key=m7gDraw(session,2,"DEATH",8,"mask-vectors",ordinal,true);
      expect(["NONE","RUN_OUT"]).toContain(parseM7GComponents(key).wicketKind);
    }
 });
 test("whole research innings remain score-reconciled through the accepted scorer",()=>{
   const model=validateM7GPack(pack);
   for(let sim=0;sim<8;sim++){
     let c:typeof context={...context,runs:0,wickets:0,legalBalls:0,ballAgeLegalBalls:0,deliveryIndex:0,
       freeHitPending:false,endsBefore:{north:"p1",south:"p2"},strikerId:"p1",nonStrikerId:"p2",strikerEnd:"NORTH" as const};
     let nextId=3,attempts=0,acceptedRuns=0;
     while(c.legalBalls<120&&c.wickets<10&&attempts<250){
       const p=c.legalBalls<36?"POWERPLAY":c.legalBalls<90?"MIDDLE":"DEATH";
       const key=m7gDraw(model,sim%5,p,c.wickets,`m7g-scored-innings-${sim}`,attempts,c.freeHitPending);
       const components=parseM7GComponents(key);
       const {resolution}=adaptM7GToScorer(c,key);
       const e=scoreDelivery(c,resolution);
       const projection=reduceScoringBoundary(c,e);
       acceptedRuns+=components.teamRuns;
       const ends={...e.endsAfter};
       if(e.dismissal && projection.totals.wickets<10){
         if(ends.north===null)ends.north=`p${nextId++}`;
         else if(ends.south===null)ends.south=`p${nextId++}`;
       }
       const strikerEnd=projection.strikerEndAfter;
       c={...c,deliveryIndex:c.deliveryIndex+1,runs:projection.totals.runs,
         wickets:projection.totals.wickets,legalBalls:projection.totals.legalBalls,
         ballAgeLegalBalls:projection.totals.ballAgeLegalBalls,
         freeHitPending:projection.freeHitPending,endsBefore:ends as {north:string;south:string},
         strikerEnd,strikerId:ends[strikerEnd==="NORTH"?"north":"south"]??"p1",
         nonStrikerId:ends[strikerEnd==="NORTH"?"south":"north"]??"p2"};
       attempts++;
     }
     expect(c.legalBalls===120||c.wickets===10).toBe(true);
     expect(c.runs).toBe(acceptedRuns);
   }
 });
 test("tampering and invalid scorer-only resolutions rejected",()=>{
   const tampered=structuredClone(pack);
   tampered.regimeMass["0"]["POWERPLAY/0-2"][pack.categories[0]]++;
   expect(()=>validateM7GPack(tampered)).toThrow();
   expect(()=>parseM7GComponents("WIDE|2|0|0|0|0|0|NONE|NONE")).toThrow();
   expect(()=>parseM7GComponents("NO_BALL|0|0|1|0|0|0|BOWLED|STRIKER")).toThrow();
   expect(()=>parseM7GComponents("LEGAL|4|0|0|0|0|4|CAUGHT|STRIKER")).toThrow();
   expect(()=>adaptM7GToScorer({...context,targetToWin:150},pack.categories[0])).toThrow();
 });
});
