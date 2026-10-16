/** M7C immutable SYNTHETIC_ALPHA T20 sample. No parameter tuning and no false empirical claim.
 * First-innings primary cohort avoids truncated successful chases. Each match remains the
 * bootstrap/resampling unit. This script does NOT modify engine packs or event state.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { createHash } from "node:crypto";
import { validateT20MatchSetup, runFixtureT20, projectT20Scorecard } from "@lcxxvi/simulation";

const rawCount=process.argv.find(a=>a.startsWith("--matches="))?.split("=")[1] ?? "96";
const n=Number(rawCount);
if (!Number.isSafeInteger(n) || n<1 || n>2000) throw new Error("LC_M7C_MATCH_COUNT_OUT_OF_RANGE");
const raw=JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json","utf8"));
const world=readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
type InningRow = {runs:number; wickets:number; legalBalls:number; attempts:number; dots:number; boundaries:number; illegals:number; phases: Record<string,{runs:number; wickets:number; legalBalls:number; attempts:number; dots:number; boundaries:number}>};
const rows: {seed:string; first:InningRow; second:InningRow; elapsedMs:number; eventHash:string}[]=[];
const phase=(legalBallsBefore:number)=> legalBallsBefore<36?"POWERPLAY":legalBallsBefore<90?"MIDDLE":"DEATH";
const empty=():InningRow=>({runs:0,wickets:0,legalBalls:0,attempts:0,dots:0,boundaries:0,illegals:0,phases:{POWERPLAY:{runs:0,wickets:0,legalBalls:0,attempts:0,dots:0,boundaries:0},MIDDLE:{runs:0,wickets:0,legalBalls:0,attempts:0,dots:0,boundaries:0},DEATH:{runs:0,wickets:0,legalBalls:0,attempts:0,dots:0,boundaries:0}}});
for(let k=0;k<n;k++) {
 const req=structuredClone(raw);req.setup.seed=`m7c-profiling-${String(k).padStart(6,"0")}`;
 const setup=validateT20MatchSetup(req,world,manifest);
 const t0=performance.now();const session=runFixtureT20(setup);const elapsedMs=performance.now()-t0;
 const card=projectT20Scorecard(session);
 const innings=[empty(),empty()];
 for(const event of session.events){
  if(event.type!=="DELIVERY_RECORDED") continue;
  const d=(event.payload as {event:{inningsIndex:number;legalBall:boolean;legality:string;batRuns:number;extras:Record<string,number>;boundary:string;dismissal:unknown}}).event;
  const stat=innings[d.inningsIndex];if(!stat)throw new Error("LC_M7C_INVALID_INNINGS_INDEX");
  const r=Object.values(d.extras).reduce((a,b)=>a+b,d.batRuns);const w=Number(d.dismissal!==null);const dot=Number(r===0);const b=Number(d.boundary==="FOUR"||d.boundary==="SIX");const p=stat.phases[phase(stat.legalBalls)];if(!p)throw new Error("LC_M7C_MISSING_PHASE");
  stat.runs+=r;stat.wickets+=w;stat.legalBalls+=Number(d.legalBall);stat.attempts++;stat.dots+=dot;stat.boundaries+=b;stat.illegals+=Number(!d.legalBall);
  p.runs+=r;p.wickets+=w;p.legalBalls+=Number(d.legalBall);p.attempts++;p.dots+=dot;p.boundaries+=b;
 }
 for(const i of [0,1]) {
  const c=card.innings[i]!,s=innings[i]!;
  if(c.runs!==s.runs||c.wickets!==s.wickets||c.legalBalls!==s.legalBalls) throw new Error("LC_M7C_SCORE_RECONCILIATION_FAILURE");
  if(s.legalBalls>120) throw new Error("LC_M7C_ILLEGAL_INNINGS_LENGTH");
 }
 rows.push({seed:req.setup.seed,first:innings[0]!,second:innings[1]!,elapsedMs,eventHash:session.lastEventHash});
}
const sorted=rows.map(x=>x.elapsedMs).sort((a,b)=>a-b);
const mean=(nums:number[])=>nums.reduce((a,b)=>a+b,0)/nums.length;
const first=rows.map(r=>r.first);
const rates=(key:"dots"|"boundaries")=>first.reduce((s,r)=>s+r[key],0)/first.reduce((s,r)=>s+r.attempts,0);
const pct=(arr:number[],p:number)=>[...arr].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*arr.length)-1)];
const out={version:"LC_M7C_SYNTHETIC_FIRST_INNINGS_V1",status:"DESCRIPTIVE_SYNTHETIC_ONLY",source:"SYNTHETIC_ALPHA",modelId:raw.setup.modelId,modelHash:raw.modelHash,worldSha256:createHash("sha256").update(world).digest("hex"),matches:n,firstInnings:{meanRuns:mean(first.map(i=>i.runs)),meanWickets:mean(first.map(i=>i.wickets)),p10:pct(first.map(i=>i.runs),.1),p50:pct(first.map(i=>i.runs),.5),p90:pct(first.map(i=>i.runs),.9),dotAttemptProportion:rates("dots"),boundaryAttemptProportion:rates("boundaries"),meanLegalBalls:mean(first.map(i=>i.legalBalls)),phaseStats:Object.fromEntries(["POWERPLAY","MIDDLE","DEATH"].map(p=>{const sum=first.reduce((x,i)=>{const v=i.phases[p]!;return {runs:x.runs+v.runs,wickets:x.wickets+v.wickets,legalBalls:x.legalBalls+v.legalBalls,attempts:x.attempts+v.attempts,dots:x.dots+v.dots,boundaries:x.boundaries+v.boundaries}}, {runs:0,wickets:0,legalBalls:0,attempts:0,dots:0,boundaries:0});return[p,{...sum,runsPerLegalOver:sum.legalBalls?6*sum.runs/sum.legalBalls:null,dotAttemptProportion:sum.attempts?sum.dots/sum.attempts:null,boundaryAttemptProportion:sum.attempts?sum.boundaries/sum.attempts:null}]}))},runtime:{node:process.version,platform:process.platform,cpuModel:os.cpus()[0]?.model??"unknown",logicalCpus:os.cpus().length,totalRam:os.totalmem(),p50Ms:pct(sorted,.5),p95Ms:pct(sorted,.95),measuredInBrowser:false},rows};
process.stdout.write(JSON.stringify(out,null,2)+"\n");
