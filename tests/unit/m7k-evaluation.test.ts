/** Exercises evaluation gates with synthetic records, without opening a real evaluation cohort. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { hash } from "../../scripts/research/m7k-ledger.js";
import { evaluate, validateProtocol, type EvaluationProtocol, type EvaluationResult } from "../../scripts/research/m7k-evaluation.js";

function protocol(): EvaluationProtocol {
  const cohort = (prefix: string, date: string) => Array.from({ length: 200 }, (_, i) => ({ matchId: `${prefix}-${i}`, date, sha256: hash([prefix, i]) }));
  return { version: "LC_M7K_EVALUATION_PROTOCOL_V1", candidateId: "synthetic-tool-test", rulesId: "research-tool-test",
    frozenAt: "2026-10-28T00:00:00Z", evaluationFirstOpenedAt: "2026-10-28T01:00:00Z", rightsReference: "SYNTHETIC_TEST_ONLY",
    untouchedDeclaration: "Synthetic test data; no empirical acceptance claimed", training: cohort("training", "2025-01-01"), evaluation: cohort("evaluation", "2025-02-01"),
    previouslyInspectedMatchIds: ["known-development"], bootstrapSamples: 100, bootstrapSeed: "fixed-test-seed", chaseTailThreshold: .05 };
}
function records(p: EvaluationProtocol): EvaluationResult[] {
  return p.evaluation.map((m, i) => {
    const target = 101 + i % 3 * 30;
    const pair: EvaluationResult["reference"] = [
      { runs: target - 1, wickets: 5, legalBalls: 120, attempts: 125, dots: 60, boundaries: 15, unsupported: 0, target: null, termination: "ALLOCATION_END" },
      { runs: target, wickets: 4, legalBalls: 115, attempts: 120, dots: 55, boundaries: 15, unsupported: 0, target, termination: "TARGET_REACHED" },
    ];
    return { matchId: m.matchId, sourceSha256: m.sha256, candidateId: p.candidateId, rulesId: p.rulesId, competition: i % 2 ? "A" : "B",
      reference: structuredClone(pair), candidate: structuredClone(pair), ablations: { strength: structuredClone(pair), fatigue: structuredClone(pair), tactics: structuredClone(pair) } };
  });
}
const targets = () => Array.from({ length: 200 }, (_, i) => 101 + i % 3 * 30);

describe("M7K sealed-cohort evaluation tooling", () => {
  it("runs the offline CLI and rejects an unfrozen protocol before reading result files", () => {
    const directory = mkdtempSync(join(tmpdir(), "m7k-evaluation-"));
    try {
      const p = protocol(), protocolPath = join(directory, "protocol.json"), resultPath = join(directory, "results.json"), targetPath = join(directory, "targets.json"), out = join(directory, "report.json");
      writeFileSync(protocolPath, JSON.stringify(p)); writeFileSync(resultPath, JSON.stringify(records(p))); writeFileSync(targetPath, JSON.stringify(targets()));
      const args = ["--import", "tsx", "scripts/m7k-evaluate.ts", `--protocol=${protocolPath}`, `--results=${resultPath}`, `--training-targets=${targetPath}`, `--out=${out}`];
      execFileSync(process.execPath, args);
      expect(JSON.parse(readFileSync(out, "utf8")).gameplayIntegrationPermitted).toBe(false);
      p.frozenAt = "2026-10-29T00:00:00Z"; writeFileSync(protocolPath, JSON.stringify(p));
      args[4] = `--results=${join(directory, "never-opened.json")}`;
      const rejected = spawnSync(process.execPath, args, { encoding: "utf8" });
      expect(rejected.status).not.toBe(0); expect(rejected.stderr).toContain("OPENED_BEFORE_FREEZE"); expect(rejected.stderr).not.toContain("ENOENT");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
  it("reports both innings, competitions, training-defined bands, ablations and repeatable uncertainty", () => {
    const p = protocol(), rows = records(p), a = evaluate(p, rows, targets());
    expect(a.comparisons).toHaveLength(2); expect(a.comparisons.every(c => c.allBandsPass)).toBe(true);
    expect(a.byCompetition).toHaveLength(2); expect(a.byTargetBand).toHaveLength(3); expect(a.ablations.map(a => a.factor)).toEqual(["strength", "fatigue", "tactics"]);
    expect(a.uncertainty[0]?.meanRunDifference95).toEqual([0, 0]); expect(a.gameplayIntegrationPermitted).toBe(false);
    expect(a).toEqual(evaluate(p, rows, targets()));
  });
  it.each(["minimum", "date", "identity", "source", "inspected", "freeze"])("rejects invalid cohort %s before evaluation", mode => {
    const p = protocol();
    if (mode === "minimum") p.training.pop();
    if (mode === "date") p.evaluation[0]!.date = p.training[0]!.date;
    if (mode === "identity") p.evaluation[0]!.matchId = p.training[0]!.matchId;
    if (mode === "source") p.evaluation[0]!.sha256 = p.training[0]!.sha256;
    if (mode === "inspected") p.previouslyInspectedMatchIds.push(p.evaluation[0]!.matchId);
    if (mode === "freeze") { p.frozenAt = "2026-10-28T01:00:00.999Z"; p.evaluationFirstOpenedAt = "2026-10-28T01:00:00Z"; }
    expect(() => validateProtocol(p)).toThrow();
  });
  it.each(["missing", "duplicate", "model", "rules", "hash", "counter", "training-targets"])("rejects inconsistent result %s", mode => {
    const p = protocol(), rows = records(p), t = targets();
    if (mode === "missing") rows.pop();
    if (mode === "duplicate") rows[1] = structuredClone(rows[0]!);
    if (mode === "model") rows[0]!.candidateId = "wrong";
    if (mode === "rules") rows[0]!.rulesId = "wrong";
    if (mode === "hash") rows[0]!.sourceSha256 = "0".repeat(64);
    if (mode === "counter") rows[0]!.candidate[0].dots = 200;
    if (mode === "training-targets") t.pop();
    expect(() => evaluate(p, rows, t)).toThrow();
  });
  it("reports failed candidate bands and a conditional chase-tail failure", () => {
    const p = protocol(), rows = records(p);
    for (const row of rows) { row.candidate[0].runs = 60; row.candidate[1] = { ...row.candidate[1], runs: 50, wickets: 10, termination: "ALL_OUT" }; }
    const result = evaluate(p, rows, targets());
    expect(result.comparisons.every(c => !c.allBandsPass)).toBe(true); expect(result.chaseTail.every(c => c.pass === false)).toBe(true);
  });
});
