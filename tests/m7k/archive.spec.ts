/** Checks isolated archive reconstruction in fresh Chromium and Firefox contexts. */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createLedger, execute, exportArchive, importArchive, hash } from "../../scripts/research/m7k-ledger.js";
const fixtures = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8"));
test("fresh browser imports and recovers a candidate without changing the v1 path", async ({ browser }) => {
  const fixture = fixtures.cases[1], empty = createLedger(fixture.seed), accepted = execute(empty, fixture.commands[0]);
  for (const initial of [empty, accepted]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage(); await page.goto("/");
      const result = await page.evaluate(({ archive, tail }) => window.m7kArchiveCheck(archive, tail), { archive: exportArchive(initial), tail: accepted.events });
      expect(result.hash).toBe(hash(accepted.projection)); expect(result.events).toBe(1); expect(importArchive(result.archive)).toEqual(accepted);
    } finally { await context.close(); }
  }
});
test("browser rejects damaged checkpoints and v1/version substitutions", async ({ page }) => {
  await page.goto("/");
  const archive = JSON.parse(exportArchive(createLedger(fixtures.cases[0].seed)));
  for (const damaged of [{ ...archive, version: "LC_T20_MATCH_V1" }, { ...archive, model: "synthetic-alpha-01" }, { ...archive, checkpoint: { sequence: 0, projectionHash: "bad" } }]) {
    const rejected = await page.evaluate(raw => { try { window.m7kArchiveCheck(raw, []); return false; } catch { return true; } }, JSON.stringify(damaged));
    expect(rejected).toBe(true);
  }
});
