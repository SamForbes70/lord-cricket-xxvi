/** Bounded SYNTHETIC_ALPHA quality and runtime diagnostic, NOT empirical calibration.
 * Usage: node --import tsx scripts/audit-m7-quality.ts --matches=16
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import os from "node:os";
import { validateT20MatchSetup, runFixtureT20, projectT20Scorecard, eventChainManifest } from "../packages/simulation/src/index.js";
import { projectT20MatchAnalytics } from "../packages/projections/src/index.js";

const arg = process.argv.find(x => x.startsWith("--matches="));
const matches = arg ? Number(arg.split("=")[1]) : 12;
if (!Number.isInteger(matches) || matches < 1 || matches > 10000) throw new Error("M7_INVALID_SAMPLE_COUNT");
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const times: number[] = [], scores: number[] = [], wickets: number[] = [];
let legalBalls = 0, attempts = 0, dot = 0, boundaries = 0, illegal = 0, totalEvents = 0;
let goldenHash = "";
for (let n = 0; n < matches; n++) {
  // Seed is an independent deterministic input to the existing engine, not a model adjustment.
  const raw = structuredClone(template);
  raw.setup.seed = `m7-statistical-quality-fixed-${String(n).padStart(5,"0")}`;
  const setup = validateT20MatchSetup(raw, world, manifest);
  const started = performance.now();
  const session = runFixtureT20(setup);
  times.push(performance.now() - started);
  const card = projectT20Scorecard(session);
  const analytics = projectT20MatchAnalytics(session.events, card);
  for (const i of card.innings) { scores.push(i.runs); wickets.push(i.wickets); }
  for (const e of session.events) if (e.type === "DELIVERY_RECORDED") {
    const d = e.payload as { event: { legalBall: boolean; legality: string; batRuns: number; extras: Record<string,number>; boundary: string } };
    attempts++;
    legalBalls += Number(d.event.legalBall);
    illegal += Number(d.event.legality === "WIDE" || d.event.legality === "NO_BALL");
    boundaries += Number(d.event.boundary === "FOUR" || d.event.boundary === "SIX");
    dot += Number(Object.values(d.event.extras).reduce((a,b)=>a+b, d.event.batRuns) === 0);
  }
  totalEvents += session.events.length;
  if (n === 0) {
    goldenHash = eventChainManifest(session).finalEventHash;
    const repeat = runFixtureT20(setup);
    if (eventChainManifest(repeat).finalEventHash !== goldenHash) throw new Error("M7_REPEAT_SEED_DIVERGENCE");
  }
  if (analytics.finalRuns.some((value,index) => value !== card.innings[index]!.runs)) throw new Error("M7_ANALYTIC_RECONCILIATION");
}
const percentile = (arr: number[], p: number) => {
  const ordered = [...arr].sort((a,b)=>a-b);
  return ordered[Math.ceil(p*ordered.length)-1] ?? 0;
};
const mean = (v: number[]) => v.reduce((a,b)=>a+b,0)/v.length;
const output = {
  auditVersion: "LC_M7_SYNTHETIC_QUALITY_DIAGNOSTIC_V1",
  status: "PASS_SYNTHETIC_DIAGNOSTICS_ONLY",
  modelStatus: "SYNTHETIC_ALPHA",
  empiricallyCalibrated: false,
  approvedRealDataset: false,
  statisticalInference: "DESCRIPTIVE_ONLY_NOT_REFERENCE_VALIDATED",
  matches, innings: scores.length,
  meanInningsRuns: mean(scores), meanInningsWickets: mean(wickets),
  scorePercentiles: { p10: percentile(scores,.10), p50: percentile(scores,.50), p90: percentile(scores,.90) },
  dotAttemptProportion: dot/attempts, boundaryAttemptProportion: boundaries/attempts,
  illegalAttemptProportion: illegal/attempts,
  deliveryAttempts: attempts, legalBalls, totalEvents,
  repeatabilityFirstSeedEventHash: goldenHash,
  runtime: {
    matchMsP50: percentile(times,.50), matchMsP95: percentile(times,.95), matchMsMax: Math.max(...times),
    totalMs: times.reduce((a,b)=>a+b,0),
    cpuModel: os.cpus()[0]?.model ?? "unknown", logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(), node: process.version, platform: process.platform,
    memoryRssBytes: process.memoryUsage().rss,
    browserMeasured: false,
    referenceLaptopGatePassed: false,
  },
  datasetSha256: createHash("sha256").update(world).digest("hex"),
};
console.log(JSON.stringify(output, null, 2));
