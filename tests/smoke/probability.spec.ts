import { test, expect } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import vectors from "../fixtures/probability/vectors.json" with { type: "json" };
import { executeProbabilityRequest } from "@lcxxvi/simulation";

const version = {
  probabilityVersion: "LC_INTEGER_PROBABILITY_V1",
  modelId: "synthetic-alpha-01",
  modelHash: vectors.modelHash,
  lutVersion: "LC_EXP_LUT_V1",
  lutHash: vectors.lutHash,
} as const;

test("Node, browser and worker agree on independent probability vectors", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4174");
  await page.waitForFunction(() => Boolean(window.determinism));
  for (const v of vectors.cases) {
    const base = { ...version, categories: v.categories };
    const normal = { kind: "NORMALISE_CATEGORIES", ...base };
    const sample = {kind:"SAMPLE_CATEGORY",...base,randomVersion:"SHA256_COUNTER_V1",stageName:v.address.stageName,address:v.address};
    const expectedSample = {
      kind:"SAMPLE_CATEGORY",...version,totalMass:4294967296,categories:v.masses,
      draw:v.draw,selectedIndex:v.selectedIndex,selectedCategoryId:v.selectedCategoryId,
    };
    const expectedNormal = {kind:"NORMALISE_CATEGORIES",...version,totalMass:4294967296,categories:v.masses};
    expect(executeProbabilityRequest(normal)).toEqual(expectedNormal);
    expect(executeProbabilityRequest(sample)).toEqual(expectedSample);
    const runtime = await page.evaluate(async ({normal,sample}) => ({
      normal: window.determinism.probability(normal),
      sampled: window.determinism.probability(sample),
      workerNormal: await window.determinism.inWorker(normal),
      workerSample: await window.determinism.inWorker(sample),
    }), { normal,sample });
    expect(runtime).toEqual({
      normal: expectedNormal,
      sampled: expectedSample,
      workerNormal:{ok:true,result:expectedNormal},
      workerSample:{ok:true,result:expectedSample},
    });
  }
  const fixture = vectors.cases[10]!;
  const request = {kind:"SAMPLE_CATEGORY",...version,
    categories:fixture.categories,stageName:"legality",randomVersion:"SHA256_COUNTER_V1",address:fixture.address};
  const recovery = await page.evaluate(async request => ({
    original: await window.determinism.inWorker(request),
    rejected: await window.determinism.inWorker({...request,modelHash:"0".repeat(64)}),
    prediction: await window.determinism.inWorker({...request,address:{...request.address,domain:"PREDICTION"}}),
    replay: await window.determinism.inWorker(request),
  }),request);
  expect(recovery.rejected).toMatchObject({ok:false});
  expect(recovery.prediction).toMatchObject({ok:true});
  expect(recovery.replay).toEqual(recovery.original);
  expect(errors).toEqual([]);
  mkdirSync("docs/evidence",{recursive:true});
  writeFileSync(`docs/evidence/probability-${browser.browserType().name()}.json`,
    JSON.stringify({status:"PASS",browser:browser.browserType().name(),browserVersion:browser.version(),
      vectors:vectors.cases.length,independentPythonReference:true,mainThreadAndWorker:true,
      errorRecovery:true,predictionIsolation:true},null,2)+"\n");
});

test("compiled batch probability command matches independent vector and rejects a wrong request", () => {
  const output = JSON.parse(execFileSync(process.execPath,
    ["apps/batch/dist/index.js","sample-category","tests/fixtures/probability/request-sample.json"],
    {encoding:"utf8"}));
  const expected = vectors.cases[10]!;
  expect(output).toMatchObject({
    kind:"SAMPLE_CATEGORY", modelHash:vectors.modelHash,lutHash:vectors.lutHash,
    totalMass:4294967296,categories:expected.masses,draw:expected.draw,
    selectedCategoryId:expected.selectedCategoryId,selectedIndex:expected.selectedIndex,
  });
  const normalised = JSON.parse(execFileSync(process.execPath,
    ["apps/batch/dist/index.js","probability","tests/fixtures/probability/request-normalise.json"],
    {encoding:"utf8"}));
  expect(normalised).toMatchObject({kind:"NORMALISE_CATEGORIES",totalMass:4294967296,
    categories:vectors.cases[10]!.masses});
  const bad = spawnSync(process.execPath,
    ["apps/batch/dist/index.js","probability","tests/fixtures/probability/request-sample.json"],
    {encoding:"utf8"});
  expect(bad.status).toBe(1);
  expect(bad.stderr).toMatch(/COMMAND_REQUEST_KIND_MISMATCH/);
});
