/** M7G OFFLINE RESEARCH. Not a selectable production match model.
 * Components are Cricsheet-observable; extras/dismissals are sampled jointly.
 * The adapter invents explicitly tagged non-observable presentation/fielding
 * facts solely to exercise the accepted scorer in controlled tests.
 */
import { canonicalJson, type ScoringContext, type DeliveryResolution } from "@lcxxvi/contracts";
import { scoreDelivery, validateDeliveryResolution } from "@lcxxvi/domain";
import { sha256Hex } from "./determinism.js";

export const M7G_VERSION="LC_T20_SCORING_COMPONENTS_RESEARCH_V1" as const;
const TOTAL=4_294_967_296;
const phases=["POWERPLAY","MIDDLE","DEATH"] as const;
const bands=["0-2","3-5","6-9"] as const;
type MassRow=Record<string,number>;
export interface M7GPack {
  version:string; modelStatus:string;gameplayIntegrationPermitted:boolean;
  empiricallyValidatedGameplay:boolean;probabilityMass:number;
  categories:string[];phaseMass:Record<string,MassRow>;
  regimeMass:Record<string,Record<string,MassRow>>;
  regimeCounts:number[];regimeCutpoints:number[];candidateSha256:string;
}
export interface ObservedComponents {
  legality:"LEGAL"|"WIDE"|"NO_BALL";batRuns:number;
  wides:number;noBalls:number;byes:number;legByes:number;
  boundary:0|4|6;
  wicketKind:"NONE"|"BOWLED"|"LBW"|"CAUGHT"|"STUMPED"|"HIT_WICKET"|"RUN_OUT";
  dismissed:"NONE"|"STRIKER"|"NON_STRIKER";
  completedRuns:number;teamRuns:number;
}
export function parseM7GComponents(key:string):ObservedComponents {
  const a=key.split("|");
  if(a.length!==9 || !a.slice(1,7).every(x=>/^(0|[1-9][0-9]*)$/.test(x!)))throw Error("M7G_BAD_CATEGORY");
  const [legality,, , , , , ,wicketKind,dismissed]=a;
  const [batRuns,wides,noBalls,byes,legByes,boundary]=a.slice(1,7).map(Number) as [number,number,number,number,number,number];
  if(!["LEGAL","WIDE","NO_BALL"].includes(legality!) ||
    !["NONE","BOWLED","LBW","CAUGHT","STUMPED","HIT_WICKET","RUN_OUT"].includes(wicketKind!) ||
    !["NONE","STRIKER","NON_STRIKER"].includes(dismissed!) ||
    ![batRuns,wides,noBalls,byes,legByes].every(x=>x!==undefined && x<=12) || ![0,4,6].includes(boundary!) ||
    ((wicketKind==="NONE") !== (dismissed==="NONE")) ||
    (wicketKind!=="NONE"&&wicketKind!=="RUN_OUT"&&dismissed!=="STRIKER") ||
    (legality==="WIDE" ? wides<1||noBalls!==0||batRuns!==0||byes!==0||legByes!==0 :
      legality==="NO_BALL" ? noBalls!==1||wides!==0 : wides!==0||noBalls!==0) ||
    (byes>0&&legByes>0) || (batRuns>0&&(byes>0||legByes>0)) ||
    (wicketKind!=="RUN_OUT"&&wicketKind!=="NONE"&&(batRuns+byes+legByes+Math.max(0,wides-1))!==0) ||
    (legality==="WIDE"&&!["NONE","RUN_OUT","STUMPED"].includes(wicketKind!)) ||
    (legality==="NO_BALL"&&!["NONE","RUN_OUT"].includes(wicketKind!)) ||
    (boundary!==0&&(wicketKind!=="NONE" || batRuns+wides+noBalls+byes+legByes-noBalls-(legality==="WIDE"?1:0)!==boundary)) ||
    (boundary===6&&batRuns!==6))throw Error("M7G_UNSCORABLE_CATEGORY");
  return {legality:legality as ObservedComponents["legality"],batRuns:batRuns!,wides:wides!,noBalls:noBalls!,
    byes:byes!,legByes:legByes!,boundary:boundary as 0|4|6,
    wicketKind:wicketKind as ObservedComponents["wicketKind"],dismissed:dismissed as ObservedComponents["dismissed"],
    completedRuns:boundary===0?batRuns!+byes!+legByes!+Math.max(0,wides!-1):0,
    teamRuns:batRuns!+wides!+noBalls!+byes!+legByes!};
}
function checkRow(row:MassRow,categories:string[]) {
  const keys=Object.keys(row);
  if(keys.length!==categories.length || keys.some(k=>!categories.includes(k) || !Number.isSafeInteger(row[k]) || row[k]!<1) ||
     keys.reduce((s,k)=>s+row[k]!,0)!==TOTAL)throw Error("M7G_NON_NORMALIZED_ROW");
}
export function validateM7GPack(value:unknown):M7GPack {
  canonicalJson(value);
  const pack=value as M7GPack;
  if(!pack || pack.version!==M7G_VERSION || pack.modelStatus!=="RESEARCH_ONLY_NOT_GAMEPLAY" ||
    pack.gameplayIntegrationPermitted!==false || pack.empiricallyValidatedGameplay!==false ||
    pack.probabilityMass!==TOTAL || !Array.isArray(pack.categories) ||
    pack.categories.length<10 || new Set(pack.categories).size!==pack.categories.length ||
    !Array.isArray(pack.regimeCounts) || pack.regimeCounts.length!==5 ||
    !pack.regimeCounts.every(x=>Number.isSafeInteger(x)&&x>0) ||
    !Array.isArray(pack.regimeCutpoints) || pack.regimeCutpoints.length!==4 ||
    !/^[0-9a-f]{64}$/.test(pack.candidateSha256 ?? ""))throw Error("M7G_BAD_PACK");
  pack.categories.forEach(parseM7GComponents);
  const required=phases.flatMap(p=>bands.map(b=>`${p}/${b}`)).sort();
  const keys=(row:object)=>Object.keys(row).sort();
  if(canonicalJson(keys(pack.phaseMass))!==canonicalJson(required) ||
     canonicalJson(keys(pack.regimeMass))!==canonicalJson(["0","1","2","3","4"]))throw Error("M7G_BAD_CONTEXTS");
  for(const key of required)checkRow(pack.phaseMass[key]!,pack.categories);
  for(let k=0;k<5;k++) {
    if(canonicalJson(keys(pack.regimeMass[String(k)]!))!==canonicalJson(required))throw Error("M7G_BAD_REGIME_CONTEXTS");
    for(const key of required)checkRow(pack.regimeMass[String(k)]![key]!,pack.categories);
  }
  const {candidateSha256,...content}=pack;
  if(sha256Hex(new TextEncoder().encode(canonicalJson(content)))!==candidateSha256)throw Error("M7G_HASH_MISMATCH");
  return pack;
}
export function m7gDraw(pack:M7GPack,regime:number,phase:string,wickets:number,seed:string,ordinal:number,freeHit=false):string {
  if(!Number.isSafeInteger(regime)||regime<0||regime>4||!phases.includes(phase as typeof phases[number])||
     !Number.isSafeInteger(wickets)||wickets<0||wickets>9||!seed||!Number.isSafeInteger(ordinal)||ordinal<0)throw Error("M7G_BAD_DRAW");
  const ctx=`${phase}/${wickets<3?'0-2':wickets<6?'3-5':'6-9'}`;
  const row=pack.regimeMass[String(regime)]?.[ctx];if(!row)throw Error("M7G_BAD_CONTEXT");
  const categories=Object.keys(row).sort().filter(k=>!freeHit||["NONE","RUN_OUT"].includes(parseM7GComponents(k).wicketKind));
  const sum=categories.reduce((n,k)=>n+row[k]!,0);
  if(!sum)throw Error("M7G_MASK_EMPTY");
  // For unmasked rows this exactly matches the Python SHA256_COUNTER research draw.
  const addr=canonicalJson({context:ctx,ordinal,seed,version:M7G_VERSION});
  const draw=Number.parseInt(sha256Hex(new TextEncoder().encode(addr)).slice(0,8),16);
  if(!freeHit){let s=0;for(const k of categories){s+=row[k]!;if(draw<s)return k;} }
  else {const target=draw/TOTAL*sum;let s=0;for(const k of categories){s+=row[k]!;if(target<s)return k;}}
  throw Error("M7G_DRAW_OVERFLOW");
}
/** Creates a strictly scorer-valid test resolution. Unobserved fielding
 * annotations below are SYNTHETIC PLACEHOLDERS, never real Cricsheet evidence.
 * First-innings only; not an authorised match generator.
 */
export function adaptM7GToScorer(context:ScoringContext,key:string):{
  resolution:DeliveryResolution;syntheticFields:readonly string[];
} {
  const x=parseM7GComponents(key);
  if(context.rulesId!=="LC_T20_01"||context.targetToWin!==null ||
     context.wickets>=10 || context.legalBalls>=120)throw Error("M7G_ONLY_FIRST_INNINGS_RESEARCH");
  if(context.freeHitPending && !["NONE","RUN_OUT"].includes(x.wicketKind))throw Error("M7G_FREE_HIT_MASK");
  const ends:DeliveryResolution["endsAfter"]={...context.endsBefore};
  const n=context.strikerEnd==="NORTH"?"north":"south";
  const o=n==="north"?"south":"north";
  if(x.completedRuns%2===1) { ends.north=context.endsBefore.south;ends.south=context.endsBefore.north; }
  const outId=x.dismissed==="NON_STRIKER"?context.nonStrikerId:context.strikerId;
  const outEnd=x.dismissed==="NON_STRIKER" ? (x.completedRuns%2===1?n:o) : (x.completedRuns%2===1?o:n);
  const d=x.wicketKind!=="NONE" ? {
    kind:x.wicketKind,playerId:outId,
    fielderId:x.wicketKind==="RUN_OUT"?context.bowlerId:
      x.wicketKind==="CAUGHT"?context.keeperId:
      x.wicketKind==="STUMPED"?context.keeperId:null,
    wicketEnd:outEnd==="north"?"NORTH" as const:"SOUTH" as const,
  }:null;
  if(d) ends[outEnd]=null;
  const batContact=x.batRuns>0 || x.wicketKind==="CAUGHT";
  const resolution:DeliveryResolution={
    stage:"DELIVERY",legality:x.legality,batRuns:x.batRuns,
    extras:{wides:x.wides,noBalls:x.noBalls,byes:x.byes,legByes:x.legByes,penalties:0},
    completedRuns:x.completedRuns,
    attemptedRuns:x.completedRuns+(x.wicketKind==="RUN_OUT"?1:0),
    boundary:x.boundary===4?"FOUR":x.boundary===6?"SIX":"NONE",
    dismissal:d, endsAfter:ends,
    batContact,attemptedStroke:x.legality!=="WIDE",shotSector:null,
    trajectory:x.wicketKind==="CAUGHT"?"AERIAL":batContact?(x.boundary===6?"AERIAL":"GROUND"):null,
    executedLength:null,fieldOutcome:x.wicketKind==="CAUGHT"?"CATCH":
      x.wicketKind==="RUN_OUT"?"RUN_OUT":"NONE",elapsedSeconds:30,
  };
  validateDeliveryResolution(context,resolution);
  const event=scoreDelivery(context,resolution);
  const sum=event.batRuns+Object.values(event.extras).reduce((a,b)=>a+b,0);
  if(sum!==x.teamRuns)throw Error("M7G_SCORER_DISAGREEMENT");
  return {resolution,syntheticFields:["fielderId","wicketEnd","endsAfter","shotSector","trajectory","executedLength","fieldOutcome","elapsedSeconds"]};
}
