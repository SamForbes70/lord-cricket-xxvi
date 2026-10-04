import { test,expect } from '@playwright/test';
import { execFileSync,spawnSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import request from '../fixtures/generator/base-request.json' with {type:'json'};
import vectors from '../fixtures/generator/reference-vectors.json' with {type:'json'};
import { generateDelivery } from '@lcxxvi/simulation';

test('Node, browser and worker agree on the frozen generator vectors',async({page,browser})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  await page.waitForFunction(()=>Boolean(window.determinism?.generator));
  for(const v of vectors.fixtures) {
    const input={...request,seed:v.seed};
    const expected=generateDelivery(input);
    expect(expected.trace.map((t)=>({stageName:t.stageName,drawIndex:t.address.drawIndex,
      draw:t.draw,selectedCategoryId:t.selectedCategoryId}))).toEqual(v.trace.map(t=>({
        stageName:t.stageName,drawIndex:t.drawIndex,draw:t.draw,selectedCategoryId:t.selectedCategoryId})));
    const runtime=await page.evaluate(async(input)=>({
      direct:window.determinism.generator(input),
      worker:await window.determinism.inWorker(input),
    }),input);
    expect(runtime).toEqual({direct:expected,worker:{ok:true,result:expected}});
  }
  const input={...request,seed:'pass06-independent-35'};
  const recovery=await page.evaluate(async input=>({
    one:await window.determinism.inWorker(input),
    unsupported:await window.determinism.inWorker({...input,stagePackHash:'0'.repeat(64)}),
    prediction:await window.determinism.inWorker({kind:'RANDOM',version:'SHA256_COUNTER_V1',
      address:{seed:input.seed,domain:'PREDICTION',entityId:'prediction-fixture',
        eventOrdinal:0,stageName:'contact',drawIndex:0}}),
    again:await window.determinism.inWorker(input),
  }),input);
  expect(recovery.unsupported).toMatchObject({ok:false});
  expect(recovery.prediction).toMatchObject({ok:true});
  expect(recovery.again).toEqual(recovery.one);
  expect(errors).toEqual([]);
  mkdirSync('docs/evidence',{recursive:true});
  writeFileSync(`docs/evidence/generator-${browser.browserType().name()}.json`,
    JSON.stringify({status:'PASS',browser:browser.browserType().name(),
      version:browser.version(),vectors:vectors.fixtures.length,
      mainThreadAndWorker:true,predictionIsolation:true,errorRecovery:true},null,2)+'\n');
});
test('compiled batch generator command hands validated resolution to scoring adapter',()=>{
  const output=JSON.parse(execFileSync(process.execPath,
    ['apps/batch/dist/index.js','generate-delivery','tests/fixtures/generator/base-request.json'],
    {encoding:'utf8'}));
  expect(output.generated).toEqual(generateDelivery(request));
  expect(output.scored.event.type).toBe('DELIVERY_RECORDED');
  const invalid=spawnSync(process.execPath,
    ['apps/batch/dist/index.js','generate-delivery','tests/fixtures/probability/request-sample.json'],
    {encoding:'utf8'});
  expect(invalid.status).toBe(1);
});
