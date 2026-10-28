/** Checks both-or-neither transfer recovery through the shared durable journal. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { createLedger, hash } from "../../scripts/research/m7k-ledger.js";
import { initialiseBook, loadBook, commitBook, releaseDeadBookWriter, type BookAction } from "../../scripts/research/m7k-book-journal.js";
const fixture = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8")).cases[0];
function initialPair() {
  const first = createLedger(fixture.seed), secondSeed = structuredClone(fixture.seed), c = secondSeed.context;
  secondSeed.inningsId = "second"; c.inningsIndex = 1; [c.battingTeamId, c.bowlingTeamId] = [c.bowlingTeamId, c.battingTeamId];
  secondSeed.battingOrder = Object.keys(first.projection.bowling);
  c.strikerId = secondSeed.battingOrder[0]; c.nonStrikerId = secondSeed.battingOrder[1];
  c.endsBefore = { north: c.strikerId, south: c.nonStrikerId };
  c.bowlerId = first.seed.battingOrder[0]; c.keeperId = first.seed.battingOrder[1]; c.outfieldIds = first.seed.battingOrder.slice(2);
  return { first, second: createLedger(secondSeed) };
}
const penalty: BookAction = { kind: "COMMAND", inningsId: fixture.seed.inningsId, command: { kind: "PENALTY", commandId: "award", sequence: 0, beneficiary: "FIELDING", deadBallConfirmed: true, reviewReference: "SF-2026-10-28" } };
const transfer: BookAction = { kind: "TRANSFER", sourceInningsId: fixture.seed.inningsId, destinationInningsId: "second", awardId: "award", reviewReference: "SF-2026-10-28" };
function temporary(run: (directory: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "m7k-book-"));
  try { const directory = join(root, "book"); initialiseBook(directory, initialPair()); run(directory); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
describe("M7K durable cross-innings transactions", () => {
  it("recovers both innings after a real writer-process exit before checkpoint publication", () => temporary(directory => {
    const empty = loadBook(directory), awarded = commitBook(directory, empty.head, "award-tx", penalty);
    const moduleUrl = pathToFileURL(resolve("scripts/research/m7k-book-journal.ts")).href;
    const program = `import {commitBook} from ${JSON.stringify(moduleUrl)}; commitBook(${JSON.stringify(directory)}, ${JSON.stringify(awarded.head)}, "crash-transfer", ${JSON.stringify(transfer)}, () => process.exit(71));`;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(71);
    const recovered = loadBook(directory);
    expect(recovered.pair.second.projection.context.runs).toBe(5);
    expect(recovered.pair.first.projection.awards.award?.destinationInningsId).toBe("second");
    expect(() => commitBook(directory, awarded.head, "crash-transfer", transfer)).toThrow();
    releaseDeadBookWriter(directory);
    expect(commitBook(directory, awarded.head, "crash-transfer", transfer)).toEqual(recovered);
  }));
  it("preserves live or foreign writer locks during recovery", () => temporary(directory => {
    const lock = join(directory, "writer.lock");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, hostname: hostname() }));
    expect(() => releaseDeadBookWriter(directory)).toThrow("LIVE_LOCK");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, hostname: "different-host" }));
    expect(() => releaseDeadBookWriter(directory)).toThrow("FOREIGN_LOCK");
  }));
  it.each(["BEFORE_ACCEPTANCE", "AFTER_ACCEPTANCE", "AFTER_CHECKPOINT"] as const)("recovers both or neither at %s", interruption => temporary(directory => {
    const empty = loadBook(directory), awarded = commitBook(directory, empty.head, "award-tx", penalty);
    expect(() => commitBook(directory, awarded.head, "transfer-tx", transfer, interruption)).toThrow("INTERRUPTED");
    const recovered = loadBook(directory), accepted = interruption !== "BEFORE_ACCEPTANCE";
    expect(recovered.pair.first.projection.context.runs).toBe(0);
    expect(recovered.pair.second.projection.context.runs).toBe(accepted ? 5 : 0);
    expect(recovered.pair.first.projection.awards.award?.destinationInningsId).toBe(accepted ? "second" : null);
    expect(recovered.records.length).toBe(accepted ? 2 : 1);
    const retried = commitBook(directory, awarded.head, "transfer-tx", transfer);
    expect(retried.pair.second.projection.context.runs).toBe(5); expect(retried.records).toHaveLength(2);
    expect(loadBook(directory)).toEqual(retried);
  }));
  it("rejects conflicting retries, stale heads and simultaneous writer locks", () => temporary(directory => {
    const empty = loadBook(directory), awarded = commitBook(directory, empty.head, "award-tx", penalty);
    expect(() => commitBook(directory, empty.head, "stale", transfer)).toThrow("STALE");
    expect(() => commitBook(directory, awarded.head, "award-tx", transfer)).toThrow("CONFLICTING_RETRY");
    writeFileSync(join(directory, "writer.lock"), "another writer");
    expect(() => commitBook(directory, awarded.head, "transfer-tx", transfer)).toThrow();
    unlinkSync(join(directory, "writer.lock")); expect(loadBook(directory)).toEqual(awarded);
  }));
  it("preserves both innings and journal bytes when either transition fails", () => temporary(directory => {
    const empty = loadBook(directory), bytes = readFileSync(join(directory, "accepted.ndjson"), "utf8");
    expect(() => commitBook(directory, empty.head, "unknown-award", transfer)).toThrow();
    expect(readFileSync(join(directory, "accepted.ndjson"), "utf8")).toBe(bytes); expect(loadBook(directory)).toEqual(empty);
  }));
  it("reconstructs without a checkpoint and rejects damaged checkpoints or journals", () => temporary(directory => {
    const empty = loadBook(directory), awarded = commitBook(directory, empty.head, "award-tx", penalty);
    unlinkSync(join(directory, "checkpoint.json")); expect(loadBook(directory)).toEqual(awarded);
    writeFileSync(join(directory, "checkpoint.json"), JSON.stringify({ version: "LC_M7K_BOOK_JOURNAL_V1", sequence: 1, head: "0".repeat(64) }));
    expect(() => loadBook(directory)).toThrow("CHECKPOINT"); unlinkSync(join(directory, "checkpoint.json"));
    const original = readFileSync(join(directory, "accepted.ndjson"), "utf8");
    const record = JSON.parse(original.trim()); record.pairHash = "0".repeat(64); const { receiptHash: _, ...body } = record; void _; record.receiptHash = hash(body);
    writeFileSync(join(directory, "accepted.ndjson"), JSON.stringify(record) + "\n"); expect(() => loadBook(directory)).toThrow("PAIR_HASH");
    writeFileSync(join(directory, "accepted.ndjson"), original); appendFileSync(join(directory, "accepted.ndjson"), "{"); expect(() => loadBook(directory)).toThrow("TRUNCATED");
  }));
  it("rejects inconsistent team rosters and unknown root versions", () => {
    const root = mkdtempSync(join(tmpdir(), "m7k-book-invalid-"));
    try {
      const pair = initialPair(); pair.second.seed.inningsId = pair.first.seed.inningsId;
      expect(() => initialiseBook(join(root, "invalid"), pair)).toThrow();
      const directory = join(root, "valid"); initialiseBook(directory, initialPair());
      const genesis = JSON.parse(readFileSync(join(directory, "genesis.json"), "utf8")); genesis.version = "LC_T20_MATCH_V1";
      writeFileSync(join(directory, "genesis.json"), JSON.stringify(genesis)); expect(() => loadBook(directory)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
