import {test,expect} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import oracle from "../fixtures/t20/node-corpus-oracle.json" with {type:"json"};
const keys=["caseId","seed","eventCount","attempts","eventsSha256","scorecardSha256",
  "finalEventHash","finalStateHash","scores","result","replay"] as const;
function normalize(value:Record<string,unknown>){return Object.fromEntries(keys.map(k=>[k,value[k]]));}
// All 100 accepted input cases, run in *each* supported browser on both main thread
// and a distinct Worker. No ten-seed substitution or sampling of the corpus.
for(let group=0;group<4;group++){
  const records=oracle.slice(group*25,(group+1)*25);
  test(`Node, browser main and browser Worker agree on complete T20 corpus ${group*25+1}-${(group+1)*25}`,async({page,browser})=>{
    test.setTimeout(180_000);
    expect(oracle).toHaveLength(100);
    const pageErrors:string[]=[];
    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.goto("http://127.0.0.1:4174");
    await page.waitForFunction(()=>typeof window.determinism?.runT20Fixed==="function" && typeof window.determinism?.t20InWorker==="function");
    const results=await page.evaluate(async ids=>{
      const answers=[] as Array<{direct:unknown;worker:unknown}>;
      for(const caseId of ids){
        const direct=window.determinism.runT20Fixed(caseId);
        const worker=await window.determinism.t20InWorker(caseId);
        answers.push({direct,worker});
      }
      return answers;
    },records.map(r=>r.caseId));
    expect(results).toHaveLength(25);
    for(let index=0;index<25;index++){
      const expectNode=normalize(records[index]! as Record<string,unknown>);
      const observed=results[index]!;
      expect(normalize(observed.direct as Record<string,unknown>),`direct ${records[index]!.caseId}`).toEqual(expectNode);
      expect((observed.worker as {ok:boolean}).ok,`worker ${records[index]!.caseId}`).toBe(true);
      expect(normalize((observed.worker as {result:Record<string,unknown>}).result),`worker ${records[index]!.caseId}`).toEqual(expectNode);
    }
    expect(pageErrors).toEqual([]);
    const dir=process.env.LCXXVI_BROWSER_EVIDENCE_DIR??"docs/verification-pass07b/browser";
    mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,`${browser.browserType().name()}-${group+1}.json`),JSON.stringify({
      browser:browser.browserType().name(),version:browser.version(),cases:records.map(r=>r.caseId),
      mainThreadMatches:25,workerMatches:25,reference:"node-corpus-oracle.json",status:"PASS"},null,2)+"\n");
  });
}
