/** Checks declared evaluation cohorts and compares two-innings results without opening or fitting raw match data. */
import { z } from "zod";
import { hash } from "./m7k-ledger.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const source = z.strictObject({ matchId: z.string().min(1), date: z.iso.date(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const ProtocolSchema = z.strictObject({
  version: z.literal("LC_M7K_EVALUATION_PROTOCOL_V1"), candidateId: z.string().min(1), rulesId: z.string().min(1),
  frozenAt: z.iso.datetime(), evaluationFirstOpenedAt: z.iso.datetime(),
  rightsReference: z.string().min(1), untouchedDeclaration: z.string().min(1),
  training: z.array(source).min(200), evaluation: z.array(source).min(200), previouslyInspectedMatchIds: z.array(z.string()),
  bootstrapSamples: z.number().int().min(100).max(10000), bootstrapSeed: z.string().min(1),
  chaseTailThreshold: z.number().min(0).max(1),
});
export type EvaluationProtocol = z.infer<typeof ProtocolSchema>;
const innings = z.strictObject({ runs: count, wickets: count.max(10), legalBalls: count.max(120), attempts: count,
  dots: count, boundaries: count, unsupported: count, target: count.nullable(),
  termination: z.enum(["TARGET_REACHED", "ALL_OUT", "ALLOCATION_END"]),
});
const pair = z.tuple([innings, innings]);
export const ResultSchema = z.strictObject({ matchId: z.string(), competition: z.string().min(1),
  candidateId: z.string(), rulesId: z.string(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reference: pair, candidate: pair,
  ablations: z.strictObject({ strength: pair, fatigue: pair, tactics: pair }),
});
export type EvaluationResult = z.infer<typeof ResultSchema>;
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`M7K_EVALUATION_${reason}`); }
export function validateProtocol(input: unknown): EvaluationProtocol {
  const p = ProtocolSchema.parse(input);
  check(Date.parse(p.frozenAt) <= Date.parse(p.evaluationFirstOpenedAt), "OPENED_BEFORE_FREEZE");
  const all = [...p.training, ...p.evaluation];
  check(new Set(all.map(m => m.matchId)).size === all.length, "DUPLICATE_MATCH");
  check(new Set(all.map(m => m.sha256)).size === all.length, "DUPLICATE_SOURCE");
  const end = [...p.training.map(m => m.date)].sort().at(-1)!;
  check(p.evaluation.every(m => m.date > end), "CHRONOLOGY");
  check(p.evaluation.every(m => !p.previouslyInspectedMatchIds.includes(m.matchId)), "PREVIOUSLY_INSPECTED");
  return p;
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * fraction)]!;
}
function metrics(rows: z.infer<typeof pair>[], index: number) {
  const innings = rows.map(row => row[index]!);
  const attempts = innings.reduce((n, i) => n + i.attempts, 0);
  return { runs: mean(innings.map(i => i.runs)), wickets: mean(innings.map(i => i.wickets)),
    dotFraction: attempts ? innings.reduce((n, i) => n + i.dots, 0) / attempts : 0,
    boundaryFraction: attempts ? innings.reduce((n, i) => n + i.boundaries, 0) / attempts : 0,
    p10: quantile(innings.map(i => i.runs), .1), p50: quantile(innings.map(i => i.runs), .5), p90: quantile(innings.map(i => i.runs), .9),
    unsupported: innings.reduce((n, i) => n + i.unsupported, 0) };
}
function compare(rows: EvaluationResult[]) {
  return [0, 1].map(index => {
    const reference = metrics(rows.map(r => r.reference), index), candidate = metrics(rows.map(r => r.candidate), index);
    const relative = (a: number, b: number) => a === 0 ? Number(b !== 0) : Math.abs(b - a) / a;
    const bands = { runs: relative(reference.runs, candidate.runs) <= .05,
      wickets: Math.abs(reference.wickets - candidate.wickets) <= .5,
      dots: Math.abs(reference.dotFraction - candidate.dotFraction) <= .02,
      boundaries: Math.abs(reference.boundaryFraction - candidate.boundaryFraction) <= .02,
      p10: relative(reference.p10, candidate.p10) <= .1, p50: relative(reference.p50, candidate.p50) <= .1, p90: relative(reference.p90, candidate.p90) <= .1 };
    return { innings: index + 1, reference, candidate, bands, allBandsPass: Object.values(bands).every(Boolean) };
  });
}

export function evaluate(protocolInput: unknown, resultsInput: unknown, trainingTargets: number[]) {
  const protocol = validateProtocol(protocolInput), rows = z.array(ResultSchema).parse(resultsInput);
  check(rows.length === protocol.evaluation.length && new Set(rows.map(r => r.matchId)).size === rows.length, "RESULT_COVERAGE");
  const sources = new Map(protocol.evaluation.map(m => [m.matchId, m.sha256]));
  for (const row of rows) {
    check(sources.get(row.matchId) === row.sourceSha256 && row.candidateId === protocol.candidateId && row.rulesId === protocol.rulesId, "RESULT_IDENTITY");
    for (const pair of [row.reference, row.candidate, ...Object.values(row.ablations)]) for (const i of pair) {
      check(i.attempts >= i.legalBalls && i.dots + i.boundaries <= i.attempts && i.unsupported <= i.attempts, "COUNTERS");
      check(i.target === null || i.target > 0, "TARGET");
      check((i.termination === "TARGET_REACHED") === (i.target !== null && i.runs >= i.target), "TERMINATION");
      check(i.termination !== "ALL_OUT" || i.wickets === 10, "WICKETS");
      check(i.termination !== "ALLOCATION_END" || i.legalBalls === 120, "ALLOCATION");
    }
  }
  check(trainingTargets.length === protocol.training.length && trainingTargets.every(n => Number.isSafeInteger(n) && n > 0), "TRAINING_TARGETS");
  const cuts = [quantile(trainingTargets, 1 / 3), quantile(trainingTargets, 2 / 3)];
  const band = (target: number) => target <= cuts[0]! ? "LOW" : target <= cuts[1]! ? "MIDDLE" : "HIGH";
  const byCompetition = [...new Set(rows.map(r => r.competition))].sort().map(competition => ({ competition, comparisons: compare(rows.filter(r => r.competition === competition)) }));
  const byTargetBand = ["LOW", "MIDDLE", "HIGH"].map(name => {
    const selected = rows.filter(r => r.reference[1].target !== null && band(r.reference[1].target!) === name);
    return { band: name, matches: selected.length, comparisons: selected.length ? compare(selected) : null };
  });
  const ablations = (["strength", "fatigue", "tactics"] as const).map(factor => ({ factor,
    innings: [0, 1].map(index => ({ innings: index + 1, baseline: metrics(rows.map(r => r.candidate), index), ablated: metrics(rows.map(r => r.ablations[factor]), index) })) }));
  const bootstrap = Array.from({ length: protocol.bootstrapSamples }, (_, sample) => {
    const selected = rows.map((_, draw) => rows[Number.parseInt(hash([protocol.bootstrapSeed, sample, draw]).slice(0, 12), 16) % rows.length]!);
    return [0, 1].map(index => mean(selected.map(r => r.candidate[index]!.runs - r.reference[index]!.runs)));
  });
  const uncertainty = [0, 1].map(index => ({ innings: index + 1, meanRunDifference95: [quantile(bootstrap.map(b => b[index]!), .025), quantile(bootstrap.map(b => b[index]!), .975)] }));
  const chaseTail = ["LOW", "MIDDLE", "HIGH"].map(name => {
    const selected = rows.filter(r => r.reference[1].target !== null && band(r.reference[1].target!) === name);
    const difference = selected.length ? Math.abs(mean(selected.map(r => Number(r.reference[1].termination === "TARGET_REACHED"))) - mean(selected.map(r => Number(r.candidate[1].termination === "TARGET_REACHED")))) : null;
    return { band: name, matches: selected.length, difference, pass: difference === null ? null : difference <= protocol.chaseTailThreshold };
  });
  return { version: "LC_M7K_EVALUATION_REPORT_V1", protocolSha256: hash(protocol), resultSha256: hash(rows),
    trainingTargetsSha256: hash(trainingTargets), comparisons: compare(rows), byCompetition, byTargetBand, ablations, uncertainty, chaseTail,
    targetCutsFromTraining: cuts, gameplayIntegrationPermitted: false,
    limits: ["Untouched status and rights are provider declarations, not authenticated by this tool.", "Aggregate inputs do not establish phase-level acceptance or a causal rating scale.", "Source hashes must be checked by the upstream extractor before this report."] };
}
