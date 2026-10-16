/** M7H offline T20 chase research only.
 * Does not modify any accepted probability, scorer, random service or match engine.
 * Cricsheet cannot identify captain intent or the fictional player-rating scale.
 * Fielding/physical details supplied to scoring are synthetic test annotations.
 */
import {canonicalJson, type ScoringContext} from "@lcxxvi/contracts";
import {scoreDelivery,validateDeliveryResolution} from "@lcxxvi/domain";
import {sha256Hex} from "./determinism.js";
import {adaptM7GToScorer,parseM7GComponents} from "./m7g-research-scoring.js";

export const M7H_VERSION="LC_T20_CHASE_COMPONENTS_RESEARCH_V1" as const;
const TOTAL=4294967296;
const phases=["POWERPLAY","MIDDLE","DEATH"] as const;
const bands=["0-2","3-5","6-9"] as const;
const pressures=["LOW","MEDIUM","HIGH"] as const;
type MassRow=Record<string,number>;
export interface M7HResearchPack {
  version:string;
  modelStatus:string;
  gameplayIntegrationPermitted:boolean;
  empiricallyValidatedGameplay:boolean;
  probabilityMass:number;
  categories:string[];
  phaseMass:Record<string,MassRow>;
  regimeMass:Record<string,Record<string,MassRow>>;
  regimeCounts:number[];
  regimeCutpoints:number[];
  candidateSha256:string;
  firstModelSha256:string;
}
function validateRow(row:MassRow,categories:readonly string[]) {
  const keys=Object.keys(row);
  if(keys.length!==categories.length || keys.some(k=>!categories.includes(k)||!Number.isSafeInteger(row[k])||row[k]!<1)||
    keys.reduce((s,k)=>s+row[k]!,0)!==TOTAL)throw Error("M7H_BAD_MASS_ROW");
}
export function validateM7HPack(raw:unknown):M7HResearchPack {
  canonicalJson(raw);
  const p=raw as M7HResearchPack;
  if(!p||p.version!==M7H_VERSION||p.modelStatus!=="RESEARCH_ONLY_NOT_GAMEPLAY"||
      p.gameplayIntegrationPermitted!==false||p.empiricallyValidatedGameplay!==false||
      p.probabilityMass!==TOTAL||!Array.isArray(p.categories)||p.categories.length<10||
      new Set(p.categories).size!==p.categories.length||!Array.isArray(p.regimeCounts)||
      p.regimeCounts.length!==5||!p.regimeCounts.every(v=>Number.isSafeInteger(v)&&v>0)||
      !Array.isArray(p.regimeCutpoints)||p.regimeCutpoints.length!==4||
      !/^[0-9a-f]{64}$/.test(p.firstModelSha256??"")||
      !/^[0-9a-f]{64}$/.test(p.candidateSha256??""))throw Error("M7H_INVALID_PACK");
  p.categories.forEach(parseM7GComponents);
  const required=phases.flatMap(ph=>bands.flatMap(b=>pressures.map(pr=>`${ph}/${b}|${pr}`))).sort();
  const k=(obj:object)=>Object.keys(obj).sort();
  if(canonicalJson(k(p.phaseMass))!==canonicalJson(required)||
     canonicalJson(k(p.regimeMass))!==canonicalJson(["0","1","2","3","4"]))throw Error("M7H_BAD_CONTEXTS");
  for(const ctx of required)validateRow(p.phaseMass[ctx]!,p.categories);
  for(let r=0;r<5;r++) {
    if(canonicalJson(k(p.regimeMass[String(r)]!))!==canonicalJson(required))throw Error("M7H_BAD_REGIME");
    for(const ctx of required)validateRow(p.regimeMass[String(r)]![ctx]!,p.categories);
  }
  const {candidateSha256,...payload}=p;
  if(sha256Hex(new TextEncoder().encode(canonicalJson(payload)))!==candidateSha256)throw Error("M7H_HASH_MISMATCH");
  return p;
}
export function m7hPressure(target:number,runs:number,legalBalls:number):typeof pressures[number] {
  if(!Number.isSafeInteger(target)||target<1||!Number.isSafeInteger(runs)||runs<0||
     !Number.isSafeInteger(legalBalls)||legalBalls<0||legalBalls>120)throw Error("M7H_BAD_CHASE_STATE");
  const rate=6*Math.max(0,target-runs)/Math.max(1,120-legalBalls);
  return rate<6?"LOW":rate<=10?"MEDIUM":"HIGH";
}
export function m7hContext(legalBalls:number,wickets:number,target:number,runs:number):string {
  if(!Number.isSafeInteger(wickets)||wickets<0||wickets>9)throw Error("M7H_BAD_WICKETS");
  const ph=legalBalls<36?"POWERPLAY":legalBalls<90?"MIDDLE":"DEATH";
  const band=wickets<3?"0-2":wickets<6?"3-5":"6-9";
  return `${ph}/${band}|${m7hPressure(target,runs,legalBalls)}`;
}
function maskAndQuantize(row:MassRow) {
  const keys=Object.keys(row).sort().filter(k=>["NONE","RUN_OUT"].includes(parseM7GComponents(k).wicketKind));
  if(!keys.length)throw Error("M7H_FREEHIT_EMPTY");
  const sum=keys.reduce((acc,k)=>acc+row[k]!,0);
  const scale=TOTAL-keys.length;
  const weighted=keys.map(k=>row[k]!/sum*scale);
  const floors=weighted.map(x=>Math.floor(x));
  const masses=floors.map(x=>x+1);
  const left=TOTAL-masses.reduce((a,b)=>a+b,0);
  const order=keys.map((key,i)=>({key,i,rest:weighted[i]!-floors[i]!}))
    .sort((a,b)=>b.rest-a.rest||a.key.localeCompare(b.key));
  for(let i=0;i<left;i++) masses[order[i]!.i]!++;
  return keys.map((key,i)=>[key,masses[i]!] as const);
}
export function m7hDraw(pack:M7HResearchPack,regime:number,legalBalls:number,wickets:number,
    target:number,runs:number,seed:string,ordinal:number,freeHit=false):string {
  if(!Number.isSafeInteger(regime)||regime<0||regime>4||
     !Number.isSafeInteger(ordinal)||ordinal<0||!seed||
     runs>=target||legalBalls>=120)throw Error("M7H_BAD_DRAW");
  const ctx=m7hContext(legalBalls,wickets,target,runs);
  const mass=pack.regimeMass[String(regime)]?.[ctx];if(!mass)throw Error("M7H_MISSING_CONTEXT");
  const sorted=freeHit?maskAndQuantize(mass):Object.keys(mass).sort().map(key=>[key,mass[key]!] as const);
  const address=canonicalJson({context:ctx,ordinal,seed,version:M7H_VERSION});
  const n=Number.parseInt(sha256Hex(new TextEncoder().encode(address)).slice(0,8),16);
  let x=0;
  for(const [key,v] of sorted){x+=v;if(n<x)return key;}
  throw Error("M7H_DRAW_OVERFLOW");
}
/** Reuses the M7G scorer adapter for observed run components while validating
 * the RESULT against the REAL chase target and second-innings context.
 * Substitutes a null target ONLY for the first-innings-only adapter guard;
 * never passes that altered context to the actual scorer/reducer.
 */
export function adaptM7HChaseToScorer(context:ScoringContext,key:string) {
  if(context.rulesId!=="LC_T20_01"||context.inningsIndex!==1||
     context.targetToWin===null||context.runs>=context.targetToWin||
     context.wickets>=10||context.legalBalls>=120)throw Error("M7H_NOT_ACTIVE_CHASE");
  const neutral:ScoringContext={...context,targetToWin:null};
  const result=adaptM7GToScorer(neutral,key);
  validateDeliveryResolution(context,result.resolution);
  const scored=scoreDelivery(context,result.resolution);
  const extras=Object.values(scored.extras).reduce((sum,v)=>sum+v,0);
  if(scored.batRuns+extras!==parseM7GComponents(key).teamRuns)throw Error("M7H_SCORER_MISMATCH");
  return result;
}
