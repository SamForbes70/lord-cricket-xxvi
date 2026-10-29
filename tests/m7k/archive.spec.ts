/** Checks isolated archive reconstruction in fresh Chromium and Firefox contexts. */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mirrorEnds } from "../support/m7k-orientation.js";
import { createLedger, execute, exportArchive, importArchive, hash, replay } from "../../scripts/research/m7k-ledger.js";
const fixtures = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8"));
for (const original of fixtures.cases) for (const mirrored of [false, true]) {
  const fixture = mirrored ? mirrorEnds(original) : original;
  test(`${fixture.id}: ${mirrored ? "mirrored" : "original"} ends import and recover in fresh contexts`, async ({ browser }) => {
    const empty = createLedger(fixture.seed);
    let accepted = empty;
    for (const command of fixture.commands) accepted = execute(accepted, command);
    expect(accepted.projection).toMatchObject(fixture.expected);
    for (let prefix = 0; prefix <= accepted.events.length; prefix += 1) {
      const initial = replay(accepted.seed, accepted.events.slice(0, prefix));
      const context = await browser.newContext();
      try {
        const page = await context.newPage(); await page.goto("/");
        const result = await page.evaluate(({ archive, tail }) => window.m7kArchiveCheck(archive, tail), { archive: exportArchive(initial), tail: accepted.events });
        expect(result.hash).toBe(hash(accepted.projection)); expect(result.events).toBe(accepted.events.length);
        expect(importArchive(result.archive)).toEqual(accepted);
      } finally { await context.close(); }
    }
  });
}
test("browser rejects damaged checkpoints and v1/version substitutions", async ({ page }) => {
  await page.goto("/");
  const archive = JSON.parse(exportArchive(createLedger(fixtures.cases[0].seed)));
  for (const damaged of [{ ...archive, version: "LC_T20_MATCH_V1" }, { ...archive, model: "synthetic-alpha-01" }, { ...archive, checkpoint: { sequence: 0, projectionHash: "bad" } }]) {
    const rejected = await page.evaluate(raw => { try { window.m7kArchiveCheck(raw, []); return false; } catch { return true; } }, JSON.stringify(damaged));
    expect(rejected).toBe(true);
  }
});
