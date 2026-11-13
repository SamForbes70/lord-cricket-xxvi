#!/usr/bin/env node
/**
 * V01-024 follow-up (13 November 2026): re-runs the synthetic quality sweeps and the exploitation-policy
 * comparison at larger sample sizes than the release gate, with the default seed prefixes, and writes
 * docs/verification-v01-batch7-diagnostics/follow-up-results.json.
 *
 *   npm run build
 *   node scripts/v01-024-followup.mjs [deliveriesPerCell=3000] [matchesPerPolicy=80]
 *
 * It changes no result-generating behaviour and makes no empirical claim. It needs the built packages (dist).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { validateT20MatchSetup } from "../packages/simulation/dist/index.js";
import { runPairedSkillFieldPitchSweep, runT20ExploitationPolicyPairs } from "../apps/batch/dist/exploitation-gates.js";

const deliveries = Number(process.argv[2] ?? 3000);
const matches = Number(process.argv[3] ?? 80);
const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));

const started = new Date().toISOString();
const sweeps = ["T20", "ODI", "RED_BALL"].map((format) => {
  const s = runPairedSkillFieldPitchSweep({ format, sampleCount: deliveries });
  return { format, deliveriesPerCell: deliveries, monotonicityChecks: s.monotonicityChecks, skills: s.skills, pitches: s.pitches, fields: s.fields };
});
const setups = Array.from({ length: matches }, (_, idx) =>
  validateT20MatchSetup({ ...template, setup: { ...template.setup, matchId: `v01-024-fu-m-${idx}`, gameId: `v01-024-fu-g-${idx}`, seed: `LC_V01_024_FOLLOWUP:${idx}` } }, worldBytes, manifest));
const policies = runT20ExploitationPolicyPairs(setups);

const result = {
  schema: "LC_V01_024_FOLLOW_UP_V1",
  startedAtUtc: started,
  completedAtUtc: new Date().toISOString(),
  modelStatus: "SYNTHETIC_ALPHA",
  empiricallyCalibrated: false,
  coefficientsChanged: false,
  parameters: { deliveriesPerCell: deliveries, matchesPerPolicy: matches, seedPrefixes: "defaults (LC_V01_024_SWEEP for the sweeps)" },
  sweeps,
  policies: policies.policies ?? policies,
};
writeFileSync("docs/verification-v01-batch7-diagnostics/follow-up-results.json", JSON.stringify(result, null, 2) + "\n");
console.log("Wrote docs/verification-v01-batch7-diagnostics/follow-up-results.json");
for (const s of sweeps) console.log(s.format, JSON.stringify(s.monotonicityChecks));
for (const [name, v] of Object.entries(result.policies)) if (v && v.matches !== undefined) console.log(name.padEnd(30), "runs", v.meanFirstInningsRuns, "wkts", v.meanFirstInningsWickets, "allOut", `${v.allOutCount}/${v.matches}`);
