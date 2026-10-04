/**
 * LIMITED OFFLINE EVIDENCE ONLY: transpile actual production TS with the globally installed
 * TypeScript compiler; use identity contract shims because pinned Zod/AJV/npm are unavailable.
 * This executes actual production generator, integer probability and domain rules code,
 * with Node's SHA-256 replacing only the unavailable @noble/hashes dependency.
 * Must NEVER be presented as a substitute for npm ci/build/Vitest/real browser tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts;
try { ts=require('typescript'); }
catch { ts=require(path.join(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript/lib/typescript.js')); }
const cwd=process.cwd();
function canonical(x) {
  if (Array.isArray(x)) return '['+x.map(canonical).join(',')+']';
  if (x && typeof x === 'object') return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
const schemas=new Proxy({}, {get(_target,key) { if(key==='parse')return x=>x; if(key==='safeParse')return x=>({success:true,data:x}); return undefined; }});
const contracts={
  ...Object.fromEntries(['ProbabilityPackSchema','ProbabilityContextSchema','LegalityFeatureInputSchema',
  'ContactFeatureInputSchema','ProbabilityRequestSchema','GenerateDeliveryRequestSchema',
  'GeneratedDeliverySchema','ScoringContextSchema','DeliveryResolutionSchema',
  'DeliveryRecordedSchema','DeliveryExpectationSchema','RuleManifestSchema'].map(name=>[name,schemas])),
  canonicalJson(x) {return canonical(x);},
  PROBABILITY_MASS:4294967296, PROBABILITY_MODEL_ID:'synthetic-alpha-01',
  PROBABILITY_VERSION:'LC_INTEGER_PROBABILITY_V1',EXP_LUT_VERSION:'LC_EXP_LUT_V1',
  RANDOM_VERSION:'SHA256_COUNTER_V1',
  DELIVERY_GENERATOR_VERSION:'LC_CONDITIONAL_DELIVERY_V1',
  DELIVERY_STAGE_PACK_ID:'synthetic-alpha-01-delivery-v1',
};
const hashShim={
  canonicalStateBytes(value) {return Buffer.from(canonical(value),'utf8');},
  sha256Hex(bytes) {return sha(bytes);},
  createRandomService(version) {
    if(version!=='SHA256_COUNTER_V1')throw Error('unsupported');
    return Object.freeze({version,
      uint32(a){const data=JSON.stringify([a.seed,a.domain,a.entityId,a.eventOrdinal,a.stageName,a.drawIndex]);
        return crypto.createHash('sha256').update(data,'utf8').digest().readUInt32BE(0);}});
  },
};
function transpile(file,request) {
  const source=fs.readFileSync(path.resolve(cwd,file),'utf8');
  const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length) throw Error('TS_SYNTAX: '+file+' '+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  const mod={exports:{}};
  new Function('require','module','exports',result.outputText+'\n//# sourceURL='+file)(request,mod,mod.exports);
  return mod.exports;
}
const data={
  ...transpile('packages/data/src/probability-pack.ts',()=>{throw Error('Unexpected probability pack import')}),
  ...transpile('packages/data/src/delivery-pack.ts',()=>{throw Error('Unexpected delivery pack import')}),
  ...transpile('packages/data/src/rules.ts',id=>{if(id==='@lcxxvi/contracts')return contracts;throw Error('Unknown rules import '+id)}),
};
if(sha(Buffer.from(canonical(data.DELIVERY_STAGE_PACK)))!==data.DELIVERY_STAGE_PACK_SHA256)throw Error('STAGE_PACK_HASH_MISMATCH');
if(sha(Buffer.from(canonical(data.SYNTHETIC_ALPHA_PACK)))!==data.MODEL_PACK_SHA256)throw Error('MODEL_PACK_HASH_MISMATCH');
const validator=transpile('packages/domain/src/validate-resolution.ts',id=>{
  if(id==='@lcxxvi/contracts')return contracts;
  throw Error('Unknown validator import '+id);
});
const probability=transpile('packages/simulation/src/probability.ts',id=>{
  if(id==='@lcxxvi/contracts')return contracts;
  if(id==='@lcxxvi/data')return data;
  if(id==='./determinism.js')return hashShim;
  throw Error('Unknown probability import '+id);
});
const generator=transpile('packages/simulation/src/generator.ts',id=>{
  if(id==='@lcxxvi/contracts')return contracts;
  if(id==='@lcxxvi/data')return data;
  if(id==='@lcxxvi/domain')return validator;
  if(id==='./determinism.js')return hashShim;
  if(id==='./probability.js')return probability;
  throw Error('Unknown generator import '+id);
});
const scorer=transpile('packages/domain/src/scoring-kernel.ts',id=>{
  if(id==='@lcxxvi/contracts')return contracts;
  if(id==='./validate-resolution.js')return validator;
  throw Error('Unknown scorer import '+id);
});
const raw=JSON.parse(fs.readFileSync('tests/fixtures/generator/base-request.json','utf8'));
raw.rulesHash=generator.generatorRuleHash(raw.context.rulesId);
fs.writeFileSync('tests/fixtures/generator/base-request.json',JSON.stringify(raw,null,2)+'\n');
const cases=[];
let selected={},examplesByOutcome={},examplesByStageSelection={};let failures=[];
const count=Number(process.env.GENERATOR_OFFLINE_CASES??'500');
for(let i=0;i<count;i++) {
  const req={...raw,seed:`pass06-independent-${i}`};
  try {
    const result=generator.generateDelivery(req);
    const again=generator.generateDelivery(req);
    if(canonical(result)!==canonical(again))throw Error('REPEATABILITY_MISMATCH');
    if(!Object.isFrozen(result)||!Object.isFrozen(result.resolution)||!Object.isFrozen(result.trace))throw Error('RESULT_NOT_DEEP_FROZEN');
    const addresses=new Set(result.trace.map(t=>canonical(t.address)));
    if(addresses.size!==result.trace.length)throw Error('DUPLICATE_ADDRESS');
    for(const t of result.trace) {
      const expected=crypto.createHash('sha256').update(JSON.stringify([t.address.seed,t.address.domain,t.address.entityId,
        t.address.eventOrdinal,t.address.stageName,t.address.drawIndex])).digest().readUInt32BE(0);
      if(t.draw!==expected)throw Error('DRAW_INCONSISTENT');
      if(t.categories.at(-1).cumulative!==4294967296)throw Error('MASS_INCOMPLETE');
    }
    for (const t of result.trace) {
      const stageKey=t.stageName+':'+t.selectedCategoryId;
      if (!examplesByStageSelection[stageKey]) examplesByStageSelection[stageKey]={seed:req.seed,
        drawIndex:t.address.drawIndex,draw:t.draw};
    }
    const event=scorer.scoreDelivery(req.context,result.resolution);
    const ledger=scorer.reduceScoringBoundary(req.context,event);
    if(ledger.delta.teamRuns!==result.resolution.batRuns+
       Object.values(result.resolution.extras).reduce((s,n)=>s+n,0))throw Error('RUNS_NOT_RECONCILED');
    if(result.resolution.legality==='WIDE' && result.trace.some(t=>t.stageName==='contact'))throw Error('WIDE_CONTACT_NOT_BYPASSED');
    if(req.context.freeHitPending && result.resolution.dismissal && result.resolution.dismissal.kind!=='RUN_OUT')throw Error('FREE_HIT_WICKET');
    const kind=result.resolution.dismissal?.kind??'NONE';
    const key=`${result.resolution.legality}:${kind}:${result.resolution.fieldOutcome}`;
    selected[key]=(selected[key]??0)+1;
    if (!examplesByOutcome[key]) examplesByOutcome[key]={seed:req.seed,
      trace:result.trace.map(t=>({stageName:t.stageName,drawIndex:t.address.drawIndex,
        draw:t.draw,selectedCategoryId:t.selectedCategoryId, categories:t.categories})),
      resolution:result.resolution};
    if(cases.length<6 || (result.resolution.legality!=='LEGAL' && !cases.some(c=>c.legality===result.resolution.legality)))
      cases.push({id:i,seed:req.seed,legality:result.resolution.legality,kind,
        trace:result.trace.map(t=>({stageName:t.stageName,draw:t.draw,selectedCategoryId:t.selectedCategoryId})),
        resolution:result.resolution});
  } catch(e){failures.push({case:i,error:e.stack??String(e)});if(failures.length>10)break;}
}
const edgeChecks=[];
function edge(name, seed, patch, check) {
  const input={...raw,seed,...patch};
  const output=generator.generateDelivery(input);
  const event=scorer.scoreDelivery(input.context,output.resolution);
  check(output,event);
  edgeChecks.push({name,seed,passed:true,stages:output.trace.map(t=>`${t.stageName}:${t.address.drawIndex}`),
    outcome:output.resolution.legality,fieldOutcome:output.resolution.fieldOutcome});
}
edge('winning-wide-truncation','pass06-independent-28',
  {context:{...raw.context,targetToWin:raw.context.runs+1}},(out)=>{
    if(out.resolution.stage!=='IMMEDIATE_PENALTY'||out.trace.length!==2||out.resolution.dismissal)
      throw Error('WINNING_WIDE_INCORRECT');
  });
edge('free-hit-pre-sampling-dismissal-mask','pass06-independent-35',
  {context:{...raw.context,freeHitPending:true}},(out)=>{
    const hit=out.trace.find(t=>t.stageName==='contact')?.categories.find(c=>c.id==='HIT_WICKET');
    if(hit?.allowed!==false||hit.mass!==0||(out.resolution.dismissal&&out.resolution.dismissal.kind!=='RUN_OUT'))
      throw Error('FREE_HIT_MASK_INVALID');
  });
edge('no-ball-continues-contact','pass06-independent-487',{},(out)=>{
    if(out.resolution.legality!=='NO_BALL'||!out.trace.some(t=>t.stageName==='contact'))
      throw Error('NO_BALL_CONTACT_MISSING');
  });
for(const i of [13,324]) edge('target-bounded-physical-runs-'+i,`pass06-independent-${i}`,
  {context:{...raw.context,targetToWin:raw.context.runs+1}},(out)=>{
    const stage=out.trace.find(t=>t.stageName==='running'&&t.address.drawIndex===0);
    if(!stage||stage.categories.some(c=>['2','3'].includes(c.id)&&c.mass!==0)||
        (out.resolution.boundary==='NONE'&&out.resolution.completedRuns>1))
      throw Error('CHASE_DID_NOT_MASK_RUNNING');
  });
edge('full-winning-boundary','pass06-independent-26',
  {context:{...raw.context,targetToWin:raw.context.runs+1}},(out)=>{
    if(out.resolution.boundary!=='SIX'||out.resolution.batRuns!==6)
      throw Error('FULL_BOUNDARY_NOT_PRESERVED');
  });
for(const [name,patch] of [
 ['wrong-stage-pack',{stagePackHash:'0'.repeat(64)}],
 ['wrong-rules-hash',{rulesHash:'0'.repeat(64)}],
 ['wrong-ordinal',{attemptOrdinal:raw.attemptOrdinal+1}],
 ['incomplete-field',{field:{...raw.field,slots:raw.field.slots.slice(1)}}],
 ['unversioned-generator',{generatorVersion:'LC_CONDITIONAL_DELIVERY_V2'}],
]) {
  let rejected=false;
  try {generator.generateDelivery({...raw,...patch});}catch {rejected=true;}
  if(!rejected)throw Error(`EDGE_NEGATIVE_FAILED:${name}`);
  edgeChecks.push({name,passed:true,rejection:true});
}
const frozenVectors=JSON.parse(fs.readFileSync('tests/fixtures/generator/reference-vectors.json','utf8'));
for(const reference of frozenVectors.fixtures) {
  const out=generator.generateDelivery({...raw,seed:reference.seed});
  if(out.trace.length!==reference.trace.length)throw Error('FROZEN_VECTOR_STAGE_COUNT:'+reference.seed);
  for(let i=0;i<reference.trace.length;i++) {
    const actual=out.trace[i],ref=reference.trace[i];
    if(actual.stageName!==ref.stageName||actual.address.drawIndex!==ref.drawIndex||
       actual.draw!==ref.draw||actual.selectedCategoryId!==ref.selectedCategoryId ||
       (ref.categories && canonical(actual.categories)!==canonical(ref.categories)))
      throw Error('FROZEN_VECTOR_DRIFT:'+reference.seed+':'+i);
  }
}
const summary={verification:'OFFLINE_LIMITED_WITH_IDENTITY_ZOD_AND_NODE_SHA_SHIMS',
  count,passed:count-failures.length,failures,selected,edgeChecks,frozenVectorFixtures:frozenVectors.fixtures.length,
  frozenVectorStageAddresses:frozenVectors.fixtures.reduce((sum,x)=>sum+x.trace.length,0),
  examplesByOutcome,examplesByStageSelection,referenceCases:cases,
  stagePackHash:data.DELIVERY_STAGE_PACK_SHA256,modelHash:data.MODEL_PACK_SHA256,
  fixtureRulesHash:raw.rulesHash};
fs.mkdirSync('docs/verification-pass06',{recursive:true});
fs.writeFileSync('docs/verification-pass06/offline-generator-results.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({verification:summary.verification,passed:summary.passed,
  failures:summary.failures.map(f=>({case:f.case,error:f.error.split('\n')[0]})),selected:summary.selected,
  edgeChecks:summary.edgeChecks.length,frozenVectorFixtures:summary.frozenVectorFixtures,
  frozenVectorStageAddresses:summary.frozenVectorStageAddresses,
  stagePackHash:summary.stagePackHash},null,2));
if(failures.length)process.exitCode=1;
