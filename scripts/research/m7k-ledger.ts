/** Provides an isolated research ledger without importing candidate events into historical saves. */
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { z } from "zod";
import { canonicalJson, ScoringContextSchema, DeliveryResolutionSchema, type ScoringContext } from "@lcxxvi/contracts";
import { addCounters, scoreDelivery, reduceScoringBoundary } from "@lcxxvi/domain";

export const VERSION = "LC_M7K_LEDGER_RESEARCH_V1" as const;
export const MODEL = "m7k-ledger-research-01" as const;
const id = z.string().min(1).max(200).refine(value => !["__proto__", "constructor", "prototype"].includes(value));
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const header = { commandId: id, sequence: counter };
export const CommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...header, kind: z.literal("DELIVERY"), resolution: DeliveryResolutionSchema }),
  z.strictObject({ ...header, kind: z.literal("PENALTY"), beneficiary: z.enum(["BATTING", "FIELDING"]), deadBallConfirmed: z.literal(true), reviewReference: id }),
  z.strictObject({ ...header, kind: z.literal("RETIRE"), playerId: id, status: z.enum(["RETIRED_OUT", "RETIRED_NOT_OUT"]), returnPermitted: z.boolean(), deadBallConfirmed: z.literal(true), reviewReference: id }),
  z.strictObject({ ...header, kind: z.literal("REPLACE"), playerId: id, end: z.enum(["NORTH", "SOUTH"]) }),
  z.strictObject({ ...header, kind: z.literal("PERMIT_RETURN"), playerId: id, reviewReference: id }),
  z.strictObject({ ...header, kind: z.literal("BOWLER"), playerId: id, outfieldIds: z.array(id).length(9) }),
  z.strictObject({ ...header, kind: z.literal("ALLOCATE"), awardId: id, destinationInningsId: id }),
]);
export type ResearchCommand = z.infer<typeof CommandSchema>;
export const SeedSchema = z.strictObject({
  version: z.literal(VERSION), model: z.literal(MODEL), inningsId: id, reviewReference: id,
  context: ScoringContextSchema, battingOrder: z.array(id).length(11),
});
export type Seed = z.infer<typeof SeedSchema>;
type Status = "AVAILABLE" | "ACTIVE" | "OUT" | "RETIRED_OUT" | "RETIRED_NOT_OUT";
type Batter = { runs: number; balls: number; fours: number; sixes: number; status: Status; returnPermitted: boolean };
type Bowler = { runs: number; wickets: number; legalBalls: number };
type Projection = {
  context: Omit<ScoringContext, "endsBefore"> & { endsBefore: { north: string | null; south: string | null } }; batting: Record<string, Batter>; bowling: Record<string, Bowler>;
  extras: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
  dismissals: Record<string, { kind: string; bowlerId: string | null }>;
  awards: Record<string, { amount: 5; beneficiaryTeamId: string; destinationInningsId: string | null }>;
  closed: boolean; awaitingBowler: boolean; previousBowler: string | null;
};
export type ResearchEvent = { command: ResearchCommand; previousHash: string; projectionHash: string; hash: string };
export type ResearchLedger = { version: typeof VERSION; model: typeof MODEL; seed: Seed; projection: Projection; events: ResearchEvent[]; gameplayIntegrationPermitted: false };
export function hash(value: unknown): string { return bytesToHex(sha256(utf8ToBytes(canonicalJson(value)))); }
function requireValue(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`M7K_${reason}`); }
const sum = (values: number[]) => addCounters(...values);
const slot = (end: "NORTH" | "SOUTH") => end === "NORTH" ? "north" : "south";

function reconcile(p: Projection): void {
  const c = p.context;
  requireValue(sum([...Object.values(p.batting).map(b => b.runs), ...Object.values(p.extras)]) === c.runs, "TEAM_RECONCILIATION");
  requireValue(sum(Object.values(p.bowling).map(b => b.runs)) === c.runs - p.extras.byes - p.extras.legByes - p.extras.penalties, "BOWLER_RECONCILIATION");
  requireValue(sum(Object.values(p.bowling).map(b => b.legalBalls)) === c.legalBalls, "BALL_RECONCILIATION");
  requireValue(sum(Object.values(p.batting).map(b => b.balls)) === addCounters(c.legalBalls, p.extras.noBalls), "FACED_RECONCILIATION");
  requireValue(Object.keys(p.dismissals).length === c.wickets && c.wickets <= 10, "WICKET_RECONCILIATION");
  for (const [player, line] of Object.entries(p.bowling)) {
    requireValue(line.wickets === Object.values(p.dismissals).filter(d => d.bowlerId === player).length, "CREDIT_RECONCILIATION");
    requireValue(line.legalBalls <= 24, "BOWLER_QUOTA");
  }
  const occupants = [c.endsBefore.north, c.endsBefore.south].filter((v): v is string => v !== null);
  requireValue(new Set(occupants).size === occupants.length, "DUPLICATE_END");
  requireValue(occupants.every(player => p.batting[player]?.status === "ACTIVE"), "END_STATUS");
  requireValue(Object.entries(p.batting).every(([player, b]) => (b.status === "ACTIVE") === occupants.includes(player)), "ACTIVE_END");
  requireValue(Object.entries(p.batting).every(([player, b]) => (b.status === "OUT" || b.status === "RETIRED_OUT") === Object.hasOwn(p.dismissals, player)), "DISMISSAL_STATUS");
  const terminal = c.wickets === 10 || (c.allocatedBalls !== null && c.legalBalls >= c.allocatedBalls) || (c.targetToWin !== null && c.runs >= c.targetToWin);
  requireValue(p.closed === terminal, "CLOSURE");
}

export function createLedger(input: unknown): ResearchLedger {
  const seed = SeedSchema.parse(input), c = seed.context;
  requireValue(c.rulesId === "LC_T20_01" && c.allocatedBalls === 120, "RULES");
  requireValue([c.runs, c.wickets, c.legalBalls, c.deliveryIndex, c.ballAgeLegalBalls].every(n => n === 0) && !c.freeHitPending, "NONZERO_SEED");
  requireValue(new Set(seed.battingOrder).size === 11 && seed.battingOrder.includes(c.strikerId) && seed.battingOrder.includes(c.nonStrikerId), "BATTING_IDENTITIES");
  const bowlingIds = [c.bowlerId, c.keeperId, ...c.outfieldIds];
  requireValue(new Set(bowlingIds).size === 11 && bowlingIds.every(player => id.safeParse(player).success && !seed.battingOrder.includes(player)), "FIELD_IDENTITIES");
  requireValue(c.endsBefore[slot(c.strikerEnd)] === c.strikerId && c.endsBefore[slot(c.strikerEnd === "NORTH" ? "SOUTH" : "NORTH")] === c.nonStrikerId && c.strikerId !== c.nonStrikerId, "SEED_ENDS");
  const projection: Projection = {
    context: structuredClone(c),
    batting: Object.fromEntries(seed.battingOrder.map(player => [player, { runs: 0, balls: 0, fours: 0, sixes: 0, status: player === c.strikerId || player === c.nonStrikerId ? "ACTIVE" : "AVAILABLE", returnPermitted: false }])),
    bowling: Object.fromEntries(bowlingIds.map(player => [player, { runs: 0, wickets: 0, legalBalls: 0 }])),
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 }, dismissals: {}, awards: {},
    closed: false, awaitingBowler: false, previousBowler: null,
  };
  reconcile(projection);
  return { version: VERSION, model: MODEL, seed, projection, events: [], gameplayIntegrationPermitted: false };
}

/** Returns a candidate state; rejected commands leave the caller's state unchanged. */
export function execute(input: ResearchLedger, commandInput: unknown): ResearchLedger {
  requireValue(input.version === VERSION && input.model === MODEL && input.gameplayIntegrationPermitted === false, "VERSION");
  reconcile(input.projection);
  requireValue(hash(input.projection) === (input.events.at(-1)?.projectionHash ?? hash(createLedger(input.seed).projection)), "STATE_HASH");
  let prior = hash(input.seed);
  const seen = new Set<string>();
  for (const [sequence, event] of input.events.entries()) {
    requireValue(event.command.sequence === sequence && !seen.has(event.command.commandId), "JOURNAL_SEQUENCE");
    requireValue(event.previousHash === prior && event.hash === hash({ command: event.command, previousHash: prior, projectionHash: event.projectionHash }), "JOURNAL_HASH");
    seen.add(event.command.commandId); prior = event.hash;
  }
  const command = CommandSchema.parse(commandInput);
  requireValue(command.sequence === input.events.length, "SEQUENCE");
  requireValue(!input.events.some(e => e.command.commandId === command.commandId), "DUPLICATE_COMMAND");
  const next = structuredClone(input), p = next.projection, c = p.context;
  if (command.kind === "DELIVERY") {
    requireValue(!p.closed && !p.awaitingBowler, "DELIVERY_CLOSED_OR_BOWLER_REQUIRED");
    requireValue(c.endsBefore.north !== null && c.endsBefore.south !== null, "REPLACEMENT_REQUIRED");
    requireValue(p.bowling[c.bowlerId]!.legalBalls < 24, "BOWLER_QUOTA");
    const recorded = scoreDelivery(c, command.resolution), o = reduceScoringBoundary(c, recorded);
    const batter = p.batting[c.strikerId]!, bowler = p.bowling[c.bowlerId]!;
    batter.runs = addCounters(batter.runs, o.delta.batterRuns); batter.balls = addCounters(batter.balls, o.delta.ballsFaced);
    batter.fours = addCounters(batter.fours, Number(recorded.boundary === "FOUR" && recorded.batRuns === 4));
    batter.sixes = addCounters(batter.sixes, Number(recorded.boundary === "SIX" && recorded.batRuns === 6));
    bowler.runs = addCounters(bowler.runs, o.delta.bowlerRuns); bowler.wickets = addCounters(bowler.wickets, o.delta.bowlerWickets);
    bowler.legalBalls = addCounters(bowler.legalBalls, o.delta.legalBalls);
    if (recorded.dismissal) {
      const d = recorded.dismissal;
      p.batting[d.playerId]!.status = "OUT"; p.dismissals[d.playerId] = { kind: d.kind, bowlerId: d.creditedBowlerId };
    }
    for (const key of Object.keys(p.extras) as (keyof typeof p.extras)[]) p.extras[key] = addCounters(p.extras[key], recorded.extras[key]);
    c.runs = o.totals.runs; c.wickets = o.totals.wickets; c.legalBalls = o.totals.legalBalls; c.ballAgeLegalBalls = o.totals.ballAgeLegalBalls;
    c.deliveryIndex = addCounters(c.deliveryIndex, 1); c.freeHitPending = o.freeHitPending;
    c.endsBefore = recorded.endsAfter; c.strikerEnd = o.strikerEndAfter; p.closed = o.inningsComplete;
    if (o.overCompleted) { p.previousBowler = c.bowlerId; p.awaitingBowler = !p.closed; }
  } else if (command.kind === "PENALTY") {
    if (command.beneficiary === "BATTING") { c.runs = addCounters(c.runs, 5); p.extras.penalties = addCounters(p.extras.penalties, 5); }
    else p.awards[command.commandId] = { amount: 5, beneficiaryTeamId: c.bowlingTeamId, destinationInningsId: null };
  } else if (command.kind === "ALLOCATE") {
    const award = p.awards[command.awardId];
    requireValue(award && award.destinationInningsId === null && command.destinationInningsId !== next.seed.inningsId, "AWARD_DESTINATION");
    award.destinationInningsId = command.destinationInningsId;
  } else if (command.kind === "RETIRE") {
    requireValue(!p.closed, "INNINGS_CLOSED");
    const player = p.batting[command.playerId];
    requireValue(player?.status === "ACTIVE", "RETIRE_NOT_ACTIVE");
    requireValue(command.status === "RETIRED_NOT_OUT" || !command.returnPermitted, "OUT_CANNOT_RETURN");
    player.status = command.status; player.returnPermitted = command.returnPermitted;
    if (command.status === "RETIRED_OUT") { c.wickets = addCounters(c.wickets, 1); p.dismissals[command.playerId] = { kind: "RETIRED_OUT", bowlerId: null }; }
    if (c.endsBefore.north === command.playerId) c.endsBefore.north = null;
    else c.endsBefore.south = null;
  } else if (command.kind === "PERMIT_RETURN") {
    requireValue(!p.closed, "INNINGS_CLOSED");
    const player = p.batting[command.playerId];
    requireValue(player?.status === "RETIRED_NOT_OUT" && !player.returnPermitted, "RETURN_STATUS");
    player.returnPermitted = true;
  } else if (command.kind === "REPLACE") {
    requireValue(!p.closed, "INNINGS_CLOSED");
    const player = p.batting[command.playerId];
    requireValue(player && (player.status === "AVAILABLE" || (player.status === "RETIRED_NOT_OUT" && player.returnPermitted)), "REPLACEMENT_STATUS");
    requireValue(c.endsBefore[slot(command.end)] === null, "REPLACEMENT_END");
    c.endsBefore[slot(command.end)] = command.playerId;
    player.status = "ACTIVE"; player.returnPermitted = false;
  } else {
    requireValue(!p.closed && p.awaitingBowler && c.endsBefore.north !== null && c.endsBefore.south !== null, "BOWLER_DECISION");
    requireValue(Object.hasOwn(p.bowling, command.playerId) && command.playerId !== c.keeperId && command.playerId !== p.previousBowler && p.bowling[command.playerId]!.legalBalls < 24, "BOWLER_SELECTION");
    requireValue(new Set([command.playerId, c.keeperId, ...command.outfieldIds]).size === 11 && command.outfieldIds.every(player => Object.hasOwn(p.bowling, player)), "FIELD_IDENTITIES");
    c.bowlerId = command.playerId; c.outfieldIds = command.outfieldIds; p.awaitingBowler = false;
  }
  c.strikerId = c.endsBefore[slot(c.strikerEnd)] ?? c.strikerId;
  c.nonStrikerId = c.endsBefore[slot(c.strikerEnd === "NORTH" ? "SOUTH" : "NORTH")] ?? c.nonStrikerId;
  p.closed ||= c.wickets === 10 || (c.targetToWin !== null && c.runs >= c.targetToWin);
  reconcile(p);
  const previousHash = next.events.at(-1)?.hash ?? hash(next.seed), projectionHash = hash(p);
  next.events.push({ command, previousHash, projectionHash, hash: hash({ command, previousHash, projectionHash }) });
  return next;
}

export function nextAction(state: ResearchLedger): "CLOSED" | "SELECT_BATTER" | "SELECT_BOWLER" | "ADVANCE" {
  if (state.projection.closed) return "CLOSED";
  if (state.projection.context.endsBefore.north === null || state.projection.context.endsBefore.south === null) return "SELECT_BATTER";
  return state.projection.awaitingBowler ? "SELECT_BOWLER" : "ADVANCE";
}

/** Replays commands through the same validators before trusting any saved projection. */
export function replay(seed: unknown, events: readonly ResearchEvent[]): ResearchLedger {
  let state = createLedger(seed);
  for (const event of events) {
    state = execute(state, event.command);
    requireValue(canonicalJson(state.events.at(-1)) === canonicalJson(event), "EVENT_HASH");
  }
  return state;
}
const ArchiveSchema = z.strictObject({
  version: z.literal("LC_M7K_ARCHIVE_RESEARCH_V1"), model: z.literal(MODEL), rules: z.literal(VERSION), seed: SeedSchema,
  events: z.array(z.strictObject({ command: CommandSchema, previousHash: id, projectionHash: id, hash: id })).max(2000),
  checkpoint: z.strictObject({ sequence: counter, projectionHash: id }).nullable(),
});
export function exportArchive(state: ResearchLedger, checkpointSequence = state.events.length): string {
  requireValue(Number.isSafeInteger(checkpointSequence) && checkpointSequence >= 0 && checkpointSequence <= state.events.length, "CHECKPOINT_SEQUENCE");
  const checked = replay(state.seed, state.events);
  requireValue(canonicalJson(checked) === canonicalJson(state), "ARCHIVE_STATE");
  const checkpointState = replay(state.seed, state.events.slice(0, checkpointSequence));
  return canonicalJson({ version: "LC_M7K_ARCHIVE_RESEARCH_V1", model: MODEL, rules: VERSION, seed: state.seed, events: state.events,
    checkpoint: { sequence: checkpointSequence, projectionHash: hash(checkpointState.projection) } });
}
export function importArchive(input: string): ResearchLedger {
  const archive = ArchiveSchema.parse(JSON.parse(input));
  requireValue(archive.checkpoint === null || archive.checkpoint.sequence <= archive.events.length, "CHECKPOINT_SEQUENCE");
  const state = replay(archive.seed, archive.events);
  if (archive.checkpoint) requireValue(hash(replay(archive.seed, archive.events.slice(0, archive.checkpoint.sequence)).projection) === archive.checkpoint.projectionHash, "CHECKPOINT_HASH");
  return state;
}


/** Credits a pending award to its destination only when both candidate transitions succeed. */
export function transferAward(source: ResearchLedger, destination: ResearchLedger, awardId: string, reviewReference: string): { source: ResearchLedger; destination: ResearchLedger } {
  const award = source.projection.awards[awardId];
  requireValue(award && award.destinationInningsId === null && award.beneficiaryTeamId === destination.projection.context.battingTeamId, "TRANSFER_BENEFICIARY");
  requireValue(source.seed.inningsId !== destination.seed.inningsId, "TRANSFER_INNINGS");
  const commandId = `transfer:${source.seed.inningsId}:${awardId}`;
  const nextDestination = execute(destination, { kind: "PENALTY", commandId, sequence: destination.events.length,
    beneficiary: "BATTING", deadBallConfirmed: true, reviewReference });
  const nextSource = execute(source, { kind: "ALLOCATE", commandId, sequence: source.events.length, awardId, destinationInningsId: destination.seed.inningsId });
  return { source: nextSource, destination: nextDestination };
}

/** Recovers accepted journal entries after an older published checkpoint, including repeated delivery of the same receipt. */
export function recover(archive: string, acceptedTail: readonly ResearchEvent[]): ResearchLedger {
  let state = importArchive(archive);
  for (const event of acceptedTail) {
    if (event.command.sequence < state.events.length) {
      requireValue(canonicalJson(state.events[event.command.sequence]) === canonicalJson(event), "CONFLICTING_RECEIPT");
      continue;
    }
    const next = execute(state, event.command);
    requireValue(canonicalJson(next.events.at(-1)) === canonicalJson(event), "TAIL_HASH");
    state = next;
  }
  return state;
}
