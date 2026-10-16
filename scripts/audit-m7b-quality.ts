/** Reproducible paired-policy diagnostic; not a fitted or validated real-cricket model.
 * Same independent fixture seed for both captain policies, but command changes may change draw addresses.
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { validateT20MatchSetup, runFixtureT20, projectT20Scorecard } from "@lcxxvi/simulation";
import { runTacticalT20 } from "../apps/batch/src/tactical-match.js";

const template=JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json","utf8"));
const bytes=readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
const nArg=process.argv.find(a=>a.startsWith("--matches="));
const n=nArg?Number(nArg.split("=")[1]):16;
if(!Number.isSafeInteger(n)||n<1||n>1024) throw new Error("LC_M7B_INVALID_MATCH_COUNT");
const rows: {seed:string;baselineRuns:number;tacticalRuns:number;baselineWickets:number;tacticalWickets:number;
  baselineMs:number;tacticalMs:number;tacticalCommands:number;finalHash:string}[]=[];
for(let j=0;j<n;j++) {
 const raw=structuredClone(template);raw.setup.seed=`LC_M7B_DIAGNOSTIC_${String(j).padStart(5,"0")}`;
 const setup=validateT20MatchSetup(raw,bytes,manifest);
 const t1=performance.now();const baseline=runFixtureT20(setup);const t2=performance.now();
 const tactical=runTacticalT20(setup);const t3=performance.now();
 const bc=projectT20Scorecard(baseline), tc=projectT20Scorecard(tactical);
 rows.push({seed:raw.setup.seed,baselineRuns:bc.innings.reduce((s,i)=>s+i.runs,0),tacticalRuns:tc.innings.reduce((s,i)=>s+i.runs,0),
  baselineWickets:bc.innings.reduce((s,i)=>s+i.wickets,0),tacticalWickets:tc.innings.reduce((s,i)=>s+i.wickets,0),
  baselineMs:t2-t1,tacticalMs:t3-t2,tacticalCommands:tactical.commands.length,finalHash:tactical.lastEventHash});
}
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const p95=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
const output={version:"LC_M7B_PAIRED_TACTICS_V1",modelStatus:"SYNTHETIC_ALPHA",status:"DESCRIPTIVE_ONLY_NOT_EMPIRICAL_VALIDATION",
 pairs:n,seedDesign:"identical_initial_match_seed_independent_legal_command_histories",
 baselineRunsPerInnings:mean(rows.map(r=>r.baselineRuns))/2,
 tacticalRunsPerInnings:mean(rows.map(r=>r.tacticalRuns))/2,
 meanPairedRunsDifferencePerMatch:mean(rows.map(r=>r.tacticalRuns-r.baselineRuns)),
 meanBaselineWicketsPerInnings:mean(rows.map(r=>r.baselineWickets))/2,
 meanTacticalWicketsPerInnings:mean(rows.map(r=>r.tacticalWickets))/2,
 runtime:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,
  baselineP95Ms:p95(rows.map(r=>r.baselineMs)),tacticalP95Ms:p95(rows.map(r=>r.tacticalMs)),
  referenceBrowserBudgetTested:false},
 datasetProvenance:"fictional-eight-01",approvedRealHeldOut:false,modelCoefficientsChanged:false,
 rows};
console.log(JSON.stringify(output,null,2));
