/**
 * Project Pavilion B9: how well the chase win chance matches what happened, on the model's own 100-match corpus.
 *
 * The expectation table is built from first innings only; this evaluates on the second innings (the chases), which
 * the table never saw. At the start of every over of every chase it records the predicted chance and whether the
 * chasing side won, then reports the Brier score against two baselines and a calibration table. It also tests a
 * Platt recalibration with two-fold cross-validation (fit on half the matches, score on the other half); the game
 * ships the unrecalibrated estimate because that recalibration made the held-out score worse in both folds.
 *
 *   node --import tsx scripts/pavilion-win-chance-evaluate.ts [output.json]
 *
 * In-model evidence only: it says nothing about real cricket.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { validateT20MatchSetup, createT20CorpusRequest, runFixtureT20, projectT20Scorecard } from "@lcxxvi/simulation";
import { t20ChaseWinChanceRaw, T20_EXPECTATION_TABLE } from "@lcxxvi/projections";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };

type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; dismissal: unknown; extras: Record<string, number> };
const points: { p: number; won: 0 | 1; over: number; fold: 0 | 1 }[] = [];
let caseIndex = 0;
let chases = 0, chasesWon = 0;
for (const raw of corpus.cases) {
  const setup = validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest);
  const game = runFixtureT20(setup);
  const card = projectT20Scorecard(game);
  const target = card.innings[0]!.runs + 1;
  const won: 0 | 1 = card.innings[1]!.runs >= target ? 1 : 0;
  chases += 1; chasesWon += won;
  caseIndex += 1;
  let runs = 0, wickets = 0, legal = 0;
  const record = (over: number) => {
    const p = t20ChaseWinChanceRaw(target - runs, wickets, legal);
    if (p !== null) points.push({ p, won, over, fold: (caseIndex % 2) as 0 | 1 });
  };
  record(0);
  for (const r of game.events as { payload?: { event?: Delivery } }[]) {
    const e = r.payload?.event;
    if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex !== 1) continue;
    runs += e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
    if (e.dismissal) wickets += 1;
    if (e.legalBall) { legal += 1; if (legal % 6 === 0 && legal < 120 && wickets < 10 && runs < target) record(legal / 6); }
  }
}

const brierOf = (xs: typeof points, f: (x: (typeof points)[number]) => number) => xs.reduce((s, x) => s + (f(x) - x.won) ** 2, 0) / xs.length;
const brier = (f: (x: (typeof points)[number]) => number) => brierOf(points, f);
const clampP = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));
const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
/** Platt scaling: fit a and b in sigmoid(a + b * logit(p)) by Newton's method on the log loss. */
function platt(xs: typeof points): { a: number; b: number } {
  let a = 0, b = 1;
  for (let it = 0; it < 50; it += 1) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (const x of xs) {
      const z = logit(x.p), q = sigmoid(a + b * z), w = q * (1 - q);
      ga += q - x.won; gb += (q - x.won) * z; haa += w; hab += w * z; hbb += w * z * z;
    }
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    a -= (hbb * ga - hab * gb) / det; b -= (haa * gb - hab * ga) / det;
  }
  return { a: +a.toFixed(4), b: +b.toFixed(4) };
}
const folds = [0, 1].map((f) => {
  const fit = platt(points.filter((x) => x.fold !== f)), test = points.filter((x) => x.fold === f);
  return { heldOutFold: f, fit, raw: +brierOf(test, (x) => x.p).toFixed(4), recalibrated: +brierOf(test, (x) => sigmoid(fit.a + fit.b * logit(x.p))).toFixed(4) };
});
const shipped = platt(points);
const baseRate = chasesWon / chases;
const bands = (pts: typeof points) => [0, 0.1, 0.3, 0.5, 0.7, 0.9].map((lo, i, all) => {
  const hi = i === all.length - 1 ? 1.01 : all[i + 1]!;
  const inBand = pts.filter((x) => x.p >= lo && x.p < hi);
  return { from: lo, to: Math.min(hi, 1), points: inBand.length,
    meanPredicted: inBand.length ? +(inBand.reduce((s, x) => s + x.p, 0) / inBand.length).toFixed(3) : null,
    observedWinRate: inBand.length ? +(inBand.reduce((s, x) => s + x.won, 0) / inBand.length).toFixed(3) : null };
});
const result = {
  version: "LC_PAVILION_WIN_CHANCE_EVALUATION_V1",
  table: T20_EXPECTATION_TABLE.version,
  corpusSha256: T20_EXPECTATION_TABLE.inputCorpusSha256,
  chases, chasesWon, points: points.length,
  brier: { raw: +brier((x) => x.p).toFixed(4), baseRate: +brier(() => baseRate).toFixed(4), coinFlip: 0.25 },
  crossValidation: folds,
  recalibration: shipped,
  calibrationRaw: bands(points.map((x) => ({ ...x }))),
  calibrationRecalibrated: bands(points.map((x) => ({ ...x, p: sigmoid(shipped.a + shipped.b * logit(x.p)) }))),
  note: "In-model evidence on the 100-match synthetic corpus: predicted at the start of every over of every chase. Not real cricket.",
};
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
