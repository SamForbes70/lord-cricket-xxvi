/** Pass 07B: 100 fixed-input complete matches, one engine, no invented independent oracle. */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {performance} from "node:perf_hooks";
import {canonicalJson} from "@lcxxvi/contracts";
import {validateT20MatchSetup,createT20CorpusRequest,runFixtureT20,projectT20Scorecard,
  eventChainManifest,replayT20Events,resimulateT20Commands,canonicalStateBytes,sha256Hex} from "@lcxxvi/simulation";
const bytes=readFileSync("packages/data/worlds/fictional-eight-01.json");
const world=JSON.parse(bytes.toString("utf8"));
const manifest=JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));
const base=JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json","utf8"));
const corpus=JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json","utf8")) as {recordCount:number;cases:unknown[]};
if(corpus.recordCount!==100 || corpus.cases.length!==100)throw new Error("BAD_INPUT_CORPUS_COUNT");
const output=process.env.LCXXVI_CORPUS_DIR??"docs/verification-pass07b/corpus";mkdirSync(output,{recursive:true});
const results=[] as Array<{caseId:string;seed:string;teamIds:string[];groundId:string;
  eventCount:number;attempts:number;eventsSha256:string;scorecardSha256:string;finalEventHash:string;
  finalStateHash:string;scores:number[][];result:unknown;replay:boolean;resimulation:boolean;elapsedMs:number}>;
for(const raw of corpus.cases){
  const record=raw as {caseId:string;seed:string;teamIds:string[];groundId:string};
  const start=performance.now();
  const request=createT20CorpusRequest(raw,base,world),setup=validateT20MatchSetup(request,bytes,manifest);
  const game=runFixtureT20(setup),chain=eventChainManifest(game);
  const replay=replayT20Events(setup,game.events,chain);
  if(canonicalJson(game.core)!==canonicalJson(replay.core))throw new Error(`REPLAY_DIVERGENCE_${record.caseId}`);
  resimulateT20Commands(game);
  const scorecard=projectT20Scorecard(game);
  const eventsSha256=sha256Hex(canonicalStateBytes(game.events));
  const scorecardSha256=sha256Hex(canonicalStateBytes(scorecard));
  const result={caseId:record.caseId,seed:record.seed,teamIds:record.teamIds,groundId:record.groundId,
    eventCount:game.events.length,attempts:game.core.globalAttemptOrdinal,eventsSha256,scorecardSha256,
    finalEventHash:chain.finalEventHash,finalStateHash:chain.finalStateHash,
    scores:scorecard.innings.map(i=>[i.runs,i.wickets,i.legalBalls]),result:scorecard.result,
    replay:true,resimulation:true,elapsedMs:Math.round(performance.now()-start)};
  results.push(result);
  writeFileSync(join(output,`${record.caseId}.events.json`),canonicalJson(game.events)+"\n");
  writeFileSync(join(output,`${record.caseId}.scorecard.json`),canonicalJson(scorecard)+"\n");
  writeFileSync(join(output,`${record.caseId}.chain.json`),canonicalJson(chain)+"\n");
  console.log(`${record.caseId}: ${result.scores.map(s=>s.join('/')).join(' v ')} events=${result.eventCount} replay+resim=PASS elapsed=${result.elapsedMs}ms`);
}
writeFileSync(join(output,"node-corpus-oracle.json"),JSON.stringify(results,null,2)+"\n");
const summary={version:"LC_T20_100_MATCH_CORPUS_V1",inputCorpusSha256:sha256Hex(readFileSync("tests/fixtures/t20/seed_corpus.json")),
  matchCount:100,replayPassed:100,resimulationPassed:100,
  totalAttempts:results.reduce((n,r)=>n+r.attempts,0),
  recordsSha256:sha256Hex(canonicalStateBytes(results)),matches:results};
writeFileSync(join(output,"corpus-summary.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({status:"PASS",count:100,inputCorpusSha256:summary.inputCorpusSha256,
  recordsSha256:summary.recordsSha256,totalAttempts:summary.totalAttempts}));
