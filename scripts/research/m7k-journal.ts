/** Stores a single writer's research journal separately from every gameplay save. */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execute, exportArchive, hash, recover, type ResearchEvent, type ResearchLedger } from "./m7k-ledger.js";

function sync(path: string, directory = false) { const fd = openSync(path, directory ? "r" : "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function publish(directory: string, state: ResearchLedger) {
  const temporary = join(directory, "checkpoint.pending"), checkpoint = join(directory, "checkpoint.json");
  writeFileSync(temporary, exportArchive(state)); sync(temporary); renameSync(temporary, checkpoint);
  if (process.platform !== "win32") sync(directory, true);
}
export function initialiseJournal(directory: string, state: ResearchLedger): void {
  mkdirSync(directory, { recursive: true });
  if (existsSync(join(directory, "checkpoint.json")) || existsSync(join(directory, "accepted.ndjson"))) throw new Error("M7K_JOURNAL_EXISTS");
  publish(directory, state); writeFileSync(join(directory, "accepted.ndjson"), ""); sync(join(directory, "accepted.ndjson"));
}
export function loadJournal(directory: string): ResearchLedger {
  const lines = readFileSync(join(directory, "accepted.ndjson"), "utf8");
  if (lines && !lines.endsWith("\n")) throw new Error("M7K_TRUNCATED_JOURNAL");
  const accepted: ResearchEvent[] = lines.split("\n").filter(Boolean).map(line => JSON.parse(line));
  return recover(readFileSync(join(directory, "checkpoint.json"), "utf8"), accepted);
}
export function commitJournal(directory: string, state: ResearchLedger, command: unknown, interruption?: "BEFORE_ACCEPTANCE" | "AFTER_ACCEPTANCE"): ResearchLedger {
  if (hash(loadJournal(directory)) !== hash(state)) throw new Error("M7K_STALE_WRITER");
  const next = execute(state, command);
  if (interruption === "BEFORE_ACCEPTANCE") throw new Error("M7K_INTERRUPTED_BEFORE_ACCEPTANCE");
  const journal = join(directory, "accepted.ndjson");
  appendFileSync(journal, JSON.stringify(next.events.at(-1)) + "\n"); sync(journal);
  if (interruption === "AFTER_ACCEPTANCE") throw new Error("M7K_INTERRUPTED_AFTER_ACCEPTANCE");
  publish(directory, next);
  return next;
}
