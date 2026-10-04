import worldText from "../../packages/data/worlds/fictional-eight-01.json?raw";
import manifest from "../../packages/data/worlds/fictional-eight-01.manifest.json" with {type:"json"};
import corpus from "../fixtures/t20/seed_corpus.json" with {type:"json"};
import fixture from "../fixtures/world/t20-valid-setup.json" with {type:"json"};
import {validateT20MatchSetup,runFixtureT20,projectT20Scorecard,eventChainManifest,replayT20Events,
  canonicalStateBytes,sha256Hex,createT20CorpusRequest} from "@lcxxvi/simulation";
/** Same imported TS engine in browser, verification worker and Node; only fixture data is bundled here. */
export function runT20Fixed(caseId:string){
  const record=corpus.cases.find(c=>c.caseId===caseId);if(!record)throw new Error("UNKNOWN_CORPUS_CASE");
  const input=createT20CorpusRequest(record,fixture,JSON.parse(worldText));
  const setup=validateT20MatchSetup(input,new TextEncoder().encode(worldText),manifest);
  const session=runFixtureT20(setup);
  const anchor=eventChainManifest(session);
  const replay=replayT20Events(setup,session.events,anchor);
  const scorecard=projectT20Scorecard(session);
  if(replay.lastEventHash!==session.lastEventHash)throw new Error("MISMATCH_REPLAY");
  return {caseId,seed:record.seed,eventCount:session.events.length,attempts:session.core.globalAttemptOrdinal,
    eventsSha256:sha256Hex(canonicalStateBytes(session.events)),scorecardSha256:sha256Hex(canonicalStateBytes(scorecard)),
    finalEventHash:anchor.finalEventHash,finalStateHash:anchor.finalStateHash,
    scores:scorecard.innings.map(i=>[i.runs,i.wickets,i.legalBalls]),result:scorecard.result,
    replay:true};
}
