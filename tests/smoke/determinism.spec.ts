import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import vectors from "../fixtures/determinism/vectors.json" with { type: "json" };
import { executeDeterminismRequest } from "@lcxxvi/simulation";
import { RANDOM_VERSION, STATE_HASH_VERSION } from "@lcxxvi/contracts";

test("Node, browser and worker agree on every frozen address and state vector", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4174");
  await page.waitForFunction(() => Boolean(window.determinism));
  for (const v of vectors.addresses) {
    const request = {
      kind: "RANDOM",
      version: RANDOM_VERSION,
      address: v.address,
    };
    const expected = {
      kind: "RANDOM",
      version: RANDOM_VERSION,
      uint32: v.uint32,
      unit: v.unit,
    };
    expect(executeDeterminismRequest(request)).toEqual(expected);
    const result = await page.evaluate(
      async (request) => ({
        hex: window.determinism.addressHex(request.address),
        direct: window.determinism.execute(request),
        worker: await window.determinism.inWorker(request),
      }),
      request,
    );
    expect(result).toEqual({
      hex: v.utf8Hex,
      direct: expected,
      worker: { ok: true, result: expected },
    });
  }
  for (const v of vectors.states) {
    const request = {
      kind: "HASH_STATE",
      version: STATE_HASH_VERSION,
      value: v.value,
    };
    const expected = {
      kind: "HASH_STATE",
      version: STATE_HASH_VERSION,
      hash: v.sha256,
    };
    expect(executeDeterminismRequest(request)).toEqual(expected);
    const result = await page.evaluate(
      async (request) => ({
        hex: window.determinism.stateHex(request.value),
        direct: window.determinism.execute(request),
        worker: await window.determinism.inWorker(request),
      }),
      request,
    );
    expect(result).toEqual({
      hex: v.utf8Hex,
      direct: expected,
      worker: { ok: true, result: expected },
    });
  }
  expect(await page.evaluate(() => window.determinism.hashText("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const good = {
    kind: "RANDOM",
    version: RANDOM_VERSION,
    address: vectors.addresses[0]!.address,
  };
  const invalid = await page.evaluate(async (good) => {
    const first = await window.determinism.inWorker(good);
    const bad = await window.determinism.inWorker({
      ...good,
      version: "unsupported",
    });
    const prediction = await window.determinism.inWorker({
      ...good,
      address: { ...good.address, domain: "PREDICTION" },
    });
    const repeat = await window.determinism.inWorker(good);
    return { first, bad, prediction, repeat };
  }, good);
  expect(invalid.bad).toMatchObject({ ok: false });
  expect(invalid.prediction).toMatchObject({ ok: true });
  expect(invalid.repeat).toEqual(invalid.first);
  expect(errors).toEqual([]);
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(
    `docs/evidence/determinism-${browser.browserType().name()}.json`,
    JSON.stringify(
      {
        status: "PASS",
        browser: browser.browserType().name(),
        browserVersion: browser.version(),
        node: process.version,
        addressVectors: vectors.addresses.length,
        stateVectors: vectors.states.length,
        mainThreadAndWorker: true,
        invalidRequestRecovery: true,
        predictionIsolation: true,
      },
      null,
      2,
    ) + "\n",
  );
});

test("compiled batch random/hash commands match frozen outputs and reject bad requests", () => {
  const run = (command: string, file: string) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["apps/batch/dist/index.js", command, file],
        { encoding: "utf8" },
      ),
    );
  expect(
    run("random", "tests/fixtures/determinism/random-request.json"),
  ).toMatchObject({
    uint32: vectors.addresses[0]!.uint32,
    unit: vectors.addresses[0]!.unit,
  });
  expect(
    run("hash-state", "tests/fixtures/determinism/hash-request.json"),
  ).toMatchObject({ hash: vectors.states.at(-1)!.sha256 });
  const wrong = spawnSync(
    process.execPath,
    [
      "apps/batch/dist/index.js",
      "random",
      "tests/fixtures/determinism/hash-request.json",
    ],
    { encoding: "utf8" },
  );
  expect(wrong.status).toBe(1);
});
