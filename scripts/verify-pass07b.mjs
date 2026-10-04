/** Complete M2 acceptance. No historic status accepted without an actual fresh run. */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import {performance} from "node:perf_hooks";
const directory=process.env.LCXXVI_VERIFY_07B_DIR??"docs/verification-pass07b";
const inherited=join(directory,"inherited"),browser=process.env.LCXXVI_BROWSER_EVIDENCE_DIR??join(directory,"browser");
const corpus=process.env.LCXXVI_CORPUS_DIR??"/tmp/lcxxvi-pass07b-corpus";
const sample=process.env.LCXXVI_SAMPLE_PREFIX??"/tmp/lcxxvi-pass07b-acceptance-sample";
for(const path of [directory,inherited,browser,corpus])mkdirSync(path,{recursive:true});
const hash=(path)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const now=new Date().toISOString(),gates=[];
function run(name,args,env={},timeout=120_000){
  const started=performance.now();const r=spawnSync(args[0],args.slice(1),{
    encoding:"utf8",maxBuffer:64_000_000,timeout,env:{...process.env,...env}});
  const entry={gate:name,command:args.join(" "),status:r.error?.code==="ETIMEDOUT"?"BLOCKED":r.status===0?"PASS":"FAIL",
    exitCode:r.status,elapsedMs:Math.round(performance.now()-started),log:`${name}.log`,
    ...(r.error?{error:r.error.message}:{})};
  writeFileSync(join(directory,entry.log),[r.stdout??"",r.stderr??"",r.error?.message??""].join("\n"));
  gates.push(entry);console.log(`${name}: ${entry.status} (${entry.elapsedMs}ms)`);return entry;
}
function inspect(name,check){const started=performance.now();let error="";
  try{check();}catch(e){error=e instanceof Error?e.stack??e.message:String(e);}
  const entry={gate:name,command:"independent evidence assertions",status:error?"FAIL":"PASS",exitCode:error?1:0,
    elapsedMs:Math.round(performance.now()-started),log:`${name}.log`};
  writeFileSync(join(directory,entry.log),error||"All independent evidence assertions passed\n");
  gates.push(entry);console.log(`${name}: ${entry.status}`);
}
const env={LCXXVI_VERIFY_DIR:inherited,LCXXVI_BROWSER_EVIDENCE_DIR:browser};
const inherit=run("inherited-07a",["npm","run","verify:07a"],env,900_000);
let prior;
try{prior=JSON.parse(readFileSync(join(inherited,"pass07a-results.json"),"utf8"));}catch{prior=null;}
inspect("inherited-exact-16",()=>{
  if(inherit.status!=="PASS"||prior?.status!=="PASS"||prior.allGateCount!==16||prior.passedGateCount!==16||
    prior.gates?.some(g=>g.status!=="PASS"))throw new Error("FRESH_07A_16_GATE_REJECTION");
});
run("frozen-07a-artifacts",["npm","run","t20:inventory"]);
run("independent-t20-rules",["npm","run","t20:rules"]);
const corpusRun=run("node-100-replay-resimulation",["npm","run","corpus:node"],{LCXXVI_CORPUS_DIR:corpus},240_000);
inspect("node-oracle-exact-100",()=>{
  if(corpusRun.status!=="PASS")throw new Error("NODE_CORPUS_NOT_PASS");
  const summary=JSON.parse(readFileSync(join(corpus,"corpus-summary.json"),"utf8"));
  const fresh=JSON.parse(readFileSync(join(corpus,"node-corpus-oracle.json"),"utf8"));
  const oracle=JSON.parse(readFileSync("tests/fixtures/t20/node-corpus-oracle.json","utf8"));
  if(summary.matchCount!==100||summary.replayPassed!==100||summary.resimulationPassed!==100||fresh.length!==100||
    oracle.length!==100||summary.inputCorpusSha256!==hash("tests/fixtures/t20/seed_corpus.json"))throw new Error("INCOMPLETE_NODE_CORPUS");
  for(let i=0;i<100;i++){
    const record=Object.fromEntries(Object.entries(fresh[i]).filter(([key])=>key!=="elapsedMs"));if(JSON.stringify(record)!==JSON.stringify(oracle[i]))throw new Error(`NODE_CORPUS_DIFFERENCE_${i}`);
    if(!record.replay||!record.resimulation)throw new Error(`REPLAY_NOT_PROVED_${i}`);
    if(!existsSync(join(corpus,`${record.caseId}.events.json`))||
       !existsSync(join(corpus,`${record.caseId}.scorecard.json`))||
       !existsSync(join(corpus,`${record.caseId}.chain.json`)))throw new Error(`MISSING_CANONICAL_EVENT_FILES_${i}`);
  }
});
inspect("chromium-firefox-100-main-worker",()=>{
  const results={};for(const name of ["chromium","firefox"]){
    const observed=[];const versions=new Set();let main=0,worker=0;
    for(let group=1;group<=4;group++){
      const file=join(browser,`${name}-${group}.json`);if(!existsSync(file))throw new Error(`MISSING_BROWSER_${file}`);
      const x=JSON.parse(readFileSync(file,"utf8"));
      if(x.browser!==name||x.status!=="PASS"||x.mainThreadMatches!==25||x.workerMatches!==25||
        x.cases?.length!==25||x.reference!=="node-corpus-oracle.json")throw new Error(`BAD_BROWSER_EVIDENCE_${file}`);
      observed.push(...x.cases);versions.add(x.version);main+=x.mainThreadMatches;worker+=x.workerMatches;
    }
    if(observed.length!==100||new Set(observed).size!==100||main!==100||worker!==100)throw new Error(`INCOMPLETE_BROWSER_${name}`);
    results[name]={versions:[...versions],mainThreadMatches:main,workerMatches:worker};
  }
  writeFileSync(join(directory,"browser-coverage.json"),JSON.stringify(results,null,2)+"\n");
});
run("compiled-cli-complete-match",["npm","run","batch","--","match-t20","tests/fixtures/world/t20-valid-setup.json",sample],{},120_000);
run("compiled-cli-pure-replay",["npm","run","batch","--","replay-t20",sample+".manifest.json"],{},60_000);
inspect("compiled-cli-sample-reconciliation",()=>{
  const score=JSON.parse(readFileSync(sample+".scorecard.json","utf8")),events=JSON.parse(readFileSync(sample+".events.json","utf8"));
  const archive=JSON.parse(readFileSync(sample+".manifest.json","utf8"));
  if(events.length!==329||archive.chain.eventCount!==329||score.innings.length!==2||
    score.innings[0].runs!==107||score.innings[1].runs!==96||score.result.marginRuns!==11||
    score.innings[0].legalBalls!==120||score.innings[1].legalBalls!==106)throw new Error("CLI_SCORECARD_REGRESSION");
});
const mandatory=[...prior?.gates??[],...gates],accepted=prior?.gates?.length===16&&gates.length===10&&
  mandatory.every(g=>g.status==="PASS");
const results={version:"LC_PASS_07B_ACCEPTANCE_V1",status:accepted?"PASS":"FAIL_OR_BLOCKED",
  startedAtUTC:now,verifiedAtUTC:new Date().toISOString(),node:process.version,
  npm:spawnSync("npm",["--version"],{encoding:"utf8"}).stdout.trim(),platform:process.platform,architecture:process.arch,
  inheritedPass07aSourceCommit:"98a232dc9ef18108d55cd9b3f2b57f1a16013853",
  inheritedSourceZipSha256:"34e5ed0708672ad9fd5ac4b4a85e00afdad94457d673aaa0686cdb3e5c856301",
  lockfileSha256:hash("package-lock.json"),frozenInventorySha256:hash("tests/fixtures/t20/pass07a-inventory.json"),
  independentRulesSha256:hash("tests/fixtures/t20/independent-expectations.json"),
  inputCorpusSha256:hash("tests/fixtures/t20/seed_corpus.json"),
  nodeOracleSha256:hash("tests/fixtures/t20/node-corpus-oracle.json"),
  inheritedCount:prior?.gates?.length??0,newGateCount:gates.length,mandatoryGateCount:mandatory.length,
  passedCount:mandatory.filter(g=>g.status==="PASS").length,
  nodeMatches:100,browserMatches:100,chromiumMainWorker:100,firefoxMainWorker:100,
  fullCorpusDirectory:corpus,browserEvidenceDirectory:browser,
  milestones:{M0:"INHERITED_07A_VERIFIED",M1:"SUPPORTED_SCORING_VERIFIED_ONLY",M2:accepted?"COMPLETE":"INCOMPLETE",M3:"INCOMPLETE",M4:"INCOMPLETE"},
  limitations:["HEADLESS_ONLY","SYNTHETIC_ALPHA_NOT_EMPIRICALLY_CALIBRATED","NO_DURABLE_PERSISTENCE","NO_DLS","UNSIGNED_HASHES_NOT_AUTHENTICATION"],
  gates:mandatory};
writeFileSync(join(directory,"pass07b-results.json"),JSON.stringify(results,null,2)+"\n");
console.log(`PASS 07B ${results.status} (${results.passedCount}/${results.mandatoryGateCount} gates)`);
process.exitCode=accepted?0:1;
