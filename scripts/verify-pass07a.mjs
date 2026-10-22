/** Final acceptance of M0. Never inherit a historical PASS from Pass 06. */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const directory=process.env.LCXXVI_VERIFY_DIR ?? "docs/verification-pass07a";
mkdirSync(directory,{recursive:true});
const startedAt=new Date().toISOString();
const unitTestsExpected=538;
const worldFixture=JSON.parse(readFileSync("tests/fixtures/world/negative-cases.json","utf8"));
const extra = [
  ["world-content",["run","world:check"],{assertions: "independent complete 160/8/8 audit, twelve vectors, world/manifest hashes, strict AJV >=91 (additive schemas allowed)"}],
  ["world-negative",["run","world:negative"],{testCount:28}],
  ["t20-setup",["run","t20:setup"],{testCount:20}],
  ["world-smoke",["run","world:smoke"],{testCount:3}],
];
const run=(executable,args,label,options={})=>{
  const began=performance.now();
  const result=spawnSync(executable,args,{encoding:"utf8",maxBuffer:16_000_000,
    timeout:label==="inherited-orchestrator"?720_000:240_000, env:options.env ?? process.env});
  const log=[result.stdout ?? "",result.stderr ?? "",result.error?.message ?? ""].join("\n");
  writeFileSync(join(directory,label+".log"),log);
  const status=result.error?.code==="ETIMEDOUT"?"BLOCKED":result.status===0?"PASS":"FAIL";
  const entry={gate:label,command:`${executable} ${args.join(" ")}`,exitCode:result.status,
    status,elapsedMs:Math.round(performance.now()-began),log:label+".log",
    ...(result.error?{error:result.error.message}:{})};
  console.log(`${label}: ${status}`);
  return entry;
};
const inheritedRun=run(process.execPath,["scripts/verify.mjs"],"inherited-orchestrator",{
  env:{...process.env,LCXXVI_VERIFY_DIR:directory}
});
let inherited=[];
try {inherited=JSON.parse(readFileSync(join(directory,"results.json"),"utf8")).gates;}
catch {console.log("Failed to retrieve fresh inherited gate result manifest");}
const extras=[];
for(const [name,args,metadata] of extra){
  const result=run("npm",args,name);
  extras.push({...result,...metadata});
}
const allGates=[...inherited.map(r=>({...r,log:r.gate+".log"})),...extras];
const accepted = inheritedRun.status==="PASS" && inherited.length===12 && allGates.length===16 &&
  allGates.every(g=>g.status==="PASS") &&
  extras.length===4 && worldFixture.cases.length===40;
const hash=(path)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const frozen={
 lockfile:hash("package-lock.json"),scoringCorpus:hash("tests/fixtures/scoring/corpus.json"),
 scoringIndex:hash("tests/fixtures/scoring/index.json"),
 randomVectors:hash("tests/fixtures/determinism/vectors.json"),
 probabilityVectors:hash("tests/fixtures/probability/vectors.json"),
 probabilityPackSource:hash("packages/data/src/probability-pack.ts"),
 deliveryStagePackSource:hash("packages/data/src/delivery-pack.ts"),
 worldFile:hash("packages/data/worlds/fictional-eight-01.json"),
 worldManifest:hash("packages/data/worlds/fictional-eight-01.manifest.json"),
 worldNegativeFixtures:hash("tests/fixtures/world/negative-cases.json"),
 worldSetupFixture:hash("tests/fixtures/world/t20-valid-setup.json"),
};
const result={version:"LC_PASS_07A_VERIFICATION_V1",status:accepted?"PASS":"FAIL",
 timestampUTC:new Date().toISOString(),startedAtUTC:startedAt,
 platform:process.platform,arch:process.arch,node:process.version,
 npm:spawnSync("npm",["--version"],{encoding:"utf8"}).stdout.trim(),
 firefoxContentSandboxDisabled:process.env.MOZ_DISABLE_CONTENT_SANDBOX==="1",
 originalVerifiedSourceZipSha256:"95e71cb5aae066885f73594d788e6df2edc54b4a1a6a49c12b365cc104af5648",
 inheritedGateCount:inherited.length, allGateCount:allGates.length,
 passedGateCount:allGates.filter(g=>g.status==="PASS").length,
 unitTestsExpected,smokeTestsExpected:23,negativeWorldCases:worldFixture.cases.filter(c=>c.target!=="setup").length,
 negativeSetupCases:worldFixture.cases.filter(c=>c.target==="setup").length,
 independentWorldAuditExpected:{players:160,teams:8,grounds:8,randomVectors:12},
 immutableSetupExpected:{format:"T20",xiCount:[11,11],setupVersion:"LC_T20_SETUP_V1"},
 frozen, gates:allGates,
 milestones:{M0:accepted?"COMPLETE":"PARTIAL_OR_FAILED",M1:"SUPPORTED_SCORING_VERIFIED_ONLY",M2:"INCOMPLETE"},
 playable:false};
writeFileSync(join(directory,"pass07a-results.json"),JSON.stringify(result,null,2)+"\n");
console.log(`07A acceptance ${result.status} (${result.passedGateCount}/${result.allGateCount} mandatory gates)`);
process.exitCode=accepted?0:1;
