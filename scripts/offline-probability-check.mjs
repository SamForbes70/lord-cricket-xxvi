/** Executes the actual probability.ts algorithm with strict, explicit offline shims for
 * unavailable Zod and SHA subpath dependencies. NOT a substitute for npm/Playwright.
 * It does verify the shipped algorithm byte-for-byte against independent Python vectors.
 */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
let ts;
try { ts=require('typescript'); }
catch { const global=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();ts=require(join(global,'typescript')); }
const tmp=mkdtempSync(join(tmpdir(),'lcxxvi-prob-'));
const compile=(file,out)=>{
  let source=readFileSync(file,'utf8');
  if(file.endsWith('probability.ts')){
    source=source.replaceAll('"@lcxxvi/contracts"','"./contracts.mjs"')
      .replaceAll('"@lcxxvi/data"','"./data.mjs"')
      .replaceAll('"./determinism.js"','"./determinism.mjs"');
  }
  const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  assert.equal((result.diagnostics||[]).filter(x=>x.category===1).length,0);
  writeFileSync(join(tmp,out),result.outputText);
};
const constraints=`
export const PROBABILITY_MASS=4294967296;
export const PROBABILITY_MODEL_ID='synthetic-alpha-01';
export const PROBABILITY_VERSION='LC_INTEGER_PROBABILITY_V1';
export const EXP_LUT_VERSION='LC_EXP_LUT_V1';
export const RANDOM_VERSION='SHA256_COUNTER_V1';
export function canonicalJson(x){const stack=new Set();const f=(v)=>{
  if(v===null||typeof v==='number'||typeof v==='boolean'||typeof v==='string'){
    if(typeof v==='number'&&!Number.isFinite(v))throw Error('nonfinite');return JSON.stringify(v);
  }
  if(typeof v!=='object'||stack.has(v))throw Error('nonjson');stack.add(v);
  let res;
  if(Array.isArray(v)) res='['+v.map(f).join(',')+']';
  else res='{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+f(v[k])).join(',')+'}';
  stack.delete(v);return res;
};return f(x);}
// These are deliberately NOT production schema validators. The independent JSON
// Schema check and the real npm Zod/AJV gate cover different responsibilities.
const clone=x=>structuredClone(x);
export const ProbabilityContextSchema={parse:clone};
export const ProbabilityPackSchema={parse:clone};
export const ProbabilityRequestSchema={parse:clone};
export const LegalityFeatureInputSchema={parse:clone};
export const ContactFeatureInputSchema={parse:clone};
`;
const determinism=`
import {createHash} from 'node:crypto';
import {canonicalJson} from './contracts.mjs';
export const canonicalStateBytes=value=>new TextEncoder().encode(canonicalJson(value));
export const sha256Hex=bytes=>createHash('sha256').update(bytes).digest('hex');
export const createRandomService=()=>({uint32:address=>{
 const keys=['seed','domain','entityId','eventOrdinal','stageName','drawIndex'];
 const text=JSON.stringify(keys.map(k=>address[k]));
 return createHash('sha256').update(text).digest().readUInt32BE(0);
}});
`;
try {
  writeFileSync(join(tmp,'contracts.mjs'),constraints);
  writeFileSync(join(tmp,'determinism.mjs'),determinism);
  compile('packages/data/src/probability-pack.ts','data.mjs');
  compile('packages/simulation/src/probability.ts','probability.mjs');
  const prob=await import(pathToFileURL(join(tmp,'probability.mjs')).href);
  const data=await import(pathToFileURL(join(tmp,'data.mjs')).href);
  const vectors=JSON.parse(readFileSync('tests/fixtures/probability/vectors.json','utf8'));
  const model=prob.createProbabilityService();
  assert.equal(model.modelHash,data.MODEL_PACK_SHA256);
  assert.equal(model.lutHash,data.EXP_LUT_SHA256);
  for(const fixture of vectors.cases){
    const input={probabilityVersion:vectors.version,modelId:vectors.modelId,
      modelHash:vectors.modelHash,lutVersion:'LC_EXP_LUT_V1',lutHash:vectors.lutHash,
      categories:fixture.categories};
    assert.deepEqual(model.normalise(input).categories,fixture.masses,fixture.id+' normalise');
    const out=model.execute({...input,kind:'SAMPLE_CATEGORY',stageName:'legality',
      randomVersion:'SHA256_COUNTER_V1',address:fixture.address});
    assert.equal(out.draw,fixture.draw,fixture.id+' SHA256 draw');
    assert.equal(out.selectedIndex,fixture.selectedIndex,fixture.id+' selection index');
    assert.equal(out.selectedCategoryId,fixture.selectedCategoryId,fixture.id+' selection ID');
    assert.deepEqual(model.normalise(input).categories,fixture.masses,fixture.id+' repeat');
  }
  assert.deepEqual(prob.legalityCategories({controlRating:80,fatigueBp:2000,line:'LEG',effort:'MAXIMUM'}), vectors.cases[13].categories);
  assert.deepEqual(prob.contactCategories({phase:'T20_LATE',defenceRating:70,timingRating:40,powerRating:80,effectiveMovementBp:5000,aggression:4}), vectors.cases[14].categories);
  const halves=model.normalise({probabilityVersion:vectors.version,modelId:vectors.modelId,
      modelHash:vectors.modelHash,lutVersion:'LC_EXP_LUT_V1',lutHash:vectors.lutHash,
      categories:vectors.cases[0].categories}).categories;
  for(const b of vectors.boundaries){
    assert.deepEqual(prob.chooseCategoricalMass(halves,b.draw),{index:b.index,id:b.id_});
  }
  const zero={probabilityVersion:vectors.version,modelId:vectors.modelId,
    modelHash:vectors.modelHash,lutVersion:'LC_EXP_LUT_V1',lutHash:vectors.lutHash,
    categories:[{id:'ZERO',baseWeight:0,allowed:true,interceptBp:0,terms:[]}]};
  assert.throws(()=>model.normalise(zero),/EMPTY_POSITIVE_MASK/);
  assert.throws(()=>model.normalise({...zero,modelHash:'0'.repeat(64)}),/UNSUPPORTED_MODEL_OR_LUT_HASH/);
  assert.throws(()=>model.normalise({...zero,categories:[...vectors.cases[0].categories,...vectors.cases[0].categories]}),/DUPLICATE_CATEGORY_ID/);
  assert.throws(()=>prob.createProbabilityService({...data.SYNTHETIC_ALPHA_PACK,lutStepBp:200}),/UNSUPPORTED_MODEL_HASH/);
  console.log(`PASS actual transpiled TypeScript algorithm with offline dependency shims: ${vectors.cases.length} independent vectors, ${vectors.boundaries.length} boundaries, pinned pack/LUT hashes and 4 error guards (TS ${ts.version})`);
} finally {rmSync(tmp,{recursive:true,force:true});}
