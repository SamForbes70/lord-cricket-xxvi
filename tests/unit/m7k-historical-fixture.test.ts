/** Uses synthetic packets to test review intake without changing historical acceptance records. */
import { readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { HistoricalFixtureSchema, verifyHistoricalFixture } from "../../scripts/research/m7k-historical-fixture.js";
const engineering = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8")).cases[0];
const source = { matchId: "synthetic-test", sourceEventSha256: "a".repeat(64), matchFileSha256: "b".repeat(64), sourceEventHashVerified: true };
function fixture() {
  return HistoricalFixtureSchema.parse({
    version: "LC_M7K_HISTORICAL_FIXTURE_V1", caseId: "synthetic-dot", ...{ matchId: source.matchId, sourceEventSha256: source.sourceEventSha256, matchFileSha256: source.matchFileSha256 },
    review: { reviewer: "Synthetic test reviewer", reviewedAt: "2026-10-29T00:00:00Z", sourceReferences: ["synthetic-reference"], playingConditionsReference: "LC_T20_01 test conditions",
      chronology: ["A legal dot leaves both batters at their original ends."], chronologyConfirmed: true, conditionsConfirmed: true,
      creditsConfirmed: true, physicalEndsConfirmed: true, nextActionConfirmed: true },
    seed: engineering.seed, commands: engineering.commands,
    expectedPrefixes: [{ runs: 0, wickets: 0, legalBalls: 1, deliveryIndex: 1,
      ends: { north: "p1", south: "p2" }, strikerEnd: "NORTH", strikerId: "p1", nonStrikerId: "p2", bowlerId: "b1", freeHitPending: false, targetToWin: null,
      closed: false, awaitingBowler: false,
      batting: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i + 1}`, { runs: 0, balls: i === 0 ? 1 : 0, fours: 0, sixes: 0, status: i < 2 ? "ACTIVE" : "AVAILABLE", returnPermitted: false }])),
      bowling: Object.fromEntries(["b1", "keeper", ...Array.from({ length: 9 }, (_, i) => `f${i + 1}`)].map(id => [id, { runs: 0, wickets: 0, legalBalls: id === "b1" ? 1 : 0 }])),
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 }, dismissals: {}, awards: {}, nextAction: "ADVANCE" }],
  });
}
describe("M7K historical fixture intake", () => {
  it("checks complete expectations and replay without authenticating a synthetic review", () => {
    const input = fixture(), before = structuredClone(input), result = verifyHistoricalFixture(input, [source]);
    expect(result.status).toBe("EXECUTABLE_EXPECTATIONS_PASS"); expect(result.prefixesVerified).toBe(1);
    expect(result.historicalEvidenceStatus).toContain("NOT_INDEPENDENTLY_AUTHENTICATED");
    expect(result.gameplayIntegrationPermitted).toBe(false); expect(input).toEqual(before);
  });
  it("CLI rejects an unknown source without publishing an output report", () => {
    const directory = mkdtempSync(join(tmpdir(), "m7k-fixture-intake-"));
    try {
      const input = join(directory, "packet.json"), output = join(directory, "report.json");
      writeFileSync(input, JSON.stringify({ version: "LC_M7K_REVIEWED_FIXTURE_PACKET_V1", fixtures: [fixture()] }));
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/m7k-verify-historical-fixtures.ts", `--fixtures=${input}`, `--out=${output}`], { encoding: "utf8", timeout: 10_000 });
      expect(result.status).not.toBe(0); expect(result.stderr).toContain("M7K_FIXTURE_SOURCE_IDENTITY"); expect(existsSync(output)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
  it("CLI records hashes and refuses to overwrite an existing result", () => {
    const directory = mkdtempSync(join(tmpdir(), "m7k-fixture-report-"));
    try {
      const input = join(directory, "packet.json"), output = join(directory, "report.json");
      const index = join(directory, "docs/verification-m7k/source-context");
      mkdirSync(index, { recursive: true }); writeFileSync(join(index, "SOURCE_CONTEXT.json"), JSON.stringify({ events: [source] }));
      writeFileSync(input, JSON.stringify({ version: "LC_M7K_REVIEWED_FIXTURE_PACKET_V1", fixtures: [fixture()] }));
      const args = ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href, resolve("scripts/m7k-verify-historical-fixtures.ts"), `--fixtures=${input}`, `--out=${output}`];
      const first = spawnSync(process.execPath, args, { encoding: "utf8", cwd: directory, timeout: 10_000 });
      expect(first.status, first.stderr).toBe(0);
      const original = readFileSync(output, "utf8"), report = JSON.parse(original);
      expect(report.fixturePacketSha256).toBe(createHash("sha256").update(readFileSync(input)).digest("hex"));
      expect(report.sourceIndexSha256).toBe(createHash("sha256").update(readFileSync(join(index, "SOURCE_CONTEXT.json"))).digest("hex"));
      expect(report.reports[0].historicalEvidenceStatus).toContain("NOT_INDEPENDENTLY_AUTHENTICATED");
      expect(report.gameplayIntegrationPermitted).toBe(false);
      const repeated = spawnSync(process.execPath, args, { encoding: "utf8", cwd: directory, timeout: 10_000 });
      expect(repeated.status).not.toBe(0); expect(repeated.stderr).toContain("EEXIST"); expect(readFileSync(output, "utf8")).toBe(original);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);
  it.each(["chronology", "conditions", "references"])("rejects missing review evidence: %s", mode => {
    const input = fixture();
    if (mode === "chronology") input.review.chronology = [];
    if (mode === "conditions") input.review.playingConditionsReference = " ";
    if (mode === "references") input.review.sourceReferences = [];
    expect(() => verifyHistoricalFixture(input, [source])).toThrow();
  });
  it.each(["match", "file", "duplicate", "unverified"])("rejects inconsistent source identity: %s", mode => {
    const input = fixture(), rows = [structuredClone(source)];
    if (mode === "match") input.matchId = "different";
    if (mode === "file") input.matchFileSha256 = "c".repeat(64);
    if (mode === "duplicate") rows.push(source);
    if (mode === "unverified") rows[0]!.sourceEventHashVerified = false;
    expect(() => verifyHistoricalFixture(input, rows)).toThrow();
  });
  it.each(["credits", "ends", "action", "prefix"])("rejects incorrect expectation: %s", mode => {
    const input = fixture();
    if (mode === "credits") { input.expectedPrefixes[0]!.batting.p1!.balls = 0; input.expectedPrefixes[0]!.batting.p2!.balls = 1; }
    if (mode === "ends") input.expectedPrefixes[0]!.ends = { north: "p2", south: "p1" };
    if (mode === "action") input.expectedPrefixes[0]!.nextAction = "CLOSED";
    if (mode === "prefix") input.commands.push({ ...input.commands[0]!, commandId: "second", sequence: 1 });
    const before = structuredClone(input);
    expect(() => verifyHistoricalFixture(input, [source])).toThrow(); expect(input).toEqual(before);
  });
});
