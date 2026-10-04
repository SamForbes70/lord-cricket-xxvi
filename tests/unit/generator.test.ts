import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import vectors from "../fixtures/generator/reference-vectors.json" with { type: "json" };
import baseRequest from "../fixtures/generator/base-request.json" with { type: "json" };
import {
  GenerateDeliveryRequestSchema, GeneratedDeliverySchema,
  type GenerateDeliveryRequest, canonicalJson,
} from "@lcxxvi/contracts";
import {
  generateDelivery, generatorRuleHash, expectedGeneratorPhase,
  executedLengthCategories, sectorCategories, conditionedContactCategories,
  coveringFielder, DELIVERY_DRAW_REGISTRY, chooseCategoricalMass,
  createProbabilityService, createRandomService,
} from "@lcxxvi/simulation";
import {
  DELIVERY_STAGE_PACK, DELIVERY_STAGE_PACK_SHA256,
  MODEL_PACK_SHA256,
} from "@lcxxvi/data";
import { scoreDelivery, reduceScoringBoundary } from "@lcxxvi/domain";

const request = GenerateDeliveryRequestSchema.parse(baseRequest);
const service = createProbabilityService();
const ajv = new Ajv2020.default({ strict: true, allErrors: true });
const reqMirror = ajv.compile(JSON.parse(readFileSync('packages/contracts/schemas/GenerateDeliveryRequestSchema.json','utf8')));
const resMirror = ajv.compile(JSON.parse(readFileSync('packages/contracts/schemas/GeneratedDeliverySchema.json','utf8')));
function withSeed(seed:string,patch:Partial<GenerateDeliveryRequest>={}):GenerateDeliveryRequest {
  return {...request, seed, ...patch};
}
function massBounds(categories:readonly {id:string; mass:number; cumulative:number;allowed:boolean;logitBp:number|null;lutIndex:number|null}[]) {
  expect(categories.at(-1)?.cumulative).toBe(4294967296);
  expect(chooseCategoricalMass(categories,0).id).toBe(categories.find(c=>c.mass>0)!.id);
  expect(chooseCategoricalMass(categories,0xffffffff).id).toBe([...categories].reverse().find(c=>c.mass>0)!.id);
}
describe('LC_CONDITIONAL_DELIVERY_V1',()=>{
  it('validates strict input and output in both Zod and strict AJV mirrors',()=>{
    expect(reqMirror(request)).toBe(true);
    const generated=generateDelivery(request);
    expect(GeneratedDeliverySchema.parse(generated)).toEqual(generated);
    expect(resMirror(generated)).toBe(true);
    expect(Object.isFrozen(DELIVERY_STAGE_PACK.runs.GROUND)).toBe(true);
    expect(Object.isFrozen(generated.trace[0]!.categories)).toBe(true);
    expect(Object.isFrozen(generated.resolution)).toBe(true);
    expect(generated.stagePackHash).toBe(DELIVERY_STAGE_PACK_SHA256);
    expect(generated.modelHash).toBe(MODEL_PACK_SHA256);
    expect(generatorRuleHash(request.context.rulesId)).toBe(request.rulesHash);
  });
  it.each(vectors.fixtures)('matches independent SHA addresses and the hand-authored branch path: $seed',({seed,trace})=>{
    const r=withSeed(seed);
    const before=canonicalJson(r);
    const one=generateDelivery(r), two=generateDelivery(r);
    expect(one).toEqual(two);
    expect(canonicalJson(r)).toBe(before);
    expect(one.trace).toHaveLength(trace.length);
    for(const [i,reference] of trace.entries()) {
      const actual=one.trace[i]!;
      expect(actual.stageName).toBe(reference.stageName);
      expect(actual.address).toMatchObject({domain:'MATCH_DELIVERY',
        entityId:`${r.matchId}:${r.context.inningsIndex}`,seed,eventOrdinal:r.attemptOrdinal,
        stageName:reference.stageName,drawIndex:reference.drawIndex});
      expect(actual.draw).toBe(reference.draw);
      expect(actual.selectedCategoryId).toBe(reference.selectedCategoryId);
      if('categories' in reference) expect(actual.categories).toEqual(reference.categories);
      massBounds(actual.categories);
    }
    const addresses=one.trace.map(s=>canonicalJson(s.address));
    expect(new Set(addresses).size).toBe(addresses.length);
    const event=scoreDelivery(r.context,one.resolution);
    const ledger=reduceScoringBoundary(r.context,event);
    expect(ledger.delta.teamRuns).toBe(one.resolution.batRuns+
      Object.values(one.resolution.extras).reduce((sum,n)=>sum+n,0));
  });
  it('supports the precise length, sector and cumulative interval edges',()=>{
    const lengths=executedLengthCategories(request);
    expect(lengths.map(x=>[x.id,x.baseWeight])).toEqual([['FULL',1750],['GOOD',7000],['SHORT',1250]]);
    expect(lengths.reduce((s,c)=>s+c.baseWeight,0)).toBe(10000);
    const yorker=executedLengthCategories({...request,bowling:{...request.bowling,intendedLength:'YORKER'}});
    expect(yorker.map(x=>[x.id,x.baseWeight])).toEqual([['YORKER',7000],['FULL',2500],['FULL_TOSS',500]]);
    const normal=service.normalise({probabilityVersion:request.probabilityVersion,modelId:request.modelId,
      modelHash:request.modelHash,lutVersion:request.lutVersion,lutHash:request.lutHash,categories:yorker});
    massBounds(normal.categories);
    const sectors=sectorCategories(request);
    expect(sectors).toHaveLength(8);
    expect(sectors[3]?.baseWeight).toBe(1750);
    expect(sectors[4]?.baseWeight).toBe(1875);
    expect(coveringFielder(request,0,'EDGE').coverageBp).toBe(10000);
    expect(()=>chooseCategoricalMass(normal.categories,-1)).toThrow("INVALID_UINT32");
    expect(()=>chooseCategoricalMass(normal.categories,4294967296)).toThrow('INVALID_UINT32');
  });
  it('bypasses contact on wides, but continues contact on no-balls',()=>{
    const wide=generateDelivery(withSeed('pass06-independent-28'));
    const nb=generateDelivery(withSeed('pass06-independent-487'));
    expect(wide.resolution.legality).toBe('WIDE');
    expect(wide.trace.some(t=>t.stageName==='contact')).toBe(false);
    expect(nb.resolution.legality).toBe('NO_BALL');
    expect(nb.trace.some(t=>t.stageName==='contact')).toBe(true);
    expect(nb.resolution.extras.noBalls).toBe(1);
  });
  it('masks forbidden dismissals BEFORE categorical sampling on free hits',()=>{
    const freeHit={...request.context,freeHitPending:true};
    const chosen=generateDelivery(withSeed('pass06-independent-35',{context:freeHit}));
    const hit=chosen.trace.find(t=>t.stageName==='contact')?.categories.find(c=>c.id==='HIT_WICKET');
    expect(hit).toMatchObject({allowed:false,mass:0});
    expect(chosen.resolution.dismissal?.kind==='CAUGHT').toBe(false);
    expect(chosen.trace.some(t=>t.stageName==='fielding')).toBe(false);
    const none=conditionedContactCategories(withSeed('pass06-independent-35',{context:freeHit}), 'FULL',true);
    expect(none.find(c=>c.id==='HIT_WICKET')?.allowed).toBe(false);
  });
  it('stops immediately after winning automatic extra without a fictitious second stage',()=>{
    const chase={...request.context,targetToWin:request.context.runs+1};
    const result=generateDelivery(withSeed('pass06-independent-28',{context:chase}));
    expect(result.resolution).toMatchObject({stage:'IMMEDIATE_PENALTY',legality:'WIDE',batRuns:0,
      completedRuns:0,attemptedRuns:0,dismissal:null,shotSector:null,trajectory:null});
    expect(result.trace.map(t=>t.stageName)).toEqual(['length','legality']);
    expect(scoreDelivery(chase,result.resolution).extras.wides).toBe(1);
  });
  it('keeps run-out end occupancy separate from the automatic no-ball run',()=>{
    const result=generateDelivery(withSeed('pass06-independent-224'));
    const d=result.resolution.dismissal;
    expect(d).toMatchObject({kind:'RUN_OUT',playerId:'p1',wicketEnd:'SOUTH'});
    expect(result.resolution).toMatchObject({completedRuns:0,attemptedRuns:1,
      endsAfter:{north:'p2',south:null}});
    expect(result.resolution.boundary).toBe('NONE');
  });
  it('applies winning-target precedence only once credited runs actually reach target',()=>{
    const chase={...request.context,targetToWin:request.context.runs+1};
    for(const seed of ['pass06-independent-0','pass06-independent-224']) {
      const outcome=generateDelivery(withSeed(seed,{context:chase}));
      const scored=scoreDelivery(chase,outcome.resolution);
      const credited=scored.batRuns+Object.values(scored.extras).reduce((sum,n)=>sum+n,0);
      if(chase.runs+credited>=chase.targetToWin)expect(outcome.resolution.dismissal).toBeNull();
    }
  });
  it('masks physical-running totals beyond a chase target before sampling, while retaining full boundaries',()=>{
    const chase={...request.context,targetToWin:request.context.runs+1};
    for (const seed of ['pass06-independent-13','pass06-independent-324','pass06-independent-26']) {
      const outcome=generateDelivery(withSeed(seed,{context:chase}));
      const sampled=outcome.trace.find(t=>t.stageName==='running'&&t.address.drawIndex===0);
      expect(sampled).toBeDefined();
      if(outcome.resolution.boundary==='NONE') {
        expect(outcome.resolution.completedRuns).toBeLessThanOrEqual(1);
        for(const row of sampled!.categories)
          if(['2','3'].includes(row.id))expect(row.mass).toBe(0);
      }
      expect(()=>scoreDelivery(chase,outcome.resolution)).not.toThrow();
    }
  });
  it('rejects unsupported identity, invalid geometry and incomplete field, never sampling first',()=>{
    const bad=[
      {...request, modelHash:'0'.repeat(64)},
      {...request, stagePackHash:'0'.repeat(64)},
      {...request, rulesHash:'0'.repeat(64)},
      {...request, randomVersion:'SHA256_COUNTER_V2'},
      {...request, probabilityVersion:'LC_INTEGER_PROBABILITY_V2'},
      {...request, generatorVersion:'LC_CONDITIONAL_DELIVERY_V2'},
      {...request, attemptOrdinal:request.attemptOrdinal+1},
      {...request, phase:'T20_LATE'},
      {...request,unexpected:true},
      {...request,bowling:{...request.bowling,variationId:'unversioned-inswing'}},
      {...request,batting:{...request.batting,shotSectorWeights:Array(8).fill(0)}},
      {...request,field:{...request.field,slots:request.field.slots.slice(1)}},
      {...request,field:{...request.field,slots:request.field.slots.map(slot=>({...slot,playerId:'f1'}))}},
    ];
    for(const invalid of bad) expect(()=>generateDelivery(invalid)).toThrow();
    expect(reqMirror({...request,unexpected:true})).toBe(false);
    expect(reqMirror({...request,bowling:{...request.bowling,variationId:'unversioned-inswing'}})).toBe(false);
  });
  it('isolates all random addresses from unrelated, prediction and rendering calls',()=>{
    const baseline=generateDelivery(request);
    const rng=createRandomService();
    for(const slot of Object.values(DELIVERY_DRAW_REGISTRY))
      rng.uint32({seed:request.seed,domain:'PREDICTION',entityId:'prediction-only',eventOrdinal:0,
        stageName:slot.stageName,drawIndex:slot.drawIndex});
    for(const randomSeed of ['commentary','render','graph'])generateDelivery(withSeed(randomSeed));
    expect(generateDelivery(request)).toEqual(baseline);
    const slots=Object.values(DELIVERY_DRAW_REGISTRY).map(x=>`${x.stageName}:${x.drawIndex}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(expectedGeneratorPhase('T20',35)).toBe('T20_EARLY');
    expect(expectedGeneratorPhase('T20',36)).toBe('T20_MIDDLE');
    expect(expectedGeneratorPhase('ODI',240)).toBe('ODI_LATE');
  });
});
