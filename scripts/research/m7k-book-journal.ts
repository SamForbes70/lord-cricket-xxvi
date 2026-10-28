/** Commits research innings changes through one shared journal, so a transfer has one durable acceptance point. */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { z } from "zod";
import { CommandSchema, execute, exportArchive, hash, importArchive, transferAward, type ResearchLedger } from "./m7k-ledger.js";

const VERSION = "LC_M7K_BOOK_JOURNAL_V1" as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(200);
const ActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("COMMAND"), inningsId: identifier, command: CommandSchema }),
  z.strictObject({ kind: z.literal("TRANSFER"), sourceInningsId: identifier, destinationInningsId: identifier, awardId: identifier, reviewReference: identifier }),
]);
export type BookAction = z.infer<typeof ActionSchema>;
const RecordSchema = z.strictObject({ sequence: z.number().int().nonnegative().max(2000), transactionId: identifier,
  previousHash: digest, action: ActionSchema, pairHash: digest, receiptHash: digest });
type Record = z.infer<typeof RecordSchema>;
const GenesisSchema = z.strictObject({ version: z.literal(VERSION), first: z.string(), second: z.string() });
const CheckpointSchema = z.strictObject({ version: z.literal(VERSION), sequence: z.number().int().nonnegative(), head: digest });
export type BookPair = { first: ResearchLedger; second: ResearchLedger };
export type ResearchBook = { pair: BookPair; head: string; records: Record[] };
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`M7K_BOOK_${reason}`); }
function sync(path: string, directory = false) { const fd = openSync(path, directory ? "r" : "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function syncDirectory(directory: string) { if (process.platform !== "win32") sync(directory, true); }
function validatePair(pair: BookPair): void {
  const a = pair.first.projection.context, b = pair.second.projection.context;
  check(pair.first.seed.inningsId !== pair.second.seed.inningsId && a.inningsIndex === 0 && b.inningsIndex === 1, "INNINGS");
  check(a.battingTeamId === b.bowlingTeamId && a.bowlingTeamId === b.battingTeamId, "TEAMS");
  const same = (x: string[], y: string[]) => hash([...x].sort()) === hash([...y].sort());
  check(same(Object.keys(pair.first.projection.batting), Object.keys(pair.second.projection.bowling)) && same(Object.keys(pair.first.projection.bowling), Object.keys(pair.second.projection.batting)), "ROSTERS");
}
function apply(pair: BookPair, input: unknown): BookPair {
  const action = ActionSchema.parse(input), next = structuredClone(pair);
  if (action.kind === "COMMAND") {
    const side = next.first.seed.inningsId === action.inningsId ? "first" : next.second.seed.inningsId === action.inningsId ? "second" : null;
    check(side !== null, "UNKNOWN_INNINGS");
    next[side] = execute(next[side], action.command);
  } else {
    const source = next.first.seed.inningsId === action.sourceInningsId ? "first" : next.second.seed.inningsId === action.sourceInningsId ? "second" : null;
    const destination = next.first.seed.inningsId === action.destinationInningsId ? "first" : next.second.seed.inningsId === action.destinationInningsId ? "second" : null;
    check(source !== null && destination !== null && source !== destination, "TRANSFER_INNINGS");
    const transferred = transferAward(next[source], next[destination], action.awardId, action.reviewReference);
    next[source] = transferred.source; next[destination] = transferred.destination;
  }
  validatePair(next); return next;
}
function checkpoint(directory: string, state: ResearchBook) {
  const temporary = join(directory, "checkpoint.pending");
  writeFileSync(temporary, JSON.stringify({ version: VERSION, sequence: state.records.length, head: state.head }));
  sync(temporary); renameSync(temporary, join(directory, "checkpoint.json")); syncDirectory(directory);
}
export function initialiseBook(directory: string, pair: BookPair): void {
  const checked = { first: importArchive(exportArchive(pair.first)), second: importArchive(exportArchive(pair.second)) };
  validatePair(checked);
  const genesis = { version: VERSION, first: exportArchive(checked.first), second: exportArchive(checked.second) };
  mkdirSync(directory);
  writeFileSync(join(directory, "genesis.json"), JSON.stringify(genesis)); sync(join(directory, "genesis.json"));
  writeFileSync(join(directory, "accepted.ndjson"), ""); sync(join(directory, "accepted.ndjson")); syncDirectory(directory);
  checkpoint(directory, { pair: checked, head: hash(genesis), records: [] });
}

/** Reconstructs both innings before exposing any accepted transfer. A stale checkpoint never splits the pair. */
export function loadBook(directory: string): ResearchBook {
  const genesis = GenesisSchema.parse(JSON.parse(readFileSync(join(directory, "genesis.json"), "utf8")));
  let pair = { first: importArchive(genesis.first), second: importArchive(genesis.second) };
  validatePair(pair);
  let head = hash(genesis);
  const heads = [head], records: Record[] = [];
  const journal = readFileSync(join(directory, "accepted.ndjson"), "utf8");
  check(journal === "" || journal.endsWith("\n"), "TRUNCATED_JOURNAL");
  const seen = new Set<string>();
  for (const line of journal.split("\n").filter(Boolean)) {
    const record = RecordSchema.parse(JSON.parse(line));
    check(record.sequence === records.length && record.previousHash === head && !seen.has(record.transactionId), "ORDER");
    const { receiptHash, ...body } = record;
    check(hash(body) === receiptHash, "RECEIPT_HASH");
    const next = apply(pair, record.action);
    check(hash(next) === record.pairHash, "PAIR_HASH");
    pair = next; head = receiptHash; heads.push(head); records.push(record); seen.add(record.transactionId);
  }
  if (existsSync(join(directory, "checkpoint.json"))) {
    const stored = CheckpointSchema.parse(JSON.parse(readFileSync(join(directory, "checkpoint.json"), "utf8")));
    check(stored.sequence <= records.length && heads[stored.sequence] === stored.head, "CHECKPOINT_HASH");
  }
  return { pair, head, records };
}

/** Flushes one pair receipt before checkpoint publication. The exclusive lock prevents simultaneous writers. */
export function commitBook(directory: string, expectedHead: string, transactionId: string, actionInput: unknown,
  interruption?: "BEFORE_ACCEPTANCE" | "AFTER_ACCEPTANCE" | "AFTER_CHECKPOINT" | (() => void)): ResearchBook {
  identifier.parse(transactionId);
  const action = ActionSchema.parse(actionInput), lock = join(directory, "writer.lock");
  check(!existsSync(join(directory, "recovery.lock")), "RECOVERY_IN_PROGRESS");
  const fd = openSync(lock, "wx");
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, hostname: hostname() })); fsyncSync(fd);
    const state = loadBook(directory), prior = state.records.find(r => r.transactionId === transactionId);
    if (prior) { check(hash(prior.action) === hash(action), "CONFLICTING_RETRY"); return state; }
    check(state.head === expectedHead && state.records.length < 2000, "STALE_WRITER");
    const pair = apply(state.pair, action);
    const body = { sequence: state.records.length, transactionId, previousHash: state.head, action, pairHash: hash(pair) };
    const record = { ...body, receiptHash: hash(body) };
    const next = { pair, head: record.receiptHash, records: [...state.records, record] };
    if (interruption === "BEFORE_ACCEPTANCE") throw new Error("M7K_BOOK_INTERRUPTED_BEFORE_ACCEPTANCE");
    const journal = join(directory, "accepted.ndjson");
    appendFileSync(journal, JSON.stringify(record) + "\n"); sync(journal);
    if (typeof interruption === "function") interruption();
    if (interruption === "AFTER_ACCEPTANCE") throw new Error("M7K_BOOK_INTERRUPTED_AFTER_ACCEPTANCE");
    checkpoint(directory, next);
    if (interruption === "AFTER_CHECKPOINT") throw new Error("M7K_BOOK_INTERRUPTED_AFTER_CHECKPOINT");
    return next;
  } finally { closeSync(fd); unlinkSync(lock); }
}


/** Removes a local dead process's lock; live, foreign and unverifiable owners remain protected. */
export function releaseDeadBookWriter(directory: string): void {
  const recovery = join(directory, "recovery.lock"), lock = join(directory, "writer.lock");
  const fd = openSync(recovery, "wx");
  try {
    const text = readFileSync(lock, "utf8");
    const owner = z.strictObject({ pid: z.number().int().positive(), hostname: z.string() }).parse(JSON.parse(text));
    check(owner.hostname === hostname(), "FOREIGN_LOCK");
    let dead = false;
    try { process.kill(owner.pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") dead = true; else throw error; }
    check(dead, "LIVE_LOCK");
    check(readFileSync(lock, "utf8") === text, "LOCK_CHANGED");
    unlinkSync(lock); syncDirectory(directory);
  } finally { closeSync(fd); unlinkSync(recovery); }
}
