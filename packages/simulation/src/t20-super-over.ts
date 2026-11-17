import {
  SCORING_ENGINE_VERSION,
  PROBABILITY_VERSION,
  RANDOM_VERSION,
  EXP_LUT_VERSION,
  PROBABILITY_MODEL_ID,
  SuperOverCommandSchema,
  T20SuperOverRecordSchema,
  T20_SUPER_OVER_RECORD_SCHEMA_ID,
  T20_SUPER_OVER_RULES_ID,
  type DeliveryRecorded,
  type InningsLedger,
  type Player,
  type SuperOverCommand,
  type SuperOverRoundSummary,
  type T20SuperOverRecord,
} from "@lcxxvi/contracts";
import { FIELD_REGISTRY, T20_POWERPLAY_SLOTS, MODEL_PACK_SHA256, DELIVERY_STAGE_PACK_SHA256, EXP_LUT_SHA256 } from "@lcxxvi/data";
import { validateInningsLedger, contextFromLedger, reduceInningsLedger, selectInningsBatter, selectInningsBowler, scoreDelivery } from "@lcxxvi/domain";
import { createStateHasher } from "./determinism.js";
import { generateDelivery, expectedGeneratorPhase } from "./generator.js";
import { validateT20Field, type T20Session } from "./t20-match.js";

/**
 * Stage 14 super overs for tied T20 exhibitions (`LC_T20_SUPER_OVER_01`; rules in `@lcxxvi/contracts` super-over.ts).
 * Pure and deterministic: the state is a function of the tied match and the command list. Each ball goes through the
 * frozen generator (`generateDelivery`) and scoring kernel (`scoreDelivery`, `reduceInningsLedger`); this module only
 * decides when a super-over innings ends, who may take part, and who won.
 *
 * Generator limits that follow from reusing the frozen engine unchanged: the generator's phase comes from balls bowled in
 * the innings, so every super-over ball uses its early (powerplay) phase and powerplay field limits; fatigue and pitch are
 * held at their end-of-match values.
 */

const hasher = createStateHasher();
const hash = (value: unknown) => hasher.hash(value);
const clone = <T>(value: T): T => structuredClone(value);
const fail = (code: string): never => {
  throw new Error(`LC_SUPER_OVER_${code}`);
};
function assert(value: unknown, code: string): asserts value {
  if (!value) fail(code);
}

/** Batters per side in a super over, and so the wickets that end an innings (one fewer). */
export const SUPER_OVER_BATTERS = 3;
export const SUPER_OVER_BALLS = 6;
/**
 * The frozen ledger accepts only a 120-ball T20 innings with index 0 or 1, so a super-over innings uses that profile and
 * this module stops it at 6 balls. Random addresses stay unique because the attempt ordinal keeps counting up from the
 * match's last delivery: no (innings, ordinal) pair the match used can recur.
 */
const LEDGER_ALLOCATED_BALLS = 120;

export type SuperOverPhase = "AWAITING_LINEUP" | "READY" | "COMPLETE";

type SuperOverInnings = {
  battingTeamId: string;
  bowlingTeamId: string;
  batterIds: string[] | null;
  bowlerId: string | null;
  ledger: InningsLedger | null;
  complete: boolean;
};

export type T20SuperOverState = {
  rulesId: typeof T20_SUPER_OVER_RULES_ID;
  gameId: string;
  baseLastEventHash: string;
  rounds: { roundNumber: number; innings: SuperOverInnings[] }[];
  phase: SuperOverPhase;
  attemptOrdinal: number;
  /** Who batted second in the match: they bat first in the first super over. */
  firstBattingTeamId: string;
  excludedBatters: Record<string, string[]>;
  excludedBowlers: Record<string, string[]>;
  aggression: Record<string, number>;
  deliveries: DeliveryRecorded[];
  /** Null while undecided; also null when the super overs end tied because a side ran out of eligible players. */
  winnerTeamId: string | null;
  completionReason: "WON" | "NO_ELIGIBLE_PLAYERS" | null;
};

function teamOf(session: T20Session, teamId: string) {
  const team = session.setup.teams.find((t) => t.teamId === teamId);
  assert(team, "UNKNOWN_TEAM");
  return team;
}
function otherTeam(session: T20Session, teamId: string): string {
  const team = session.setup.teams.find((t) => t.teamId !== teamId);
  assert(team, "UNKNOWN_TEAM");
  return team.teamId;
}
function playerOf(session: T20Session, playerId: string): Readonly<Player> {
  const found = session.setup.teams.flatMap((t) => t.xi).find((p) => p.playerId === playerId);
  assert(found, "UNKNOWN_PLAYER");
  return found;
}
function namedPosition(slotId: string) {
  const position = FIELD_REGISTRY.positions.find((p) => p.slotId === slotId);
  assert(position, "UNKNOWN_FIELD_POSITION");
  return position;
}

/** True when the match is a completed T20 tie, the only case a super over applies to. */
export function isTiedT20Match(session: T20Session): boolean {
  return session.core.phase === "COMPLETE" && session.core.result?.kind === "TIE";
}

export function eligibleSuperOverBatters(session: T20Session, state: T20SuperOverState, teamId: string): string[] {
  const excluded = new Set(state.excludedBatters[teamId] ?? []);
  return teamOf(session, teamId).playerIds.filter((id) => !excluded.has(id));
}
export function eligibleSuperOverBowlers(session: T20Session, state: T20SuperOverState, teamId: string): string[] {
  const team = teamOf(session, teamId);
  const excluded = new Set(state.excludedBowlers[teamId] ?? []);
  return team.playerIds.filter((id) => id !== team.keeperId && playerOf(session, id).bowlingStyle !== null && !excluded.has(id));
}

function currentInnings(state: T20SuperOverState): SuperOverInnings {
  const round = state.rounds[state.rounds.length - 1];
  assert(round, "NO_ROUND");
  const innings = round.innings[round.innings.length - 1];
  assert(innings, "NO_INNINGS");
  return innings;
}
function inningsIndexFor(state: T20SuperOverState): 0 | 1 {
  return state.rounds[state.rounds.length - 1]!.innings.length === 1 ? 0 : 1;
}

function canStartInnings(session: T20Session, state: T20SuperOverState, battingTeamId: string): boolean {
  return (
    eligibleSuperOverBatters(session, state, battingTeamId).length >= 2 &&
    eligibleSuperOverBowlers(session, state, otherTeam(session, battingTeamId)).length >= 1
  );
}

function openInnings(session: T20Session, state: T20SuperOverState, battingTeamId: string): void {
  const round = state.rounds[state.rounds.length - 1]!;
  if (!canStartInnings(session, state, battingTeamId)) {
    state.phase = "COMPLETE";
    state.completionReason = "NO_ELIGIBLE_PLAYERS";
    return;
  }
  round.innings.push({
    battingTeamId,
    bowlingTeamId: otherTeam(session, battingTeamId),
    batterIds: null,
    bowlerId: null,
    ledger: null,
    complete: false,
  });
  state.phase = "AWAITING_LINEUP";
}

export function createT20SuperOver(session: T20Session): T20SuperOverState {
  assert(isTiedT20Match(session), "MATCH_NOT_TIED");
  const battedSecond = session.core.innings[1]?.innings.battingTeamId;
  assert(battedSecond, "NO_SECOND_INNINGS");
  const state: T20SuperOverState = {
    rulesId: T20_SUPER_OVER_RULES_ID,
    gameId: session.setup.gameId,
    baseLastEventHash: session.lastEventHash,
    rounds: [{ roundNumber: 1, innings: [] }],
    phase: "AWAITING_LINEUP",
    attemptOrdinal: session.core.globalAttemptOrdinal,
    firstBattingTeamId: battedSecond,
    excludedBatters: Object.fromEntries(session.setup.teams.map((t) => [t.teamId, []])),
    excludedBowlers: Object.fromEntries(session.setup.teams.map((t) => [t.teamId, []])),
    aggression: {},
    deliveries: [],
    winnerTeamId: null,
    completionReason: null,
  };
  openInnings(session, state, battedSecond);
  return state;
}

function newLedger(session: T20Session, state: T20SuperOverState, innings: SuperOverInnings, target: number | null): InningsLedger {
  const bat = teamOf(session, innings.battingTeamId);
  const bowl = teamOf(session, innings.bowlingTeamId);
  const order = [...innings.batterIds!, ...bat.playerIds.filter((id) => !innings.batterIds!.includes(id))];
  return validateInningsLedger({
    engineVersion: SCORING_ENGINE_VERSION,
    rulesId: "LC_T20_01",
    nextDeliveryIndex: state.attemptOrdinal,
    batting: Object.fromEntries(bat.playerIds.map((id) => [id, { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false }])),
    bowling: Object.fromEntries(bowl.playerIds.map((id) => [id, { runsConceded: 0, legalBalls: 0, wickets: 0, maidens: 0 }])),
    dismissals: {},
    keeperId: bowl.keeperId,
    outfieldIds: bowl.playerIds.filter((id) => id !== bowl.keeperId).slice(0, 9),
    currentOverRuns: 0,
    innings: {
      index: inningsIndexFor(state),
      battingTeamId: bat.teamId,
      bowlingTeamId: bowl.teamId,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      deliveryAttempts: 0,
      targetToWin: target,
      allocatedBalls: LEDGER_ALLOCATED_BALLS,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
      northBatterId: null,
      southBatterId: null,
      strikerEnd: "NORTH",
      battingOrder: order,
      dismissed: [],
      bowlerId: null,
      previousOverBowlerId: null,
      bowlerLegalBalls: Object.fromEntries(bowl.playerIds.map((id) => [id, 0])),
      freeHitPending: false,
      ballAgeLegalBalls: 0,
      complete: false,
    },
  });
}

/** Opens the innings at the crease once both sides have named their players. */
function startPlay(session: T20Session, state: T20SuperOverState): void {
  const innings = currentInnings(state);
  if (!innings.batterIds || !innings.bowlerId) return;
  const round = state.rounds[state.rounds.length - 1]!;
  const target = round.innings.length === 2 ? round.innings[0]!.ledger!.innings.runs + 1 : null;
  let ledger = newLedger(session, state, innings, target);
  const opener = clone(ledger);
  opener.innings.northBatterId = innings.batterIds[0]!;
  ledger = selectInningsBatter(validateInningsLedger(opener), innings.batterIds[1]!);
  const bowl = teamOf(session, innings.bowlingTeamId);
  const outfield = bowl.playerIds.filter((id) => id !== bowl.keeperId && id !== innings.bowlerId);
  ledger = selectInningsBowler(ledger, innings.bowlerId, outfield);
  innings.ledger = ledger;
  state.phase = "READY";
}

function fieldSlots(ledger: InningsLedger) {
  return [...ledger.outfieldIds].sort().map((id, index) => ({ slotId: T20_POWERPLAY_SLOTS[index]!, playerId: id }));
}

function bowlBall(session: T20Session, state: T20SuperOverState): void {
  const innings = currentInnings(state);
  const ledger = innings.ledger!;
  const context = contextFromLedger(ledger);
  const striker = playerOf(session, context.strikerId);
  const bowler = playerOf(session, context.bowlerId);
  const keeper = playerOf(session, context.keeperId);
  const slots = fieldSlots(ledger);
  validateT20Field(slots, ledger.outfieldIds, striker.batHand, ledger.innings.legalBalls);
  const generated = generateDelivery({
    kind: "GENERATE_DELIVERY",
    generatorVersion: "LC_CONDITIONAL_DELIVERY_V1",
    stagePackId: "synthetic-alpha-01-delivery-v1",
    stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    randomVersion: RANDOM_VERSION,
    probabilityVersion: PROBABILITY_VERSION,
    modelId: PROBABILITY_MODEL_ID,
    modelHash: MODEL_PACK_SHA256,
    lutVersion: EXP_LUT_VERSION,
    lutHash: EXP_LUT_SHA256,
    rulesHash: session.setup.versions.rulesHash,
    matchId: session.setup.matchId,
    seed: session.setup.seed,
    attemptOrdinal: state.attemptOrdinal,
    format: "T20",
    phase: expectedGeneratorPhase("T20", ledger.innings.legalBalls),
    context,
    bowling: {
      bowlingStyle: bowler.bowlingStyle!,
      controlRating: bowler.skills.T20.control,
      movementRating: bowler.skills.T20.movement,
      fatigueBp: session.core.fatigueBp[bowler.playerId] ?? 0,
      line: "STUMPS",
      intendedLength: "GOOD",
      effort: "NORMAL",
      variationId: "stock",
    },
    batting: {
      defenceRating: striker.skills.T20.defence,
      timingRating: striker.skills.T20.timing,
      powerRating: striker.skills.T20.power,
      rotationRating: striker.skills.T20.rotation,
      vsPaceRating: striker.skills.T20.vsPace,
      vsSpinRating: striker.skills.T20.vsSpin,
      aggression: state.aggression[striker.playerId] ?? 3,
      intent: "NORMAL",
      attemptedStroke: true,
      shotSectorWeights: [...striker.shotSectorWeights],
    },
    conditions: { seamBp: session.core.pitch.seamBp, turnBp: session.core.pitch.turnBp },
    field: {
      keeper: { keepingRating: keeper.skills.T20.keeping, catchingRating: keeper.skills.T20.catching, throwingRating: keeper.skills.T20.throwing },
      slots: slots.map((slot) => {
        const fielder = playerOf(session, slot.playerId);
        const position = namedPosition(slot.slotId);
        return {
          playerId: slot.playerId,
          sector: position.sector,
          depth: position.depth,
          role: slot.slotId.startsWith("slip") ? ("SLIP" as const) : ("NORMAL" as const),
          catchingRating: fielder.skills.T20.catching,
          throwingRating: fielder.skills.T20.throwing,
        };
      }),
    },
  });
  const event = scoreDelivery(context, generated.resolution);
  const outcome = reduceInningsLedger(ledger, event);
  innings.ledger = outcome.ledger;
  state.attemptOrdinal += 1;
  state.deliveries.push(event);
  const i = outcome.ledger.innings;
  const wicketsAllowed = innings.batterIds!.length - 1;
  const targetReached = i.targetToWin !== null && i.runs >= i.targetToWin;
  if (i.legalBalls >= SUPER_OVER_BALLS || i.wickets >= wicketsAllowed || targetReached || i.complete) {
    closeInnings(session, state);
  } else if (outcome.observation.requiredBatterEnd) {
    // The third batter comes in after the first wicket.
    const next = innings.batterIds!.find((id) => !i.dismissed.includes(id) && id !== i.northBatterId && id !== i.southBatterId);
    assert(next, "NO_NEXT_BATTER");
    innings.ledger = selectInningsBatter(outcome.ledger, next);
  }
}

function closeInnings(session: T20Session, state: T20SuperOverState): void {
  const innings = currentInnings(state);
  innings.complete = true;
  const i = innings.ledger!.innings;
  state.excludedBatters[innings.battingTeamId] = [...new Set([...(state.excludedBatters[innings.battingTeamId] ?? []), ...i.dismissed])];
  state.excludedBowlers[innings.bowlingTeamId] = [...new Set([...(state.excludedBowlers[innings.bowlingTeamId] ?? []), innings.bowlerId!])];
  const round = state.rounds[state.rounds.length - 1]!;
  if (round.innings.length === 1) {
    openInnings(session, state, innings.bowlingTeamId);
    return;
  }
  const first = round.innings[0]!.ledger!.innings.runs;
  const second = i.runs;
  if (first !== second) {
    state.winnerTeamId = second > first ? innings.battingTeamId : innings.bowlingTeamId;
    state.completionReason = "WON";
    state.phase = "COMPLETE";
    return;
  }
  // Tied again: the side that batted second in this super over bats first in the next.
  state.rounds.push({ roundNumber: round.roundNumber + 1, innings: [] });
  openInnings(session, state, innings.battingTeamId);
}

/** Applies one command. Throws `LC_SUPER_OVER_*` on an illegal command; the input state is not changed. */
export function executeSuperOverCommand(session: T20Session, input: T20SuperOverState, raw: unknown): T20SuperOverState {
  const command = SuperOverCommandSchema.parse(raw);
  const state = clone(input);
  assert(state.phase !== "COMPLETE", "COMPLETE");
  const innings = currentInnings(state);
  switch (command.kind) {
    case "SET_SUPER_OVER_BATTERS": {
      assert(state.phase === "AWAITING_LINEUP" && innings.batterIds === null, "WRONG_PHASE");
      assert(command.teamId === innings.battingTeamId, "NOT_BATTING_TEAM");
      const eligible = new Set(eligibleSuperOverBatters(session, state, command.teamId));
      assert(new Set(command.playerIds).size === command.playerIds.length, "DUPLICATE_BATTER");
      assert(command.playerIds.every((id) => eligible.has(id)), "INELIGIBLE_BATTER");
      assert(command.playerIds.length === Math.min(SUPER_OVER_BATTERS, eligible.size), "BATTER_COUNT");
      innings.batterIds = [...command.playerIds];
      startPlay(session, state);
      break;
    }
    case "SET_SUPER_OVER_BOWLER": {
      assert(state.phase === "AWAITING_LINEUP" && innings.bowlerId === null, "WRONG_PHASE");
      assert(command.teamId === innings.bowlingTeamId, "NOT_BOWLING_TEAM");
      assert(eligibleSuperOverBowlers(session, state, command.teamId).includes(command.playerId), "INELIGIBLE_BOWLER");
      innings.bowlerId = command.playerId;
      startPlay(session, state);
      break;
    }
    case "SET_SUPER_OVER_AGGRESSION": {
      assert(state.phase === "READY", "WRONG_PHASE");
      const i = innings.ledger!.innings;
      assert([i.northBatterId, i.southBatterId].includes(command.playerId), "BATTER_NOT_ACTIVE");
      state.aggression[command.playerId] = command.aggression;
      break;
    }
    case "BOWL_SUPER_OVER_BALL": {
      assert(state.phase === "READY", "WRONG_PHASE");
      bowlBall(session, state);
      break;
    }
  }
  return state;
}

/** A sensible automatic choice for the side whose decision is pending, for the tactical captain and for tests. */
export function superOverAutopilotCommand(session: T20Session, state: T20SuperOverState): SuperOverCommand | null {
  if (state.phase === "COMPLETE") return null;
  if (state.phase === "READY") return { kind: "BOWL_SUPER_OVER_BALL" };
  const innings = currentInnings(state);
  if (innings.batterIds === null) {
    const eligible = eligibleSuperOverBatters(session, state, innings.battingTeamId);
    return { kind: "SET_SUPER_OVER_BATTERS", teamId: innings.battingTeamId, playerIds: eligible.slice(0, SUPER_OVER_BATTERS) };
  }
  const bowlers = eligibleSuperOverBowlers(session, state, innings.bowlingTeamId)
    .map((id) => playerOf(session, id))
    .sort((a, b) => b.skills.T20.control - a.skills.T20.control || (a.playerId < b.playerId ? -1 : 1));
  return { kind: "SET_SUPER_OVER_BOWLER", teamId: innings.bowlingTeamId, playerId: bowlers[0]!.playerId };
}

/** Which side must act next, or null when the next step is a ball (or nothing). */
export function superOverPendingTeam(state: T20SuperOverState): { teamId: string; decision: "BATTERS" | "BOWLER" } | null {
  if (state.phase !== "AWAITING_LINEUP") return null;
  const innings = currentInnings(state);
  if (innings.batterIds === null) return { teamId: innings.battingTeamId, decision: "BATTERS" };
  return { teamId: innings.bowlingTeamId, decision: "BOWLER" };
}

export function summariseSuperOver(state: T20SuperOverState): SuperOverRoundSummary[] {
  return state.rounds.map((round) => ({
    roundNumber: round.roundNumber,
    innings: round.innings
      .filter((innings) => innings.ledger !== null)
      .map((innings) => ({
        battingTeamId: innings.battingTeamId,
        runs: innings.ledger!.innings.runs,
        wickets: innings.ledger!.innings.wickets,
        legalBalls: innings.ledger!.innings.legalBalls,
      })),
  }));
}

export function superOverStateSha256(state: T20SuperOverState): string {
  return hash(state);
}

/** Replays commands from the tied match. Throws if any command is illegal. */
export function replaySuperOver(session: T20Session, commands: readonly SuperOverCommand[]): T20SuperOverState {
  let state = createT20SuperOver(session);
  for (const command of commands) state = executeSuperOverCommand(session, state, command);
  return state;
}

export function superOverRecord(state: T20SuperOverState, commands: readonly SuperOverCommand[]): T20SuperOverRecord {
  return T20SuperOverRecordSchema.parse({
    schemaId: T20_SUPER_OVER_RECORD_SCHEMA_ID,
    rulesId: T20_SUPER_OVER_RULES_ID,
    gameId: state.gameId,
    baseLastEventHash: state.baseLastEventHash,
    commands: [...commands],
    stateSha256: superOverStateSha256(state),
  });
}

/** Verifies a stored record against the tied match it claims to belong to, and returns the replayed state. */
export function verifySuperOverRecord(session: T20Session, raw: unknown): T20SuperOverState {
  const record = T20SuperOverRecordSchema.parse(raw);
  assert(record.gameId === session.setup.gameId && record.baseLastEventHash === session.lastEventHash, "RECORD_MATCH_MISMATCH");
  const state = replaySuperOver(session, record.commands);
  assert(superOverStateSha256(state) === record.stateSha256, "RECORD_STATE_MISMATCH");
  return state;
}
