/** Runs the frozen scenario grid; its policies cannot replace the gameplay model. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "@lcxxvi/contracts";
import { validateT20MatchSetup, verifyFrozenWorldBytes } from "@lcxxvi/simulation";
import { QUALITY_POLICIES, qualityScenarioRequests, runQualityScenario, summariseQualityScenarios,
  type QualityScenarioResult } from "../apps/batch/src/quality-scenarios.js";

const args = process.argv.slice(2);
if (args.some(arg => !/^--(?:seeds-per-cell|out)=.+$/.test(arg))) throw new Error("QUALITY_UNKNOWN_ARGUMENT");
for (const name of ["seeds-per-cell", "out"]) {
  if (args.filter(arg => arg.startsWith(`--${name}=`)).length > 1) throw new Error("QUALITY_DUPLICATE_ARGUMENT");
}
const count = Number(args.find(arg => arg.startsWith("--seeds-per-cell="))?.slice("--seeds-per-cell=".length) ?? "2");
const output = args.find(arg => arg.startsWith("--out="))?.slice(6);
const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const { world } = verifyFrozenWorldBytes(worldBytes, manifest);
const requests = qualityScenarioRequests(template, world, count);
const protocol = { version: "LC_M7_SCENARIO_GRID_V1", seedsPerCell: count, scenarios: requests.length,
  teamPairing: "Sorted adjacent teams; all eight teams, four pairings, all eight grounds.",
  selection: "Existing corpus XI selector; each keeper and six bowling-capable players retained.",
  policies: QUALITY_POLICIES, modelId: template.setup.modelId, modelHash: template.modelHash,
  rulesHash: template.rulesHash, stagePackHash: template.stagePackHash,
  worldSha256: createHash("sha256").update(worldBytes).digest("hex"),
  scenariosList: requests.map(request => ({ matchId: request.setup.matchId, seed: request.setup.seed,
    groundId: request.setup.groundId, selectedTeams: request.selectedTeams })) };
const protocolSha256 = createHash("sha256").update(canonicalJson(protocol)).digest("hex");
// Write the declared cohort before simulation, so the results cannot select its cells.
if (output) writeFileSync(`${output}.protocol.json`, JSON.stringify({ ...protocol, protocolSha256 }, null, 2) + "\n");
const rows: QualityScenarioResult[] = [];
let repeatedRuns = 0;
for (const [index, request] of requests.entries()) {
  const setup = validateT20MatchSetup(request, worldBytes, manifest);
  for (const policy of QUALITY_POLICIES) {
    const result = runQualityScenario(setup, policy);
    // Repeat the first seed in every cell, rather than reporting one seed as complete grid coverage.
    if (index % count === 0) {
      if (canonicalJson(result) !== canonicalJson(runQualityScenario(setup, policy))) throw new Error("QUALITY_REPEAT_DIVERGENCE");
      repeatedRuns++;
    }
    rows.push(result);
  }
}
const summary = summariseQualityScenarios(rows);
const byGround = world.grounds.map(ground => ({ groundId: ground.groundId,
  summary: summariseQualityScenarios(rows.filter(row => row.groundId === ground.groundId)) }));
const byPair = [...new Set(rows.map(row => row.teamIds[0]!))].map(teamId => ({ teamId,
  summary: summariseQualityScenarios(rows.filter(row => row.teamIds.includes(teamId))) }));
const report = { version: "LC_M7_SCENARIO_DIAGNOSTIC_V1", status: "DESCRIPTIVE_SYNTHETIC_ONLY",
  modelStatus: "SYNTHETIC_ALPHA", gameplayIntegrationPermitted: false, coefficientsChanged: false,
  empiricallyValidated: false, protocolSha256, repeatedRuns, scenarioPairs: requests.length, policyRuns: rows.length,
  limits: ["Four pairings do not cover every possible opponent or XI.",
    "Paired policies share initial seeds, not guaranteed identical later draw addresses or match states.",
    "Policy differences are simulator comparisons, not independently validated causal tactical effects.",
    "Only first innings feed score-distribution comparisons; chase endings are reported separately.",
    "Plan histograms observe accepted commands; they do not expose or reconstruct conditional probability tables."],
  summary, byGround, byPair, rows };
const text = JSON.stringify(report, null, 2) + "\n";
if (output) writeFileSync(output, text); else process.stdout.write(text);
