import {
  SCORING_ENGINE_VERSION,
  PROBABILITY_VERSION,
  RANDOM_VERSION,
  EXP_LUT_VERSION,
  PROBABILITY_MODEL_ID,
  RainMatchRecordSchema,
  ExtraRulesCommandSchema,
  ExhibitionRulesRecordSchema,
  ExtraRulesRecordSchema,
  EXTRA_RULES_RECORD_SCHEMA_ID,
  T20_DRS_RULES_ID,
  ODI_DRS_RULES_ID,
  REVIEWS_PER_INNINGS,
  type BallTracking,
  type DeliveryResolution,
  type ExtraRulesCommand,
  type ExhibitionRulesRecord,
  RainPlanSchema,
  RAIN_MATCH_RECORD_SCHEMA_ID,
  T20_RAIN_RULES_ID,
  ODI_RAIN_RULES_ID,
  type DeliveryRecorded,
  type InningsLedger,
  type Player,
  type RainPlan,
  type RainResult,
  type RainStoppageApplied,
  type RainStoppagePlan,
} from "@lcxxvi/contracts";
import {
  FIELD_REGISTRY,
  ODI_FIELD_REGISTRY,
  T20_POWERPLAY_SLOTS,
  T20_LATER_SLOTS,
  ODI_POWERPLAY_SLOTS,
  ODI_MIDDLE_SLOTS,
  ODI_LATE_SLOTS,
  T20_CONDITION_POLICY,
  ODI_CONDITION_POLICY,
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
  EXP_LUT_SHA256,
  FROZEN_WORLD_PINS,
} from "@lcxxvi/data";
import { validateInningsLedger, contextFromLedger, reduceInningsLedger, selectInningsBatter, selectInningsBowler, scoreDelivery } from "@lcxxvi/domain";
import { createRandomService, createStateHasher } from "./determinism.js";
import { generateDelivery, expectedGeneratorPhase } from "./generator.js";
import { validateT20Field } from "./t20-match.js";
import { validateODIField } from "./odi-match.js";
import {
  isVerifiedFrozenT20Setup,
  isVerifiedFrozenODISetup,
  validateT20MatchSetup,
  validateODIMatchSetup,
  type FrozenT20Setup,
  type FrozenODISetup,
} from "./world-setup.js";
import { generatorRuleHash } from "./generator.js";
import { inningsResources, parAtStoppage, revisedTarget, type RainInterruption } from "./rain-targets.js";
import { drawAppeal, notOutResolution, outResolution, type AppealKind, type Decisive, type ReviewCue } from "./umpire-reviews.js";

/** Commands the engine accepts: every rain-match command, plus the review decision when reviews are on. */
export type RainCommand = ExtraRulesCommand;

/**
 * Stage 14 rain-affected T20 and one-day exhibitions (`LC_T20_RAIN_01`, `LC_ODI_RAIN_01`; owner decisions of 17 and
 * 18 November 2026). Contracts and rules summary in `@lcxxvi/contracts` rain-match.ts.
 *
 * A separate engine that wraps the frozen one, the same way the super-over engine does. Every ball goes through the
 * frozen generator (`generateDelivery`), scoring kernel (`scoreDelivery`) and innings ledger (`reduceInningsLedger`), so
 * ball outcomes follow exactly the same model. This module decides only:
 * - when rain stops play, from the match seed (`WEATHER` random domain, its own stage name, so no delivery draw moves);
 * - how many overs each innings loses, and when a shortened innings ends;
 * - each bowler's limit (one fifth of the innings' overs, rounded up);
 * - the revised target and the result, from the fictional resource table (`rain-targets.ts`).
 *
 * Limits that follow from reusing the frozen engine unchanged (documented, not hidden):
 * - The frozen ledger only accepts a full 120 or 300 ball allocation, so each ledger keeps that allocation and this
 *   module stops the innings at its shortened length.
 * - The generator's phase (and so the field restrictions) comes from balls bowled, as in a full innings. A shortened
 *   innings therefore has the full-length powerplay and may never reach the late phase.
 * - Bowling plans are the stock plan at normal effort; fatigue and pitch wear use the frozen formats' condition rules.
 */

const hasher = createStateHasher();
const random = createRandomService();
const hash = (value: unknown) => hasher.hash(value);
const clone = <T>(value: T): T => structuredClone(value);
const fail = (code: string): never => {
  throw new Error(`LC_RAIN_${code}`);
};
function assert(value: unknown, code: string): asserts value {
  if (!value) fail(code);
}

export type RainSetup = FrozenT20Setup | FrozenODISetup;

const PROFILES = {
  T20: {
    rulesId: T20_RAIN_RULES_ID,
    fullBalls: 120,
    /** A result needs this many balls in the second innings (5 overs). */
    minBalls: 30,
    maxOversLost: 8,
    registry: FIELD_REGISTRY,
    slots: (legalBalls: number) => (legalBalls < 36 ? T20_POWERPLAY_SLOTS : T20_LATER_SLOTS),
    validateField: validateT20Field,
    policy: T20_CONDITION_POLICY,
  },
  ODI: {
    rulesId: ODI_RAIN_RULES_ID,
    fullBalls: 300,
    /** A result needs 20 overs in the second innings. */
    minBalls: 120,
    maxOversLost: 25,
    registry: ODI_FIELD_REGISTRY,
    slots: (legalBalls: number) => (legalBalls < 60 ? ODI_POWERPLAY_SLOTS : legalBalls < 240 ? ODI_MIDDLE_SLOTS : ODI_LATE_SLOTS),
    validateField: validateODIField,
    policy: ODI_CONDITION_POLICY,
  },
};
function profileOf(setup: RainSetup) {
  return PROFILES[setup.format];
}

export type RainPhase = "TOSS" | "AWAITING_INNINGS" | "AWAITING_BATTER" | "AWAITING_BOWLER" | "READY" | "AWAITING_REVIEW" | "COMPLETE";

/** Which opt-in rules a match is played under. Rain alone is the original rain-match record. */
export type ExhibitionRuleOptions = { rain: boolean; reviews: boolean };
export const RAIN_ONLY: ExhibitionRuleOptions = Object.freeze({ rain: true, reviews: false });

export type ReviewOutcome = "NOT_REVIEWED" | "NO_REVIEWS_LEFT" | "OVERTURNED" | "STRUCK_DOWN" | "UMPIRES_CALL";
export type PendingReview = {
  kind: AppealKind;
  strikerId: string;
  bowlerId: string;
  onFieldOut: boolean;
  /** Hidden from any screen until the review is decided. */
  decisive: Decisive;
  tracking: BallTracking | null;
  cue: ReviewCue;
  reviewTeamId: string;
  outResolution: DeliveryResolution;
  notOutResolution: DeliveryResolution;
};
export type ReviewLogEntry = {
  inningsIndex: 0 | 1;
  legalBallsBefore: number;
  kind: AppealKind;
  strikerId: string;
  bowlerId: string;
  onFieldOut: boolean;
  reviewTeamId: string;
  outcome: ReviewOutcome;
  /** Shown once a review has happened (leg-before only). */
  tracking: BallTracking | null;
  finalOut: boolean;
};
export type ReviewState = {
  rulesId: typeof T20_DRS_RULES_ID | typeof ODI_DRS_RULES_ID;
  /** Unsuccessful reviews each side has left in the current innings. */
  reviewsLeft: Record<string, number>;
  pending: PendingReview | null;
  log: ReviewLogEntry[];
};

export type RainMatchState = {
  rulesId: typeof T20_RAIN_RULES_ID | typeof ODI_RAIN_RULES_ID;
  format: "T20" | "ODI";
  gameId: string;
  matchId: string;
  /** Drawn from the seed at creation. A screen must not show stoppages that have not happened yet. */
  plan: RainPlan;
  /** Index of the next planned stoppage not yet applied or skipped. */
  nextStoppage: number;
  phase: RainPhase;
  tossWinnerId: string | null;
  innings: InningsLedger[];
  activeInningsIndex: 0 | 1;
  /** Current allocation of each innings, in legal balls. */
  allocations: [number, number];
  /** Allocation of each innings when it started (the first innings always starts at the full allocation). */
  startAllocations: [number, number];
  /** Where each innings ended on its own terms (all out, target reached or allocation used up). */
  inningsClosed: [boolean, boolean];
  stoppages: RainStoppageApplied[];
  target: number | null;
  attemptOrdinal: number;
  fatigueBp: Record<string, number>;
  pitch: RainSetup["ground"]["pitchPrior"];
  aggression: Record<string, number>;
  lastDelivery: DeliveryRecorded | null;
  result: RainResult | null;
  /** Present (and true) only when the seeded weather is off. Absent in rain-only matches, so their state hash is unchanged. */
  weatherOff?: true;
  /** Present only when player reviews are on. */
  reviews?: ReviewState;
};

type Team = RainSetup["teams"][number];
function teamOf(setup: RainSetup, teamId: string): Team {
  const team = setup.teams.find((t) => t.teamId === teamId);
  assert(team, "UNKNOWN_TEAM");
  return team;
}
function otherTeam(setup: RainSetup, teamId: string): string {
  const team = setup.teams.find((t) => t.teamId !== teamId);
  assert(team, "UNKNOWN_TEAM");
  return team.teamId;
}
function playerOf(setup: RainSetup, playerId: string): Readonly<Player> {
  const found = setup.teams.flatMap((t) => t.xi).find((p) => p.playerId === playerId);
  assert(found, "UNKNOWN_PLAYER");
  return found;
}
function ledgerOf(state: RainMatchState): InningsLedger {
  const ledger = state.innings[state.activeInningsIndex];
  assert(ledger, "NO_ACTIVE_INNINGS");
  return ledger;
}

/** Overs a bowler may bowl in an innings of `allocatedBalls`: one fifth of the overs, rounded up. */
export function rainBowlerLimitBalls(allocatedBalls: number): number {
  return Math.ceil(Math.ceil(allocatedBalls / 6) / 5) * 6;
}

/** The seeded weather for a match. Pure: the same seed and match id always give the same plan. */
export function drawRainPlan(setup: RainSetup): RainPlan {
  const profile = profileOf(setup);
  const fullOvers = profile.fullBalls / 6;
  let drawIndex = 0;
  const draw = () =>
    random.uint32({ seed: setup.seed, domain: "WEATHER", entityId: setup.matchId, eventOrdinal: 0, stageName: "lo-rain-plan", drawIndex: drawIndex++ });
  const count = draw() % 10 < 7 ? 1 : 2;
  const stoppages: RainStoppagePlan[] = [];
  for (let n = 0; n < count; n++) {
    const inningsIndex = (draw() % 2) as 0 | 1;
    const atOver = 2 + (draw() % (fullOvers - 4));
    const oversLost = 1 + (draw() % profile.maxOversLost);
    const terminalDraw = draw() % 4 === 0;
    stoppages.push({ inningsIndex, atLegalBall: atOver * 6, oversLost, terminal: terminalDraw });
  }
  stoppages.sort((a, b) => a.inningsIndex - b.inningsIndex || a.atLegalBall - b.atLegalBall);
  const unique = stoppages.filter((s, i) => i === 0 || s.inningsIndex !== stoppages[i - 1]!.inningsIndex || s.atLegalBall !== stoppages[i - 1]!.atLegalBall);
  // Only the last stoppage can end the match, and only in the second innings.
  const final = unique.map((s, i) => ({ ...s, terminal: s.terminal && s.inningsIndex === 1 && i === unique.length - 1 }));
  return RainPlanSchema.parse({ stoppages: final });
}

export function createRainMatch(setup: RainSetup, options: ExhibitionRuleOptions = RAIN_ONLY): RainMatchState {
  assert(isVerifiedFrozenT20Setup(setup) || isVerifiedFrozenODISetup(setup), "INVALID_FROZEN_SETUP");
  assert(options.rain || options.reviews, "NO_RULES_CHOSEN");
  assert(setup.versions.rules === (setup.format === "T20" ? "LC_T20_01" : "LC_ODI_01"), "UNSUPPORTED_RULES");
  const profile = profileOf(setup);
  return {
    rulesId: profile.rulesId,
    format: setup.format,
    gameId: setup.gameId,
    matchId: setup.matchId,
    plan: options.rain ? drawRainPlan(setup) : { stoppages: [] },
    nextStoppage: 0,
    phase: "TOSS",
    tossWinnerId: null,
    innings: [],
    activeInningsIndex: 0,
    allocations: [profile.fullBalls, profile.fullBalls],
    startAllocations: [profile.fullBalls, profile.fullBalls],
    inningsClosed: [false, false],
    stoppages: [],
    target: null,
    attemptOrdinal: 0,
    fatigueBp: Object.fromEntries(setup.teams.flatMap((t) => t.playerIds).map((id) => [id, 0])),
    pitch: clone(setup.ground.pitchPrior),
    aggression: {},
    lastDelivery: null,
    result: null,
    ...(options.rain ? {} : { weatherOff: true as const }),
    ...(options.reviews
      ? { reviews: { rulesId: setup.format === "T20" ? T20_DRS_RULES_ID : ODI_DRS_RULES_ID, reviewsLeft: {}, pending: null, log: [] } }
      : {}),
  };
}

/** The opt-in rules a match state was created with. */
export function exhibitionRuleOptions(state: RainMatchState): ExhibitionRuleOptions {
  return { rain: state.weatherOff !== true, reviews: state.reviews !== undefined };
}

function newLedger(setup: RainSetup, state: RainMatchState, battingTeamId: string, index: 0 | 1, target: number | null): InningsLedger {
  const bat = teamOf(setup, battingTeamId);
  const bowl = teamOf(setup, otherTeam(setup, battingTeamId));
  return validateInningsLedger({
    engineVersion: SCORING_ENGINE_VERSION,
    rulesId: setup.format === "T20" ? "LC_T20_01" : "LC_ODI_01",
    nextDeliveryIndex: state.attemptOrdinal,
    batting: Object.fromEntries(bat.playerIds.map((id) => [id, { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false }])),
    bowling: Object.fromEntries(bowl.playerIds.map((id) => [id, { runsConceded: 0, legalBalls: 0, wickets: 0, maidens: 0 }])),
    dismissals: {},
    keeperId: bowl.keeperId,
    outfieldIds: bowl.playerIds.filter((id) => id !== bowl.keeperId).slice(0, 9),
    currentOverRuns: 0,
    innings: {
      index,
      battingTeamId: bat.teamId,
      bowlingTeamId: bowl.teamId,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      deliveryAttempts: 0,
      targetToWin: target,
      allocatedBalls: profileOf(setup).fullBalls,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
      northBatterId: null,
      southBatterId: null,
      strikerEnd: "NORTH",
      battingOrder: [...bat.playerIds],
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

function interruptionsFor(state: RainMatchState, inningsIndex: 0 | 1): RainInterruption[] {
  return state.stoppages
    .filter((s) => s.inningsIndex === inningsIndex && !s.terminal)
    .map((s) => ({ ballsBowled: s.legalBalls, wicketsLost: s.wickets, ballsLost: s.ballsLost }));
}
function firstResources(setup: RainSetup, state: RainMatchState): number {
  return inningsResources(setup.format, state.startAllocations[0], interruptionsFor(state, 0));
}
function secondResources(setup: RainSetup, state: RainMatchState): number {
  return inningsResources(setup.format, state.startAllocations[1], interruptionsFor(state, 1));
}
/** The second innings target: the plain target unless a stoppage changed either innings. */
function computeTarget(setup: RainSetup, state: RainMatchState): number {
  const runs = state.innings[0]!.innings.runs;
  if (state.stoppages.length === 0) return runs + 1;
  return revisedTarget(setup.format, runs, firstResources(setup, state), secondResources(setup, state));
}
function method(state: RainMatchState): RainResult["method"] {
  return state.stoppages.length === 0 ? "STANDARD" : "RESOURCE_TABLE";
}

function startInnings(setup: RainSetup, state: RainMatchState, battingTeamId: string, index: 0 | 1): void {
  if (index === 1) {
    state.startAllocations[1] = state.allocations[1];
    state.target = computeTarget(setup, state);
  }
  state.innings.push(newLedger(setup, state, battingTeamId, index, index === 1 ? state.target : null));
  if (state.reviews) state.reviews.reviewsLeft = Object.fromEntries(setup.teams.map((t) => [t.teamId, REVIEWS_PER_INNINGS]));
  state.activeInningsIndex = index;
  state.phase = "AWAITING_BATTER";
  // Planned stoppages for an innings that is already over can no longer happen.
  while (state.nextStoppage < state.plan.stoppages.length && state.plan.stoppages[state.nextStoppage]!.inningsIndex < index) state.nextStoppage++;
}

function finish(state: RainMatchState, result: RainResult): void {
  state.result = result;
  state.phase = "COMPLETE";
}

function decideSecondInnings(setup: RainSetup, state: RainMatchState): void {
  const i = ledgerOf(state).innings;
  const target = state.target!;
  if (i.runs >= target) {
    finish(state, { kind: "WIN", winnerTeamId: i.battingTeamId, marginType: "WICKETS", margin: 10 - i.wickets, method: method(state) });
  } else if (i.runs === target - 1) {
    finish(state, { kind: "TIE", winnerTeamId: null, marginType: null, margin: null, method: method(state) });
  } else {
    finish(state, { kind: "WIN", winnerTeamId: i.bowlingTeamId, marginType: "RUNS", margin: target - 1 - i.runs, method: method(state) });
  }
  void setup;
}

function closeInnings(setup: RainSetup, state: RainMatchState): void {
  state.inningsClosed[state.activeInningsIndex] = true;
  if (state.activeInningsIndex === 0) {
    startInnings(setup, state, ledgerOf(state).innings.bowlingTeamId, 1);
    return;
  }
  decideSecondInnings(setup, state);
}

function inningsOver(state: RainMatchState): boolean {
  const l = ledgerOf(state);
  return l.innings.complete || l.innings.legalBalls >= state.allocations[state.activeInningsIndex];
}

/** Applies the planned stoppage due now, if any. Returns true when the match ended. */
function applyDueStoppage(setup: RainSetup, state: RainMatchState): boolean {
  const index = state.activeInningsIndex;
  const i = ledgerOf(state).innings;
  // Skip stoppages that can no longer happen in this innings.
  while (state.nextStoppage < state.plan.stoppages.length) {
    const planned = state.plan.stoppages[state.nextStoppage]!;
    if (planned.inningsIndex > index) break;
    const stale = planned.inningsIndex < index || planned.atLegalBall < i.legalBalls || planned.atLegalBall >= state.allocations[index];
    if (!stale) break;
    state.nextStoppage++;
  }
  const planned = state.plan.stoppages[state.nextStoppage];
  if (!planned || planned.inningsIndex !== index || planned.atLegalBall !== i.legalBalls || i.complete) return false;
  state.nextStoppage++;
  const profile = profileOf(setup);
  if (planned.terminal) {
    state.stoppages.push({
      inningsIndex: index,
      legalBalls: i.legalBalls,
      wickets: i.wickets,
      runs: i.runs,
      ballsLost: state.allocations[index] - i.legalBalls,
      allocations: [state.allocations[0], i.legalBalls],
      terminal: true,
      targetAfter: state.target,
    });
    if (i.legalBalls < profile.minBalls) {
      finish(state, { kind: "NO_RESULT", winnerTeamId: null, marginType: null, margin: null, method: "RESOURCE_TABLE" });
      return true;
    }
    const par = parAtStoppage({
      format: setup.format,
      firstInningsRuns: state.innings[0]!.innings.runs,
      firstResources: firstResources(setup, state),
      secondResourcesAvailable: secondResources(setup, state),
      ballsLeft: state.allocations[1] - i.legalBalls,
      wicketsLost: i.wickets,
    });
    state.allocations[1] = i.legalBalls;
    if (i.runs > par) finish(state, { kind: "WIN", winnerTeamId: i.battingTeamId, marginType: "RUNS", margin: i.runs - par, method: "RESOURCE_TABLE" });
    else if (i.runs === par) finish(state, { kind: "TIE", winnerTeamId: null, marginType: null, margin: null, method: "RESOURCE_TABLE" });
    else finish(state, { kind: "WIN", winnerTeamId: i.bowlingTeamId, marginType: "RUNS", margin: par - i.runs, method: "RESOURCE_TABLE" });
    return true;
  }
  const floor = Math.max(i.legalBalls, profile.minBalls);
  if (index === 0) {
    const perSide = Math.ceil(planned.oversLost / 2) * 6;
    const next = Math.max(floor, state.allocations[0] - perSide);
    const lost = state.allocations[0] - next;
    state.allocations = [next, next];
    state.stoppages.push({
      inningsIndex: 0,
      legalBalls: i.legalBalls,
      wickets: i.wickets,
      runs: i.runs,
      ballsLost: lost,
      allocations: [next, next],
      terminal: false,
      targetAfter: null,
    });
    return false;
  }
  const next = Math.max(floor, state.allocations[1] - planned.oversLost * 6);
  const lost = state.allocations[1] - next;
  state.allocations[1] = next;
  state.stoppages.push({
    inningsIndex: 1,
    legalBalls: i.legalBalls,
    wickets: i.wickets,
    runs: i.runs,
    ballsLost: lost,
    allocations: [state.allocations[0], next],
    terminal: false,
    targetAfter: null,
  });
  state.target = computeTarget(setup, state);
  state.stoppages[state.stoppages.length - 1]!.targetAfter = state.target;
  const ledger = clone(ledgerOf(state));
  ledger.innings.targetToWin = state.target;
  if (ledger.innings.runs >= state.target) ledger.innings.complete = true;
  state.innings[1] = validateInningsLedger(ledger);
  if (ledger.innings.runs >= state.target) {
    decideSecondInnings(setup, state);
    return true;
  }
  return false;
}

function fieldSlots(setup: RainSetup, ledger: InningsLedger) {
  const slots = profileOf(setup).slots(ledger.innings.legalBalls);
  return [...ledger.outfieldIds].sort().map((id, index) => ({ slotId: slots[index]!, playerId: id }));
}
function namedPosition(setup: RainSetup, slotId: string) {
  const position = profileOf(setup).registry.positions.find((p) => p.slotId === slotId);
  assert(position, "UNKNOWN_FIELD_POSITION");
  return position;
}

function conditionsUpdate(setup: RainSetup, state: RainMatchState, event: DeliveryRecorded): void {
  const bowler = playerOf(setup, event.bowlerId);
  const spin = !(["FAST", "MEDIUM"] as string[]).includes(bowler.bowlingStyle ?? "");
  const base = spin ? 12 : 20;
  const factor = profileOf(setup).policy.effortFactorBp.NORMAL;
  const added = Math.floor((base * factor + 5000) / 10000);
  state.fatigueBp[event.bowlerId] = Math.min(10000, (state.fatigueBp[event.bowlerId] ?? 0) + added);
  if (event.legalBall) {
    const pitch = clone(state.pitch);
    state.pitch = pitch;
    pitch.wearPoints += 1;
    if (pitch.wearPoints % 100 === 0) {
      pitch.turnBp = Math.min(10000, pitch.turnBp + 20);
      pitch.variabilityBp = Math.min(10000, pitch.variabilityBp + 10);
      pitch.seamBp = Math.max(0, pitch.seamBp - 10);
    }
  }
}

function bowlBall(setup: RainSetup, state: RainMatchState): void {
  const ledger = ledgerOf(state);
  const context = contextFromLedger(ledger);
  const striker = playerOf(setup, context.strikerId);
  const bowler = playerOf(setup, context.bowlerId);
  const keeper = playerOf(setup, context.keeperId);
  const format = setup.format;
  const slots = fieldSlots(setup, ledger);
  profileOf(setup).validateField(slots, ledger.outfieldIds, striker.batHand, ledger.innings.legalBalls);
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
    rulesHash: setup.versions.rulesHash,
    matchId: setup.matchId,
    seed: setup.seed,
    attemptOrdinal: state.attemptOrdinal,
    format,
    phase: expectedGeneratorPhase(format, ledger.innings.legalBalls),
    context,
    bowling: {
      bowlingStyle: bowler.bowlingStyle!,
      controlRating: bowler.skills[format].control,
      movementRating: bowler.skills[format].movement,
      fatigueBp: state.fatigueBp[bowler.playerId] ?? 0,
      line: "STUMPS",
      intendedLength: "GOOD",
      effort: "NORMAL",
      variationId: "stock",
    },
    batting: {
      defenceRating: striker.skills[format].defence,
      timingRating: striker.skills[format].timing,
      powerRating: striker.skills[format].power,
      rotationRating: striker.skills[format].rotation,
      vsPaceRating: striker.skills[format].vsPace,
      vsSpinRating: striker.skills[format].vsSpin,
      aggression: state.aggression[striker.playerId] ?? 2,
      intent: "NORMAL",
      attemptedStroke: true,
      shotSectorWeights: [...striker.shotSectorWeights],
    },
    conditions: { seamBp: state.pitch.seamBp, turnBp: state.pitch.turnBp },
    field: {
      keeper: { keepingRating: keeper.skills[format].keeping, catchingRating: keeper.skills[format].catching, throwingRating: keeper.skills[format].throwing },
      slots: slots.map((slot) => {
        const fielder = playerOf(setup, slot.playerId);
        const position = namedPosition(setup, slot.slotId);
        return {
          playerId: slot.playerId,
          sector: position.sector,
          depth: position.depth,
          role: slot.slotId.startsWith("slip") ? ("SLIP" as const) : ("NORMAL" as const),
          catchingRating: fielder.skills[format].catching,
          throwingRating: fielder.skills[format].throwing,
        };
      }),
    },
  });
  if (state.reviews) {
    const contact = generated.trace.find((t) => t.stageName === "contact")?.selectedCategoryId ?? null;
    const appeal = drawAppeal({ seed: setup.seed, matchId: setup.matchId, attemptOrdinal: state.attemptOrdinal, context, resolution: generated.resolution, contact });
    if (appeal) {
      const i = ledger.innings;
      const pending: PendingReview = {
        kind: appeal.kind,
        strikerId: context.strikerId,
        bowlerId: context.bowlerId,
        onFieldOut: appeal.onFieldOut,
        decisive: appeal.decisive,
        tracking: appeal.tracking,
        cue: appeal.cue,
        reviewTeamId: appeal.onFieldOut ? i.battingTeamId : i.bowlingTeamId,
        outResolution: outResolution(generated.resolution, context, appeal.kind),
        notOutResolution: notOutResolution(generated.resolution, context),
      };
      if ((state.reviews.reviewsLeft[pending.reviewTeamId] ?? 0) > 0) {
        state.reviews.pending = pending;
        state.phase = "AWAITING_REVIEW";
        return;
      }
      logReview(state, pending, "NO_REVIEWS_LEFT", pending.onFieldOut);
      commitBall(setup, state, pending.onFieldOut ? pending.outResolution : pending.notOutResolution);
      return;
    }
  }
  commitBall(setup, state, generated.resolution);
}

function logReview(state: RainMatchState, pending: PendingReview, outcome: ReviewOutcome, finalOut: boolean): void {
  const reviewed = outcome === "OVERTURNED" || outcome === "STRUCK_DOWN" || outcome === "UMPIRES_CALL";
  state.reviews!.log.push({
    inningsIndex: state.activeInningsIndex,
    legalBallsBefore: ledgerOf(state).innings.legalBalls,
    kind: pending.kind,
    strikerId: pending.strikerId,
    bowlerId: pending.bowlerId,
    onFieldOut: pending.onFieldOut,
    reviewTeamId: pending.reviewTeamId,
    outcome,
    tracking: reviewed ? pending.tracking : null,
    finalOut,
  });
}

/** Decides a pending review, then records the ball as finally decided. */
function decideReview(setup: RainSetup, state: RainMatchState, review: boolean): void {
  const pending = state.reviews!.pending!;
  state.reviews!.pending = null;
  let finalOut = pending.onFieldOut;
  let outcome: ReviewOutcome = "NOT_REVIEWED";
  if (review) {
    if (pending.decisive === "UMPIRES_CALL") outcome = "UMPIRES_CALL";
    else {
      finalOut = pending.decisive === "OUT";
      outcome = finalOut !== pending.onFieldOut ? "OVERTURNED" : "STRUCK_DOWN";
      if (outcome === "STRUCK_DOWN") state.reviews!.reviewsLeft[pending.reviewTeamId] = (state.reviews!.reviewsLeft[pending.reviewTeamId] ?? 1) - 1;
    }
  }
  logReview(state, pending, outcome, finalOut);
  commitBall(setup, state, finalOut ? pending.outResolution : pending.notOutResolution);
}

/** Scores and records one ball through the frozen kernel and ledger, then applies rain and the end of the innings. */
function commitBall(setup: RainSetup, state: RainMatchState, resolution: DeliveryResolution): void {
  const ledger = ledgerOf(state);
  const context = contextFromLedger(ledger);
  const event = scoreDelivery(context, resolution);
  const outcome = reduceInningsLedger(ledger, event);
  state.innings[state.activeInningsIndex] = outcome.ledger;
  state.attemptOrdinal += 1;
  state.lastDelivery = event;
  conditionsUpdate(setup, state, event);
  const i = outcome.ledger.innings;
  const overCompleted = event.legalBall && i.legalBalls % 6 === 0;
  if (overCompleted) {
    for (const id of teamOf(setup, i.bowlingTeamId).playerIds) {
      if (id !== event.bowlerId) state.fatigueBp[id] = Math.max(0, (state.fatigueBp[id] ?? 0) - 15);
    }
    if (applyDueStoppage(setup, state)) return;
  }
  if (inningsOver(state)) {
    closeInnings(setup, state);
    return;
  }
  const after = ledgerOf(state).innings;
  state.phase = after.northBatterId === null || after.southBatterId === null ? "AWAITING_BATTER" : after.bowlerId === null ? "AWAITING_BOWLER" : "READY";
}

/** Bowlers the fielding side may choose for the next over. */
export function eligibleRainBowlers(setup: RainSetup, state: RainMatchState): string[] {
  const l = ledgerOf(state);
  const team = teamOf(setup, l.innings.bowlingTeamId);
  const limit = rainBowlerLimitBalls(state.allocations[state.activeInningsIndex]);
  const able = team.playerIds.filter((id) => id !== team.keeperId && playerOf(setup, id).bowlingStyle !== null && id !== l.innings.previousOverBowlerId);
  const withinLimit = able.filter((id) => l.bowling[id]!.legalBalls < limit);
  // A late cut in overs can leave no bowler under the new limit; then anyone may bowl rather than the match stalling.
  return withinLimit.length > 0 ? withinLimit : able.filter((id) => l.bowling[id]!.legalBalls < (setup.format === "T20" ? 24 : 60));
}
/** Batters the batting side may send in next. */
export function eligibleRainBatters(setup: RainSetup, state: RainMatchState): string[] {
  const l = ledgerOf(state);
  const occupied = new Set([l.innings.northBatterId, l.innings.southBatterId, ...l.innings.dismissed]);
  return teamOf(setup, l.innings.battingTeamId).playerIds.filter((id) => !occupied.has(id));
}

/** Which side must decide next, or null when the next step is a ball (or nothing). */
export function rainPendingDecision(setup: RainSetup, state: RainMatchState): { teamId: string; decision: "TOSS" | "INNINGS" | "BATTER" | "BOWLER" | "REVIEW" } | null {
  if (state.phase === "AWAITING_REVIEW") return { teamId: state.reviews!.pending!.reviewTeamId, decision: "REVIEW" };
  if (state.phase === "TOSS") return { teamId: setup.teams[0].teamId, decision: "TOSS" };
  if (state.phase === "AWAITING_INNINGS") return { teamId: state.tossWinnerId!, decision: "INNINGS" };
  if (state.phase === "AWAITING_BATTER") return { teamId: ledgerOf(state).innings.battingTeamId, decision: "BATTER" };
  if (state.phase === "AWAITING_BOWLER") return { teamId: ledgerOf(state).innings.bowlingTeamId, decision: "BOWLER" };
  return null;
}

/** Applies one command. Throws `LC_RAIN_*` on an illegal command; the input state is not changed. */
export function executeRainCommand(setup: RainSetup, input: RainMatchState, raw: unknown): RainMatchState {
  const command = ExtraRulesCommandSchema.parse(raw);
  const state = clone(input);
  assert(state.phase !== "COMPLETE", "COMPLETE");
  switch (command.kind) {
    case "CALL_TOSS": {
      assert(state.phase === "TOSS", "WRONG_PHASE");
      teamOf(setup, command.teamId);
      const coin = random.uint32({ seed: setup.seed, domain: "TOSS", entityId: setup.matchId, eventOrdinal: 0, stageName: "coin", drawIndex: 0 }) % 2 === 0 ? "HEADS" : "TAILS";
      state.tossWinnerId = command.call === coin ? command.teamId : otherTeam(setup, command.teamId);
      state.phase = "AWAITING_INNINGS";
      break;
    }
    case "CHOOSE_INNINGS": {
      assert(state.phase === "AWAITING_INNINGS", "WRONG_PHASE");
      assert(command.teamId === state.tossWinnerId, "NOT_TOSS_WINNER");
      startInnings(setup, state, command.choice === "BAT" ? command.teamId : otherTeam(setup, command.teamId), 0);
      break;
    }
    case "SET_BATTER": {
      assert(state.phase === "AWAITING_BATTER", "WRONG_PHASE");
      const l = ledgerOf(state);
      assert(command.teamId === l.innings.battingTeamId, "NOT_BATTING_TEAM");
      assert(eligibleRainBatters(setup, state).includes(command.playerId), "INELIGIBLE_BATTER");
      if (l.innings.northBatterId === null && l.innings.southBatterId === null) {
        const copy = clone(l);
        copy.innings.northBatterId = command.playerId;
        state.innings[state.activeInningsIndex] = validateInningsLedger(copy);
      } else state.innings[state.activeInningsIndex] = selectInningsBatter(l, command.playerId);
      const n = ledgerOf(state).innings;
      state.phase = n.northBatterId === null || n.southBatterId === null ? "AWAITING_BATTER" : n.bowlerId === null ? "AWAITING_BOWLER" : "READY";
      break;
    }
    case "SET_BOWLER": {
      assert(state.phase === "AWAITING_BOWLER", "WRONG_PHASE");
      const l = ledgerOf(state);
      assert(command.teamId === l.innings.bowlingTeamId, "NOT_BOWLING_TEAM");
      assert(eligibleRainBowlers(setup, state).includes(command.playerId), "INELIGIBLE_BOWLER");
      const team = teamOf(setup, l.innings.bowlingTeamId);
      const outfield = team.playerIds.filter((id) => id !== team.keeperId && id !== command.playerId);
      state.innings[state.activeInningsIndex] = selectInningsBowler(l, command.playerId, outfield);
      state.phase = "READY";
      break;
    }
    case "SET_AGGRESSION": {
      assert(state.phase === "READY", "WRONG_PHASE");
      const i = ledgerOf(state).innings;
      assert([i.northBatterId, i.southBatterId].includes(command.playerId), "BATTER_NOT_ACTIVE");
      state.aggression[command.playerId] = command.aggression;
      break;
    }
    case "REVIEW_DECISION": {
      assert(state.phase === "AWAITING_REVIEW" && state.reviews?.pending, "WRONG_PHASE");
      assert(command.teamId === state.reviews.pending.reviewTeamId, "NOT_REVIEWING_TEAM");
      decideReview(setup, state, command.review);
      break;
    }
    case "BOWL": {
      assert(state.phase === "READY", "WRONG_PHASE");
      if (command.scope === "BALL") {
        bowlBall(setup, state);
        break;
      }
      for (let steps = 0; state.phase === "READY"; steps++) {
        assert(steps < 60, "OVER_ATTEMPT_LIMIT");
        bowlBall(setup, state);
      }
      break;
    }
  }
  return state;
}

/** A sensible automatic choice for the side whose decision is pending, for the AI captain and for tests. */
export function rainAutopilotCommand(setup: RainSetup, state: RainMatchState): RainCommand | null {
  if (state.phase === "COMPLETE") return null;
  if (state.phase === "READY") return { kind: "BOWL", scope: "OVER" };
  const pending = rainPendingDecision(setup, state)!;
  if (pending.decision === "TOSS") return { kind: "CALL_TOSS", teamId: pending.teamId, call: "HEADS" };
  if (pending.decision === "INNINGS") return { kind: "CHOOSE_INNINGS", teamId: pending.teamId, choice: "BOWL" };
  // The AI captain reviews on what a player on the field could sense, never on the hidden reading.
  if (pending.decision === "REVIEW") return { kind: "REVIEW_DECISION", teamId: pending.teamId, review: state.reviews!.pending!.cue === "CONFIDENT" };
  if (pending.decision === "BATTER") return { kind: "SET_BATTER", teamId: pending.teamId, playerId: eligibleRainBatters(setup, state)[0]! };
  const l = ledgerOf(state);
  const bowlers = eligibleRainBowlers(setup, state).sort(
    (a, b) => l.bowling[a]!.legalBalls - l.bowling[b]!.legalBalls || playerOf(setup, b).skills[setup.format].control - playerOf(setup, a).skills[setup.format].control || (a < b ? -1 : 1),
  );
  assert(bowlers.length, "NO_ELIGIBLE_BOWLER");
  return { kind: "SET_BOWLER", teamId: pending.teamId, playerId: bowlers[0]! };
}

export function rainStateSha256(state: RainMatchState): string {
  return hash(state);
}

/** Replays commands from the start. Throws if any command is illegal. */
export function replayRainMatch(setup: RainSetup, commands: readonly RainCommand[], options: ExhibitionRuleOptions = RAIN_ONLY): RainMatchState {
  let state = createRainMatch(setup, options);
  for (const command of commands) state = executeRainCommand(setup, state, command);
  return state;
}

/** Plays a whole match with the automatic captain for both sides. */
export function runAutopilotRainMatch(
  setup: RainSetup,
  options: ExhibitionRuleOptions = RAIN_ONLY,
  maxCommands = 6000,
): { state: RainMatchState; commands: RainCommand[] } {
  let state = createRainMatch(setup, options);
  const commands: RainCommand[] = [];
  while (state.phase !== "COMPLETE") {
    assert(commands.length < maxCommands, "COMMAND_LIMIT");
    const command = rainAutopilotCommand(setup, state)!;
    state = executeRainCommand(setup, state, command);
    commands.push(command);
  }
  return { state, commands };
}

const selectedTeamsOf = (setup: RainSetup) =>
  setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds], captainId: t.captainId, keeperId: t.keeperId }));

/**
 * The durable record of a match. A rain-only match keeps the original `LC_RAIN_MATCH_RECORD_V1`; a match with player
 * reviews, or with the weather off, uses `LC_EXTRA_RULES_RECORD_V1`.
 */
export function rainMatchRecord(setup: RainSetup, state: RainMatchState, commands: readonly RainCommand[]): ExhibitionRulesRecord {
  const options = exhibitionRuleOptions(state);
  const common = {
    rulesId: state.rulesId,
    gameId: setup.gameId,
    matchId: setup.matchId,
    seed: setup.seed,
    groundId: setup.ground.groundId,
    selectedTeams: selectedTeamsOf(setup),
    commands: [...commands],
    stateSha256: rainStateSha256(state),
  };
  if (options.rain && !options.reviews) return RainMatchRecordSchema.parse({ schemaId: RAIN_MATCH_RECORD_SCHEMA_ID, ...common });
  return ExtraRulesRecordSchema.parse({ schemaId: EXTRA_RULES_RECORD_SCHEMA_ID, ...common, rain: options.rain, reviewRulesId: state.reviews?.rulesId ?? null });
}

/** The opt-in rules a stored record was played under. */
export function recordRuleOptions(record: ExhibitionRulesRecord): ExhibitionRuleOptions {
  return record.schemaId === RAIN_MATCH_RECORD_SCHEMA_ID ? RAIN_ONLY : { rain: record.rain, reviews: record.reviewRulesId !== null };
}

/** Verifies a stored record against the setup it claims to belong to, and returns the replayed state. */
export function verifyRainMatchRecord(setup: RainSetup, raw: unknown): RainMatchState {
  const record = ExhibitionRulesRecordSchema.parse(raw);
  assert(record.rulesId === profileOf(setup).rulesId, "RECORD_FORMAT_MISMATCH");
  if (record.schemaId === EXTRA_RULES_RECORD_SCHEMA_ID) {
    assert(record.rain || record.reviewRulesId !== null, "RECORD_NO_RULES");
    assert(record.reviewRulesId === null || record.reviewRulesId === (setup.format === "T20" ? T20_DRS_RULES_ID : ODI_DRS_RULES_ID), "RECORD_FORMAT_MISMATCH");
  }
  assert(
    record.gameId === setup.gameId &&
      record.matchId === setup.matchId &&
      record.seed === setup.seed &&
      record.groundId === setup.ground.groundId &&
      hash(record.selectedTeams) === hash(selectedTeamsOf(setup)),
    "RECORD_SETUP_MISMATCH",
  );
  const state = replayRainMatch(setup, record.commands, recordRuleOptions(record));
  assert(rainStateSha256(state) === record.stateSha256, "RECORD_STATE_MISMATCH");
  return state;
}

/** The choices that fix a rain-affected exhibition, as stored in its record. */
export type RainSetupChoices = Pick<ExhibitionRulesRecord, "gameId" | "matchId" | "seed" | "groundId" | "selectedTeams"> & { format: "T20" | "ODI" };

/**
 * Builds the frozen T20 or one-day setup for a rain-affected exhibition through the same validated path as an ordinary
 * exhibition. The setup itself is the frozen format's (rain stays off in its capabilities); rain is this engine's rule.
 */
export function buildRainSetup(choices: RainSetupChoices, worldBytes: Readonly<Uint8Array>, manifest: unknown): RainSetup {
  const rulesId = choices.format === "T20" ? "LC_T20_01" : "LC_ODI_01";
  const request = {
    setupVersion: choices.format === "T20" ? "LC_T20_SETUP_V1" : "LC_ODI_SETUP_V1",
    setup: {
      schemaVersion: "1.0.0",
      gameId: choices.gameId,
      matchId: choices.matchId,
      format: choices.format,
      worldPackId: FROZEN_WORLD_PINS.worldPackId,
      rulesId,
      modelId: "synthetic-alpha-01",
      randomId: "SHA256_COUNTER_V1",
      seed: choices.seed,
      teamIds: choices.selectedTeams.map((t) => t.teamId),
      groundId: choices.groundId,
      capabilities: { limitedOversRain: false, superOver: false, injuries: false, prediction: false },
    },
    worldFileSha256: FROZEN_WORLD_PINS.worldFileSha256,
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    rulesHash: generatorRuleHash(rulesId),
    modelHash: MODEL_PACK_SHA256,
    stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    selectedTeams: choices.selectedTeams,
  };
  return choices.format === "T20" ? validateT20MatchSetup(request, worldBytes, manifest) : validateODIMatchSetup(request, worldBytes, manifest);
}
