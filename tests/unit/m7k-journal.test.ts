/** Exercises durable research interruptions without writing to a gameplay database. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createLedger, execute, nextAction } from "../../scripts/research/m7k-ledger.js";
import { initialiseJournal, commitJournal, loadJournal } from "../../scripts/research/m7k-journal.js";

const fixtures = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8"));
describe("M7K explicit engineering oracles", () => {
  for (const fixture of fixtures.cases) it(fixture.id, () => {
    let state = createLedger(fixture.seed); for (const command of fixture.commands) state = execute(state, command);
    expect(state.projection).toMatchObject(fixture.expected); expect(nextAction(state)).toBe(fixture.nextAction);
  });
});
describe("M7K durable research journal", () => {
  it.each(["BEFORE_ACCEPTANCE", "AFTER_ACCEPTANCE"] as const)("recovers interruption %s", interruption => {
    const directory = mkdtempSync(join(tmpdir(), "m7k-journal-"));
    try {
      const fixture = fixtures.cases[1], state = createLedger(fixture.seed); initialiseJournal(directory, state);
      expect(() => commitJournal(directory, state, fixture.commands[0], interruption)).toThrow("INTERRUPTED");
      expect(loadJournal(directory)).toEqual(interruption === "BEFORE_ACCEPTANCE" ? state : execute(state, fixture.commands[0]));
      if (interruption === "AFTER_ACCEPTANCE") expect(() => commitJournal(directory, state, fixture.commands[0])).toThrow("STALE");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("persists a normal commit and rejects damaged journal/checkpoint files", () => {
    const directory = mkdtempSync(join(tmpdir(), "m7k-journal-"));
    try {
      const fixture = fixtures.cases[0], state = createLedger(fixture.seed); initialiseJournal(directory, state);
      const next = commitJournal(directory, state, fixture.commands[0]); expect(loadJournal(directory)).toEqual(next);
      expect(() => initialiseJournal(directory, state)).toThrow("EXISTS");
      appendFileSync(join(directory, "accepted.ndjson"), "{"); expect(() => loadJournal(directory)).toThrow("TRUNCATED");
      writeFileSync(join(directory, "accepted.ndjson"), ""); writeFileSync(join(directory, "checkpoint.json"), "{}"); expect(() => loadJournal(directory)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
