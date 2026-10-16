import {readFileSync} from "node:fs";
import {describe,expect,test} from "vitest";
import {ScoringContextSchema} from "@lcxxvi/contracts";
import {scoreDelivery,reduceScoringBoundary} from "@lcxxvi/domain";
import {adaptM7HChaseToScorer,m7hContext,m7hDraw,m7hPressure,validateM7HPack} from "../../packages/simulation/src/m7h-research-match.js";
import {parseM7GComponents} from "../../packages/simulation/src/m7g-research-scoring.js";
const pack=JSON.parse(readFileSync("tests/fixtures/m7h-chase-candidate.json","utf8"));
const vectors=JSON.parse(readFileSync("tests/fixtures/m7h-cross-language-vectors.json","utf8"));
const ctx=ScoringContextSchema.parse(JSON.parse(readFileSync("tests/fixtures/scoring/corpus.json","utf8")).deliveries[0].context);
const chase={...ctx,inningsIndex:1,targetToWin:200,runs:40,legalBalls:30,ballAgeLegalBalls:30,deliveryIndex:40};
describe("M7H research-only chase with independent accepted scorer",()=>{
  test("full pack normalized/hash verified and never gameplay enabled",()=>{
    const p=validateM7HPack(pack);expect(p.candidateSha256).toBe(vectors.packHash);
    expect(p.gameplayIntegrationPermitted).toBe(false);
    expect(p.empiricallyValidatedGameplay).toBe(false);
  });
  test("Python/TypeScript same draw vector including free hit",()=>{
    const p=validateM7HPack(pack);
    for(const v of vectors.vectors){
      expect(m7hContext(v.legalBalls,v.wickets,v.target,v.runs)).toBe(v.context);
      expect(m7hDraw(p,v.regime,v.legalBalls,v.wickets,v.target,v.runs,v.seed,v.ordinal,v.freeHit)).toBe(v.category);
    }
  });
  test("chase context reacts only to observable required run rate",()=>{
    expect(m7hPressure(50,10,60)).toBe("LOW");
    expect(m7hPressure(100,10,60)).toBe("MEDIUM");
    expect(m7hPressure(180,10,60)).toBe("HIGH");
    expect(()=>m7hPressure(0,0,0)).toThrow();
  });
  test("every fitted second innings category reconciles with original scorer",()=>{
    const p=validateM7HPack(pack);
    for(const key of p.categories){
      const adapted=adaptM7HChaseToScorer(chase,key);
      const scored=scoreDelivery(chase,adapted.resolution);
      const projection=reduceScoringBoundary(chase,scored);
      expect(projection.delta.teamRuns).toBe(parseM7GComponents(key).teamRuns);
      expect(adapted.syntheticFields).toContain("fielderId");
    }
  });
  test("a run to reach target reconciles, while subsequent chase deliveries reject",()=>{
    const c={...chase,runs:199,targetToWin:200};
    const adapted=adaptM7HChaseToScorer(c,"LEGAL|1|0|0|0|0|0|NONE|NONE");
    const res=reduceScoringBoundary(c,scoreDelivery(c,adapted.resolution));
    expect(res.totals.runs).toBe(200);
    expect(()=>adaptM7HChaseToScorer({...c,runs:200},"LEGAL|0|0|0|0|0|0|NONE|NONE")).toThrow();
  });
  test("tampering detected and unsupported masks do not mutate pack",()=>{
    const p=validateM7HPack(pack);
    const old=p.candidateSha256;
    for(let i=0;i<100;i++){
      const key=m7hDraw(p,2,60,4,150,72,"m7h-mask",i,true);
      expect(["NONE","RUN_OUT"]).toContain(parseM7GComponents(key).wicketKind);
    }
    expect(p.candidateSha256).toBe(old);
    const tampered=structuredClone(pack);
    tampered.regimeMass["0"]["POWERPLAY/0-2|LOW"][p.categories[0]!]++;
    expect(()=>validateM7HPack(tampered)).toThrow();
  });
});
