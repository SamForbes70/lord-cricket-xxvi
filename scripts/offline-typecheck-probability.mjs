/** Offline semantic check of new probability.ts only, with documented contracts
 * represented by local type stubs. Full workspace strict typecheck still required.
 */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript');}catch{ts=require(join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const tmp=mkdtempSync(join(tmpdir(),'lcxxvi-tscheck-'));
try{
copyFileSync('packages/simulation/src/probability.ts',join(tmp,'probability.ts'));
copyFileSync('packages/data/src/probability-pack.ts',join(tmp,'data.ts'));
writeFileSync(join(tmp,'determinism.ts'),`
export function canonicalStateBytes(x:unknown):Uint8Array{return new Uint8Array();}
export function sha256Hex(x:Uint8Array):string{return '';}
export function createRandomService(x:unknown){return {uint32(a:unknown):number{return 0}};}
`);
writeFileSync(join(tmp,'contracts.ts'),`
export const PROBABILITY_MASS=4294967296 as const;
export const PROBABILITY_MODEL_ID='synthetic-alpha-01' as const;
export const PROBABILITY_VERSION='LC_INTEGER_PROBABILITY_V1' as const;
export const EXP_LUT_VERSION='LC_EXP_LUT_V1' as const;
export const RANDOM_VERSION='SHA256_COUNTER_V1' as const;
export function canonicalJson(value:unknown):string{return '';}
export interface ProbabilityCategory{
 id:string;baseWeight:number;allowed:boolean;interceptBp:number;
 terms:Array<{coefficientBp:number,featureBp:number}>;
}
export interface ProbabilityMass{
 readonly id:string;readonly allowed:boolean;readonly logitBp:number|null;
 readonly lutIndex:number|null;readonly mass:number;readonly cumulative:number;
}
export interface ProbabilityContext{
 probabilityVersion:'LC_INTEGER_PROBABILITY_V1';modelId:'synthetic-alpha-01';
 modelHash:string;lutVersion:'LC_EXP_LUT_V1';lutHash:string;categories:ProbabilityCategory[];
}
export interface ProbabilityPack{
 manifest:{modelId:'synthetic-alpha-01',expLutHash:string,featureSpecHash:string};
 probabilityVersion:'LC_INTEGER_PROBABILITY_V1';lutVersion:'LC_EXP_LUT_V1';
 lutStepBp:100;lutMinDeltaBp:-160000;lutMaxDeltaBp:0;lutScale:'1000000000000';
 expLutValues:number[];featureSpec:Record<string,unknown>;
 baselines:{legality:Array<{id:string,baseWeight:number}>;contact:Record<string,Array<{id:string,baseWeight:number}>>};
}
export const ProbabilityContextSchema={parse(input:unknown):ProbabilityContext{return input as ProbabilityContext;}};
export const ProbabilityPackSchema={parse(input:unknown):ProbabilityPack{return input as ProbabilityPack;}};
export const ProbabilityRequestSchema={parse(input:unknown):ProbabilityContext &
 ({kind:'NORMALISE_CATEGORIES'} | {kind:'SAMPLE_CATEGORY';stageName:string;
 randomVersion:'SHA256_COUNTER_V1';address:{stageName:string;seed:string;domain:string;
 entityId:string;eventOrdinal:number;drawIndex:number}}){return input as never;}};
export const LegalityFeatureInputSchema={parse(input:unknown){return input as {controlRating:number;fatigueBp:number;line:'OFF'|'STUMPS'|'LEG';effort:'CONSERVE'|'NORMAL'|'MAXIMUM'};}};
export const ContactFeatureInputSchema={parse(input:unknown){return input as {phase:'T20_EARLY'|'T20_MIDDLE'|'T20_LATE'|'ODI_EARLY'|'ODI_MIDDLE'|'ODI_LATE'|'RED_BALL';defenceRating:number;timingRating:number;powerRating:number;effectiveMovementBp:number;aggression:number};}};
`);
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
 strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,skipLibCheck:true,noEmit:true,types:[],
 baseUrl:tmp,paths:{'@lcxxvi/contracts':['./contracts.ts'],'@lcxxvi/data':['./data.ts']}};
const program=ts.createProgram([join(tmp,'probability.ts'),join(tmp,'data.ts')],options);
const diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics){const pos=d.file?.getLineAndCharacterOfPosition(d.start??0);console.error(d.file?.fileName??'',pos?pos.line+1:'',ts.flattenDiagnosticMessageText(d.messageText,' '));}
if(diagnostics.length)process.exitCode=1;
else console.log('PASS offline strict semantic check: production probability.ts against contract-shaped types, generated pack.ts, TS '+ts.version);
} finally{rmSync(tmp,{recursive:true,force:true});}
