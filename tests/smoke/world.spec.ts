import { test, expect } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const vectors = JSON.parse(readFileSync("packages/data/worlds/world-generation-vectors.json", "utf8")) as {
  vectors: {address: unknown;expectedUint32:number}[];
};

test("Node, browser and worker agree on the frozen 07A WORLD_GENERATION addresses", async ({ page, browser }) => {
  await page.goto("http://127.0.0.1:4174");
  await page.waitForFunction(() => Boolean(window.determinism?.execute));
  for (const {address,expectedUint32} of vectors.vectors) {
    const output = await page.evaluate(async address => {
      const request = {kind:"RANDOM",version:"SHA256_COUNTER_V1",address};
      return {direct:window.determinism.execute(request),worker:await window.determinism.inWorker(request)};
    },address);
    expect(output.direct).toMatchObject({uint32:expectedUint32});
    expect(output.worker).toMatchObject({ok:true,result:{uint32:expectedUint32}});
  }
  expect(vectors.vectors).toHaveLength(12);
  expect(["chromium","firefox"]).toContain(browser.browserType().name());
});

test("compiled batch validates frozen world, immutable setup and rejects tampered input", () => {
  const result = JSON.parse(execFileSync(process.execPath,["apps/batch/dist/index.js","validate-world"],{encoding:"utf8"}));
  expect(result).toMatchObject({status:"PASS", counts:{players:160,teams:8,grounds:8},modelStatus:"SYNTHETIC_ALPHA"});
  const setup = JSON.parse(execFileSync(process.execPath,["apps/batch/dist/index.js","setup-t20","tests/fixtures/world/t20-valid-setup.json"],{encoding:"utf8"}));
  expect(setup.teams.map((t:{xi:unknown[]})=>t.xi.length)).toEqual([11,11]);
  expect(setup.fixtureOnly).toBe(true);
  const badDir=mkdtempSync(join(tmpdir(),"lcxxvi-world-bad-"));
  try {
    const bad=JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json","utf8"));
    bad.setup.capabilities.prediction=true;
    const badPath=join(badDir,"bad.json");
    writeFileSync(badPath,JSON.stringify(bad));
    const rejected=spawnSync(process.execPath,["apps/batch/dist/index.js","setup-t20",badPath],{encoding:"utf8"});
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/unsupported gameplay capability/);
    const missing=spawnSync(process.execPath,["apps/batch/dist/index.js","validate-world",badPath],{encoding:"utf8"});
    expect(missing.status).toBe(1);
  } finally {rmSync(badDir,{recursive:true,force:true});}
});
