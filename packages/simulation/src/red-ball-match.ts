import {
  Red5CommandSchema,
  Red5MatchExecutionManifestSchema,
  Red5MatchEventSchema,
  Red5CommandReceiptSchema,
  Red5EventChainManifestSchema,
  Red5ScorecardSchema,
  RED5_MATCH_VERSION,
  RED5_EVENT_CHAIN_VERSION,
  RED5_CONDITIONS_VERSION,
  SCORING_ENGINE_VERSION,
  PROBABILITY_VERSION,
  RANDOM_VERSION,
  type Red5Command,
  type Red5MatchEvent,
  type Red5CommandReceipt,
  type Red5Scorecard,
  type InningsLedger,
  type Player,
  type DeliveryRecorded,
  type MatchResult,
  type BowlingPlan,
} from "@lcxxvi/contracts";
import {
  FIELD_REGISTRY,
  T20_LATER_SLOTS,
  T20_CONDITION_POLICY,
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
  EXP_LUT_SHA256,
  FROZEN_WORLD_PINS,
} from "@lcxxvi/data";
import {
  validateInningsLedger,
  contextFromLedger,
  reduceInningsLedger,
  selectInningsBatter,
  selectInningsBowler,
  scoreDelivery,
} from "@lcxxvi/domain";
import {
  type FrozenRed5Setup,
  isVerifiedFrozenRed5Setup,
  validateRed5MatchSetup,
} from "./world-setup.js";
import {
  createRandomService,
  createStateHasher,
  canonicalStateBytes,
  sha256Hex,
} from "./determinism.js";
import { generateDelivery, generatorRuleHash } from "./generator.js";
import { EXP_LUT_VERSION, PROBABILITY_MODEL_ID } from "@lcxxvi/contracts";
import {
  createRed5Clock,
  advanceRed5Clock,
  applyRed5InningsInterval,
  applyRed5RainDelay,
  applyRed5BallReplacement,
} from "./red-ball-clock.js";

const hash = createStateHasher().hash,
  random = createRandomService(),
  clone = <T>(v: T): T => structuredClone(v);
const fail = (c: string): never => {
  throw new Error(`LC_RED5_${c}`);
};
function assert(v: unknown, c: string): asserts v {
  if (!v) fail(c);
}
const DEFAULT_BOWLING: Omit<BowlingPlan, "bowlerId"> = {
  line: "STUMPS",
  length: "GOOD",
  variationId: "stock",
  effort: "NORMAL",
};
const policyHash = hash(T20_CONDITION_POLICY);
export const RED5_CONDITION_POLICY_HASH = policyHash;
type FieldSlot = { slotId: string; playerId: string };
export type Red5Phase =
  | "SETUP"
  | "TOSS"
  | "AWAITING_INNINGS"
  | "AWAITING_BATTER"
  | "AWAITING_BOWLER"
  | "READY"
  | "AWAITING_FOLLOW_ON"
  | "INTERVAL"
  | "COMPLETE";
export type Red5Core = {
  phase: Red5Phase;
  setupHash: string;
  tossWinnerId: string | null;
  tossCallerId: string | null;
  battingFirstId: string | null;
  inningsOrder: string[];
  activeInningsIndex: number;
  innings: InningsLedger[];
  declared: boolean[];
  globalAttemptOrdinal: number;
  result: MatchResult | null;
  fieldSlots: FieldSlot[];
  bowlingPlan: BowlingPlan | null;
  battingPlans: Record<
    string,
    { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" }
  >;
  pitch: FrozenRed5Setup["ground"]["pitchPrior"];
  fatigueBp: Record<string, number>;
  clock: {
    day: number;
    localSeconds: number;
    phase:
      | "PLAY"
      | "LUNCH"
      | "TEA"
      | "INNINGS_INTERVAL"
      | "STUMPS"
      | "RAIN"
      | "COMPLETE";
    dayLegalBalls: number;
    finalHourActive: boolean;
    finalHourBallsRemaining: number;
    overMustFinish: boolean;
    delaySecondsToday: number;
  };
  followOnEnforced: boolean;
  newBallsTaken: number;
};
export type Red5Session = {
  setup: FrozenRed5Setup;
  executionManifest: ReturnType<typeof Red5MatchExecutionManifestSchema.parse>;
  core: Red5Core;
  revision: number;
  events: Red5MatchEvent[];
  receipts: Record<string, Red5CommandReceipt>;
  commands: Red5Command[];
  genesisHash: string;
  lastEventHash: string;
};
const team = (s: { setup: FrozenRed5Setup }, id: string) => {
  const t = s.setup.teams.find((x) => x.teamId === id);
  assert(t, "UNKNOWN_TEAM");
  return t;
};
const other = (s: { setup: FrozenRed5Setup }, id: string) => {
  const t = s.setup.teams.find((x) => x.teamId !== id);
  assert(t, "UNKNOWN_OPPONENT");
  return t.teamId;
};
const player = (
  s: { setup: FrozenRed5Setup },
  id: string,
): Readonly<Player> => {
  const p = s.setup.teams.flatMap((t) => t.xi).find((p) => p.playerId === id);
  assert(p, "UNKNOWN_PLAYER");
  return p;
};
const ledger = (s: Red5Session) => {
  const l = s.core.innings[s.core.activeInningsIndex];
  assert(l, "NO_ACTIVE_INNINGS");
  return l;
};
const activeTeam = (s: Red5Session) => team(s, ledger(s).innings.battingTeamId),
  fieldTeam = (s: Red5Session) => team(s, ledger(s).innings.bowlingTeamId);
const named = (id: string) => {
  const p = FIELD_REGISTRY.positions.find((p) => p.slotId === id);
  assert(p, "UNKNOWN_FIELD_POSITION");
  return p;
};
export function validateRed5Field(
  slots: readonly FieldSlot[],
  outfield: readonly string[],
  hand: "R" | "L",
) {
  assert(
    slots.length === 9 &&
      new Set(slots.map((x) => x.playerId)).size === 9 &&
      new Set(slots.map((x) => x.slotId)).size === 9,
    "INVALID_FIELD_DUPLICATES",
  );
  assert(
    [...slots.map((x) => x.playerId)].sort().join("|") ===
      [...outfield].sort().join("|"),
    "INVALID_FIELD_IDENTITIES",
  );
  const ps = slots.map((x) => named(x.slotId)),
    leg = ps.filter((p) => (hand === "R" ? p.legSide : !p.legSide));
  assert(leg.length <= 5, "INVALID_FIELD_LEG_SIDE");
  assert(
    leg.filter((p) => p.behindSquare).length <= 2,
    "INVALID_FIELD_BEHIND_SQUARE",
  );
}
function beginInnings(
  s: Red5Session,
  battingId: string,
  index: number,
): InningsLedger {
  const bat = team(s, battingId),
    bowl = team(s, other(s, battingId));
  const batting = Object.fromEntries(
    bat.playerIds.map((id) => [
      id,
      { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false },
    ]),
  );
  const bowling = Object.fromEntries(
    bowl.playerIds.map((id) => [
      id,
      { runsConceded: 0, legalBalls: 0, wickets: 0, maidens: 0 },
    ]),
  );
  const bowlerLegalBalls = Object.fromEntries(
    bowl.playerIds.map((id) => [id, 0]),
  );
  const outfield = bowl.playerIds
    .filter((id) => id !== bowl.keeperId)
    .slice(0, 9);
  return validateInningsLedger({
    engineVersion: SCORING_ENGINE_VERSION,
    rulesId: "LC_RED5_01",
    nextDeliveryIndex: s.core.globalAttemptOrdinal,
    batting,
    bowling,
    dismissals: {},
    keeperId: bowl.keeperId,
    outfieldIds: outfield,
    currentOverRuns: 0,
    innings: {
      index,
      battingTeamId: battingId,
      bowlingTeamId: bowl.teamId,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      deliveryAttempts: 0,
      targetToWin:
        index === 3
          ? Math.max(1, aggregate(s, bowl.teamId) - aggregate(s, battingId) + 1)
          : null,
      allocatedBalls: null,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
      northBatterId: null,
      southBatterId: null,
      strikerEnd: "NORTH",
      battingOrder: [...bat.playerIds],
      dismissed: [],
      bowlerId: null,
      previousOverBowlerId: null,
      bowlerLegalBalls,
      freeHitPending: false,
      ballAgeLegalBalls: 0,
      complete: false,
    },
  });
}
function makeManifest(setup: FrozenRed5Setup) {
  assert(
    isVerifiedFrozenRed5Setup(setup) &&
      Object.isFrozen(setup) &&
      setup.setupVersion === "LC_RED5_SETUP_V1",
    "INVALID_FROZEN_SETUP",
  );
  assert(
    setup.versions.worldHash === FROZEN_WORLD_PINS.worldCanonicalSha256 &&
      setup.versions.modelHash === MODEL_PACK_SHA256 &&
      setup.stagePackHash === DELIVERY_STAGE_PACK_SHA256 &&
      setup.versions.rulesHash === generatorRuleHash("LC_RED5_01") &&
      setup.versions.random === RANDOM_VERSION,
    "UNSUPPORTED_PINNED_SETUP",
  );
  return Red5MatchExecutionManifestSchema.parse({
    engine: RED5_MATCH_VERSION,
    eventChain: RED5_EVENT_CHAIN_VERSION,
    conditionPolicy: RED5_CONDITIONS_VERSION,
    conditionPolicyHash: policyHash,
    setupHash: hash(setup),
    worldHash: setup.versions.worldHash,
    rulesHash: setup.versions.rulesHash,
    modelHash: setup.versions.modelHash,
    stagePackHash: setup.stagePackHash,
    randomVersion: RANDOM_VERSION,
    scoringVersion: SCORING_ENGINE_VERSION,
    probabilityVersion: PROBABILITY_VERSION,
  });
}
export function createRed5Session(setup: FrozenRed5Setup): Red5Session {
  const executionManifest = makeManifest(setup),
    setupHash = hash(setup);
  const core: Red5Core = {
    phase: "SETUP",
    setupHash,
    tossWinnerId: null,
    tossCallerId: null,
    battingFirstId: null,
    inningsOrder: [],
    activeInningsIndex: 0,
    innings: [],
    declared: [],
    globalAttemptOrdinal: 0,
    result: null,
    fieldSlots: [],
    bowlingPlan: null,
    battingPlans: {},
    pitch: clone(setup.ground.pitchPrior),
    fatigueBp: Object.fromEntries(
      setup.teams.flatMap((t) => t.playerIds).map((id) => [id, 0]),
    ),
    clock: createRed5Clock(),
    followOnEnforced: false,
    newBallsTaken: 0,
  };
  const genesisHash = hash([
    RED5_EVENT_CHAIN_VERSION,
    setupHash,
    hash(executionManifest),
  ]);
  return {
    setup,
    executionManifest,
    core,
    revision: 0,
    events: [],
    receipts: {},
    commands: [],
    genesisHash,
    lastEventHash: genesisHash,
  };
}
function aggregate(s: Red5Session, teamId: string) {
  return s.core.innings
    .filter((l) => l.innings.battingTeamId === teamId)
    .reduce((a, l) => a + l.innings.runs, 0);
}

export type Red5TerminalInnings = {
  teamId: string;
  runs: number;
  complete: boolean;
};

/** Pure red-ball result/target arbitration used by the engine and Appendix D fixtures. */
export function resolveRed5MatchSituation(
  teamIds: readonly [string, string],
  innings: readonly Red5TerminalInnings[],
  timeExpired = false,
): { result: MatchResult | null; targetToWin: number | null } {
  const [a, b] = teamIds;
  const rows = (id: string) => innings.filter((i) => i.teamId === id);
  const total = (id: string) => rows(id).reduce((n, i) => n + i.runs, 0);
  const complete = (id: string) => rows(id).filter((i) => i.complete).length;
  const ar = total(a),
    br = total(b),
    ac = complete(a),
    bc = complete(b);

  let targetToWin: number | null = null;
  if (innings.length >= 3) {
    // The fourth-innings target is fixed from aggregates *before* that innings
    // starts. Preserve it even after the chase has accumulated runs/completed.
    const prior = innings.slice(0, 3);
    const countPrior = (id: string) =>
      prior.filter((i) => i.teamId === id).length;
    const chasing =
      innings[3]?.teamId ??
      (countPrior(a) === 1 ? a : countPrior(b) === 1 ? b : null);
    if (chasing) {
      const defending = chasing === a ? b : a;
      const priorTotal = (id: string) =>
        prior.filter((i) => i.teamId === id).reduce((n, i) => n + i.runs, 0);
      targetToWin = Math.max(
        1,
        priorTotal(defending) - priorTotal(chasing) + 1,
      );
    }
  }

  if (ac === 2 && bc < 2 && ar < br)
    return {
      result: {
        kind: "WIN",
        winnerTeamId: b,
        marginType: "INNINGS",
        marginRuns: br - ar,
        marginWickets: null,
        completionReason: "INNINGS_VICTORY",
      },
      targetToWin: null,
    };
  if (bc === 2 && ac < 2 && br < ar)
    return {
      result: {
        kind: "WIN",
        winnerTeamId: a,
        marginType: "INNINGS",
        marginRuns: ar - br,
        marginWickets: null,
        completionReason: "INNINGS_VICTORY",
      },
      targetToWin: null,
    };

  if (ac === 2 && bc === 2) {
    if (ar === br)
      return {
        result: {
          kind: "TIE",
          winnerTeamId: null,
          marginType: null,
          marginRuns: null,
          marginWickets: null,
          completionReason: "CHASE_COMPLETE_LEVEL",
        },
        targetToWin,
      };
    const winner = ar > br ? a : b;
    return {
      result: {
        kind: "WIN",
        winnerTeamId: winner,
        marginType: "RUNS",
        marginRuns: Math.abs(ar - br),
        marginWickets: null,
        completionReason: "CHASE_COMPLETE_SHORT",
      },
      targetToWin,
    };
  }

  if (timeExpired)
    return {
      result: {
        kind: "DRAW",
        winnerTeamId: null,
        marginType: null,
        marginRuns: null,
        marginWickets: null,
        completionReason: "TIME_EXPIRED",
      },
      targetToWin,
    };
  return { result: null, targetToWin };
}

function resolveResult(s: Red5Session): MatchResult | null {
  const ids = s.setup.teams.map((t) => t.teamId) as [string, string];
  return resolveRed5MatchSituation(
    ids,
    s.core.innings.map((l) => ({
      teamId: l.innings.battingTeamId,
      runs: l.innings.runs,
      complete: l.innings.complete,
    })),
  ).result;
}
function startNextInnings(s: Red5Session, batting: string) {
  const idx = s.core.innings.length;
  s.core.inningsOrder.push(batting);
  s.core.innings.push(beginInnings(s, batting, idx));
  s.core.declared.push(false);
  s.core.activeInningsIndex = idx;
  s.core.fieldSlots = [];
  s.core.bowlingPlan = null;
  s.core.phase = "AWAITING_BATTER";
  s.core.clock.phase = "PLAY";
}
function advanceClock(
  s: Red5Session,
  event: DeliveryRecorded,
  overCompleted: boolean,
  inningsCompleted: boolean,
) {
  const terminal = !!s.core.result;
  const out = advanceRed5Clock(s.core.clock, {
    elapsedSeconds:
      event.elapsedSeconds +
      (event.dismissal ? 90 : 0) +
      (overCompleted ? 60 : 0),
    legalBall: event.legalBall,
    overCompleted,
    inningsCompleted,
    inningsLegalBalls: ledger(s).innings.legalBalls,
    terminalResult: terminal,
  });
  s.core.clock = out.clock;
  if (out.dayFiveExpired && !s.core.result) {
    s.core.result = {
      kind: "DRAW",
      winnerTeamId: null,
      marginType: null,
      marginRuns: null,
      marginWickets: null,
      completionReason: "time expired after day five",
    };
    s.core.phase = "COMPLETE";
    s.core.clock.phase = "COMPLETE";
  }
}
function addInningsInterval(s: Red5Session) {
  const out = applyRed5InningsInterval(
    s.core.clock,
    ledger(s).innings.legalBalls,
  );
  s.core.clock = out.clock;
  if (out.dayFiveExpired && !s.core.result) {
    s.core.result = {
      kind: "DRAW",
      winnerTeamId: null,
      marginType: null,
      marginRuns: null,
      marginWickets: null,
      completionReason: "time expired during innings interval",
    };
    s.core.phase = "COMPLETE";
  }
}
function inningsEnded(s: Red5Session) {
  const r = resolveResult(s);
  if (r) {
    s.core.result = r;
    s.core.phase = "COMPLETE";
    s.core.clock.phase = "COMPLETE";
    return;
  }
  addInningsInterval(s);
  const idx = s.core.innings.length - 1;
  if (idx === 0) {
    startNextInnings(s, other(s, s.core.innings[0]!.innings.battingTeamId));
    return;
  }
  if (idx === 1) {
    const first = s.core.innings[0]!,
      second = s.core.innings[1]!;
    const lead = first.innings.runs - second.innings.runs;
    if (first.innings.battingTeamId === s.core.battingFirstId && lead >= 200) {
      s.core.phase = "AWAITING_FOLLOW_ON";
      return;
    }
    startNextInnings(s, s.core.battingFirstId!);
    return;
  }
  if (idx === 2) {
    startNextInnings(s, other(s, s.core.innings[2]!.innings.battingTeamId));
    return;
  }
  if (idx === 3) {
    const rr = resolveResult(s);
    if (rr) {
      s.core.result = rr;
      s.core.phase = "COMPLETE";
      s.core.clock.phase = "COMPLETE";
    }
  }
}

function conditionsUpdate(
  s: Red5Session,
  event: DeliveryRecorded,
  effort: BowlingPlan["effort"],
  overCompleted: boolean,
) {
  const b = player(s, event.bowlerId),
    spin = !(b.bowlingStyle === "FAST" || b.bowlingStyle === "MEDIUM"),
    base = spin ? 12 : 20,
    factor = T20_CONDITION_POLICY.effortFactorBp[effort];
  s.core.fatigueBp[event.bowlerId] = Math.min(
    10000,
    s.core.fatigueBp[event.bowlerId]! +
      Math.floor((base * factor + 5000) / 10000),
  );
  if (event.legalBall) {
    const p = clone(s.core.pitch);
    p.wearPoints += 1;
    if (p.wearPoints % 100 === 0) {
      p.turnBp = Math.min(10000, p.turnBp + 20);
      p.variabilityBp = Math.min(10000, p.variabilityBp + 10);
      p.seamBp = Math.max(0, p.seamBp - 10);
    }
    s.core.pitch = p;
  }
  if (overCompleted) {
    for (const id of fieldTeam(s).playerIds)
      if (id !== event.bowlerId)
        s.core.fatigueBp[id] = Math.max(0, s.core.fatigueBp[id]! - 15);
  }
}
type Payload = { type: string; [k: string]: unknown };
function reduceEvent(s: Red5Session, type: string, p: Payload) {
  const c = s.core;
  switch (type) {
    case "TEAMS_CONFIRMED":
      c.phase = "TOSS";
      break;
    case "TOSS_RESOLVED":
      c.tossWinnerId = p.winnerId as string;
      c.tossCallerId = p.callerId as string;
      c.phase = "AWAITING_INNINGS";
      break;
    case "INNINGS_STARTED":
      if (!c.battingFirstId) c.battingFirstId = p.battingTeamId as string;
      startNextInnings(s, p.battingTeamId as string);
      break;
    case "BATTER_SELECTED": {
      const l = ledger(s),
        id = p.playerId as string;
      if (
        l.innings.northBatterId === null &&
        l.innings.southBatterId === null
      ) {
        const cp = clone(l);
        cp.innings.northBatterId = id;
        c.innings[c.activeInningsIndex] = validateInningsLedger(cp);
      } else c.innings[c.activeInningsIndex] = selectInningsBatter(l, id);
      const n = ledger(s).innings;
      c.phase =
        n.northBatterId === null || n.southBatterId === null
          ? "AWAITING_BATTER"
          : n.bowlerId === null
            ? "AWAITING_BOWLER"
            : "READY";
      break;
    }
    case "BOWLER_SELECTED": {
      const l = ledger(s),
        id = p.playerId as string;
      assert(id !== l.innings.previousOverBowlerId, "CONSECUTIVE_BOWLER");
      const outfield = fieldTeam(s).playerIds.filter(
        (x) => x !== fieldTeam(s).keeperId && x !== id,
      );
      c.innings[c.activeInningsIndex] = selectInningsBowler(l, id, outfield);
      c.bowlingPlan = { ...DEFAULT_BOWLING, bowlerId: id };
      c.fieldSlots = [...outfield]
        .sort()
        .map((x, i) => ({ slotId: T20_LATER_SLOTS[i]!, playerId: x }));
      validateRed5Field(
        c.fieldSlots,
        outfield,
        player(s, contextFromLedger(ledger(s)).strikerId).batHand,
      );
      c.phase = "READY";
      break;
    }
    case "FIELD_CHANGED":
      validateRed5Field(
        p.fieldSlots as FieldSlot[],
        ledger(s).outfieldIds,
        player(s, contextFromLedger(ledger(s)).strikerId).batHand,
      );
      c.fieldSlots = clone(p.fieldSlots as FieldSlot[]);
      break;
    case "BATTING_PLAN_CHANGED":
      c.battingPlans[p.playerId as string] = {
        aggression: p.aggression as number,
        intent: p.intent as "NORMAL" | "ROTATE" | "PROTECT",
      };
      break;
    case "BOWLING_PLAN_CHANGED":
      assert(p.variationId === "stock", "UNSUPPORTED_VARIATION");
      c.bowlingPlan = clone(p as unknown as BowlingPlan);
      break;
    case "DELIVERY_RECORDED": {
      const event = p.event as DeliveryRecorded;
      const outcome = reduceInningsLedger(ledger(s), event);
      c.innings[c.activeInningsIndex] = outcome.ledger;
      c.globalAttemptOrdinal++;
      let terminal: MatchResult | null = null;
      if (outcome.observation.inningsComplete) {
        terminal =
          c.activeInningsIndex === 3 && outcome.observation.result
            ? outcome.observation.result
            : resolveResult(s);
        if (terminal) c.result = terminal;
      }
      const over =
        event.legalBall && outcome.ledger.innings.legalBalls % 6 === 0;
      conditionsUpdate(s, event, c.bowlingPlan!.effort, over);
      advanceClock(s, event, over, outcome.observation.inningsComplete);
      if (terminal) {
        c.phase = "COMPLETE";
        c.clock.phase = "COMPLETE";
      } else if (outcome.observation.inningsComplete) {
        c.phase = "INTERVAL";
        inningsEnded(s);
      } else if (c.phase !== "COMPLETE")
        c.phase = outcome.observation.requiredBatterEnd
          ? "AWAITING_BATTER"
          : outcome.observation.overCompleted
            ? "AWAITING_BOWLER"
            : "READY";
      break;
    }
    case "DECLARED": {
      const l = clone(ledger(s));
      l.innings.complete = true;
      c.innings[c.activeInningsIndex] = validateInningsLedger(l);
      c.declared[c.activeInningsIndex] = true;
      inningsEnded(s);
      break;
    }
    case "FOLLOW_ON_CHOSEN": {
      assert(c.phase === "AWAITING_FOLLOW_ON", "WRONG_PHASE");
      c.followOnEnforced = !!p.enforce;
      const first = c.innings[0]!,
        second = c.innings[1]!;
      startNextInnings(
        s,
        p.enforce ? second.innings.battingTeamId : first.innings.battingTeamId,
      );
      break;
    }
    case "NEW_BALL_TAKEN": {
      const l = clone(ledger(s));
      assert(l.innings.ballAgeLegalBalls >= 480, "NEW_BALL_NOT_AVAILABLE");
      l.innings.ballAgeLegalBalls = 0;
      c.innings[c.activeInningsIndex] = validateInningsLedger(l);
      c.newBallsTaken++;
      const out = applyRed5BallReplacement(c.clock, 120, l.innings.legalBalls);
      c.clock = out.clock;
      if (out.dayFiveExpired && !c.result) {
        c.result = {
          kind: "DRAW",
          winnerTeamId: null,
          marginType: null,
          marginRuns: null,
          marginWickets: null,
          completionReason: "time expired during new-ball replacement",
        };
        c.phase = "COMPLETE";
      }
      break;
    }
    case "RAIN_DELAY": {
      const out = applyRed5RainDelay(
        c.clock,
        p.seconds as number,
        ledger(s).innings.legalBalls,
      );
      c.clock = out.clock;
      if (out.dayFiveExpired) {
        c.result = {
          kind: "DRAW",
          winnerTeamId: null,
          marginType: null,
          marginRuns: null,
          marginWickets: null,
          completionReason: "time expired after day-five weather delay",
        };
        c.phase = "COMPLETE";
      }
      break;
    }
    default:
      fail("UNKNOWN_EVENT");
  }
}
function emit(s: Red5Session, cmd: string, type: string, p: Payload) {
  reduceEvent(s, type, p);
  const sequence = s.events.length + 1,
    previousHash = s.lastEventHash,
    stateHash = hash(s.core),
    eventHash = hash([
      RED5_EVENT_CHAIN_VERSION,
      sequence,
      cmd,
      type,
      p,
      previousHash,
      stateHash,
    ]);
  const e = Red5MatchEventSchema.parse({
    version: RED5_EVENT_CHAIN_VERSION,
    sequence,
    commandId: cmd,
    type,
    payload: p,
    previousHash,
    stateHash,
    eventHash,
  });
  s.events.push(e);
  s.lastEventHash = eventHash;
}
function generate(s: Red5Session) {
  const l = ledger(s),
    ctx = contextFromLedger(l),
    bat = player(s, ctx.strikerId),
    bowl = player(s, ctx.bowlerId),
    keeper = player(s, ctx.keeperId),
    bs = bat.skills.RED_BALL,
    os = bowl.skills.RED_BALL;
  validateRed5Field(s.core.fieldSlots, l.outfieldIds, bat.batHand);
  const req = {
    kind: "GENERATE_DELIVERY" as const,
    generatorVersion: "LC_CONDITIONAL_DELIVERY_V1" as const,
    stagePackId: "synthetic-alpha-01-delivery-v1" as const,
    stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    randomVersion: RANDOM_VERSION,
    probabilityVersion: PROBABILITY_VERSION,
    modelId: PROBABILITY_MODEL_ID,
    modelHash: MODEL_PACK_SHA256,
    lutVersion: EXP_LUT_VERSION,
    lutHash: EXP_LUT_SHA256,
    rulesHash: s.setup.versions.rulesHash,
    matchId: s.setup.matchId,
    seed: s.setup.seed,
    attemptOrdinal: s.core.globalAttemptOrdinal,
    format: "RED_BALL" as const,
    phase: "RED_BALL" as const,
    context: ctx,
    bowling: {
      bowlingStyle: bowl.bowlingStyle!,
      controlRating: os.control,
      movementRating: os.movement,
      fatigueBp: s.core.fatigueBp[bowl.playerId]!,
      line: s.core.bowlingPlan!.line,
      intendedLength: s.core.bowlingPlan!.length,
      effort: s.core.bowlingPlan!.effort,
      variationId: "stock" as const,
    },
    batting: {
      defenceRating: bs.defence,
      timingRating: bs.timing,
      powerRating: bs.power,
      rotationRating: bs.rotation,
      vsPaceRating: bs.vsPace,
      vsSpinRating: bs.vsSpin,
      aggression: s.core.battingPlans[bat.playerId]?.aggression ?? 2,
      intent: s.core.battingPlans[bat.playerId]?.intent ?? "NORMAL",
      attemptedStroke: true,
      shotSectorWeights: [...bat.shotSectorWeights],
    },
    conditions: { seamBp: s.core.pitch.seamBp, turnBp: s.core.pitch.turnBp },
    field: {
      keeper: {
        keepingRating: keeper.skills.RED_BALL.keeping,
        catchingRating: keeper.skills.RED_BALL.catching,
        throwingRating: keeper.skills.RED_BALL.throwing,
      },
      slots: s.core.fieldSlots.map((slot) => {
        const f = player(s, slot.playerId),
          pos = named(slot.slotId);
        return {
          playerId: slot.playerId,
          sector: pos.sector,
          depth: pos.depth,
          role: slot.slotId.startsWith("slip")
            ? ("SLIP" as const)
            : ("NORMAL" as const),
          catchingRating: f.skills.RED_BALL.catching,
          throwingRating: f.skills.RED_BALL.throwing,
        };
      }),
    },
  };
  const g = generateDelivery(req);
  return { event: scoreDelivery(ctx, g.resolution), traceHash: hash(g.trace) };
}
function commitDelivery(
  s: Red5Session,
  id: string,
  event: DeliveryRecorded,
  traceHash: string,
) {
  emit(s, id, "DELIVERY_RECORDED", {
    type: "DELIVERY_RECORDED",
    event,
    attemptOrdinal: s.core.globalAttemptOrdinal,
    traceHash,
  });
}
export function applyRed5FixtureResolution(
  input: Red5Session,
  resolution: unknown,
): Red5Session {
  assert(input.core.phase === "READY", "FIXTURE_NOT_READY");
  const s = {
    ...input,
    core: clone(input.core),
    events: [...input.events],
    receipts: { ...input.receipts },
    commands: [...input.commands],
  };
  const event = scoreDelivery(contextFromLedger(ledger(s)), resolution);
  commitDelivery(
    s,
    `fixture-${s.events.length + 1}`,
    event,
    hash(["FIXTURE_ONLY", resolution]),
  );
  s.revision++;
  return s;
}
function runAdvance(s: Red5Session, id: string, scope: "DELIVERY" | "OVER") {
  const over = Math.floor(ledger(s).innings.legalBalls / 6);
  let n = 0;
  while (s.core.phase === "READY" && n++ < 60) {
    const g = generate(s);
    commitDelivery(s, id, g.event, g.traceHash);
    if (
      scope === "DELIVERY" ||
      s.core.phase !== "READY" ||
      Math.floor(ledger(s).innings.legalBalls / 6) !== over
    )
      break;
  }
  assert(n < 60, "ADVANCE_ATTEMPT_LIMIT");
}
export function executeRed5Command(
  input: Red5Session,
  raw: unknown,
): { session: Red5Session; receipt: Red5CommandReceipt } {
  const cmd = Red5CommandSchema.parse(raw),
    old = input.receipts[cmd.commandId];
  if (old) return { session: input, receipt: old };
  assert(cmd.expectedRevision === input.revision, "STALE_REVISION");
  const s = {
    ...input,
    core: clone(input.core),
    events: [...input.events],
    receipts: { ...input.receipts },
    commands: [...input.commands],
  };
  const start = s.events.length + 1,
    id = cmd.commandId;
  const auth = (tid: string) =>
    assert(
      cmd.actorId === `USER:${tid}` ||
        cmd.actorId === `AI:${tid}` ||
        cmd.actorId === "SYSTEM",
      "ACTOR_UNAUTHORISED",
    );
  switch (cmd.kind) {
    case "CONFIRM_TEAMS":
      assert(cmd.actorId === "SYSTEM", "ACTOR_UNAUTHORISED");
      assert(s.core.phase === "SETUP", "WRONG_PHASE");
      emit(s, id, "TEAMS_CONFIRMED", { type: "TEAMS_CONFIRMED" });
      break;
    case "CALL_TOSS":
      auth(cmd.payload.teamId);
      assert(s.core.phase === "TOSS", "WRONG_PHASE");
      {
        const coin =
            random.uint32({
              seed: s.setup.seed,
              domain: "TOSS",
              entityId: s.setup.matchId,
              eventOrdinal: 0,
              stageName: "coin",
              drawIndex: 0,
            }) %
              2 ===
            0
              ? "HEADS"
              : "TAILS",
          winner =
            coin === cmd.payload.call
              ? cmd.payload.teamId
              : other(s, cmd.payload.teamId);
        emit(s, id, "TOSS_RESOLVED", {
          type: "TOSS_RESOLVED",
          callerId: cmd.payload.teamId,
          winnerId: winner,
          coin,
          call: cmd.payload.call,
        });
      }
      break;
    case "CHOOSE_INNINGS":
      auth(cmd.payload.teamId);
      assert(s.core.phase === "AWAITING_INNINGS", "WRONG_PHASE");
      assert(cmd.payload.teamId === s.core.tossWinnerId, "NOT_TOSS_WINNER");
      emit(s, id, "INNINGS_STARTED", {
        type: "INNINGS_STARTED",
        battingTeamId:
          cmd.payload.choice === "BAT"
            ? cmd.payload.teamId
            : other(s, cmd.payload.teamId),
      });
      break;
    case "SET_BATTER":
      auth(cmd.payload.teamId);
      assert(
        s.core.phase === "AWAITING_BATTER" &&
          cmd.payload.teamId === activeTeam(s).teamId,
        "WRONG_TEAM_OR_PHASE",
      );
      emit(s, id, "BATTER_SELECTED", {
        type: "BATTER_SELECTED",
        playerId: cmd.payload.playerId,
      });
      break;
    case "SET_BOWLER":
      auth(cmd.payload.teamId);
      assert(
        s.core.phase === "AWAITING_BOWLER" &&
          cmd.payload.teamId === fieldTeam(s).teamId,
        "WRONG_TEAM_OR_PHASE",
      );
      assert(
        player(s, cmd.payload.bowlerId).bowlingStyle !== null,
        "INELIGIBLE_BOWLER",
      );
      emit(s, id, "BOWLER_SELECTED", {
        type: "BOWLER_SELECTED",
        playerId: cmd.payload.bowlerId,
      });
      break;
    case "SET_FIELD":
      auth(cmd.payload.teamId);
      assert(
        s.core.phase === "READY" && cmd.payload.teamId === fieldTeam(s).teamId,
        "WRONG_TEAM_OR_PHASE",
      );
      emit(s, id, "FIELD_CHANGED", {
        type: "FIELD_CHANGED",
        fieldSlots: cmd.payload.fieldSlots,
      });
      break;
    case "SET_BATTING_PLAN":
      auth(activeTeam(s).teamId);
      assert(s.core.phase === "READY", "WRONG_PHASE");
      emit(s, id, "BATTING_PLAN_CHANGED", {
        type: "BATTING_PLAN_CHANGED",
        ...cmd.payload,
      });
      break;
    case "SET_BOWLING_PLAN":
      auth(fieldTeam(s).teamId);
      assert(s.core.phase === "READY", "WRONG_PHASE");
      emit(s, id, "BOWLING_PLAN_CHANGED", {
        type: "BOWLING_PLAN_CHANGED",
        ...cmd.payload,
      });
      break;
    case "ADVANCE":
      assert(cmd.actorId === "SYSTEM", "ACTOR_UNAUTHORISED");
      assert(s.core.phase === "READY", "WRONG_PHASE");
      runAdvance(s, id, cmd.payload.scope);
      break;
    case "DECLARE":
      auth(cmd.payload.teamId);
      assert(
        cmd.payload.teamId === activeTeam(s).teamId && s.core.phase === "READY",
        "WRONG_TEAM_OR_PHASE",
      );
      emit(s, id, "DECLARED", { type: "DECLARED", teamId: cmd.payload.teamId });
      break;
    case "CHOOSE_FOLLOW_ON":
      auth(cmd.payload.teamId);
      assert(s.core.phase === "AWAITING_FOLLOW_ON", "WRONG_PHASE");
      assert(
        cmd.payload.teamId === s.core.battingFirstId,
        "FOLLOW_ON_AUTHORITY",
      );
      emit(s, id, "FOLLOW_ON_CHOSEN", {
        type: "FOLLOW_ON_CHOSEN",
        enforce: cmd.payload.enforce,
      });
      break;
    case "TAKE_NEW_BALL":
      auth(cmd.payload.teamId);
      assert(
        cmd.payload.teamId === fieldTeam(s).teamId && s.core.phase === "READY",
        "WRONG_TEAM_OR_PHASE",
      );
      assert(
        ledger(s).innings.legalBalls % 6 === 0 &&
          ledger(s).innings.ballAgeLegalBalls >= 480,
        "NEW_BALL_NOT_AVAILABLE",
      );
      emit(s, id, "NEW_BALL_TAKEN", { type: "NEW_BALL_TAKEN" });
      break;
    case "ADD_RAIN_DELAY":
      assert(cmd.actorId === "SYSTEM", "ACTOR_UNAUTHORISED");
      emit(s, id, "RAIN_DELAY", {
        type: "RAIN_DELAY",
        seconds: cmd.payload.seconds,
      });
      break;
  }
  assert(s.events.length >= start, "COMMAND_WITH_NO_EVENT");
  s.revision = input.revision + 1;
  const receipt = Red5CommandReceiptSchema.parse({
    commandId: id,
    committedRevision: s.revision,
    fromSequence: start,
    toSequence: s.events.length,
    lastEventHash: s.lastEventHash,
  });
  s.receipts[id] = receipt;
  s.commands.push(cmd);
  return { session: s, receipt };
}
export function replayRed5Events(
  setup: FrozenRed5Setup,
  events: readonly Red5MatchEvent[],
  manifest?: ReturnType<typeof Red5EventChainManifestSchema.parse>,
) {
  return replayRed5EventsFromInitial(createRed5Session(setup), events, manifest);
}
export function replayRed5EventsFromInitial(
  s: Red5Session,
  events: readonly Red5MatchEvent[],
  manifest?: ReturnType<typeof Red5EventChainManifestSchema.parse>,
) {
  assert(s.revision === 0 && s.events.length === 0 && s.core.phase === "SETUP", "REPLAY_INITIAL_STATE");
  for (const [i, raw] of events.entries()) {
    const e = Red5MatchEventSchema.parse(raw);
    assert(
      e.sequence === i + 1 && e.previousHash === s.lastEventHash,
      "REPLAY_CHAIN_GAP",
    );
    assert(
      e.eventHash ===
        hash([
          RED5_EVENT_CHAIN_VERSION,
          e.sequence,
          e.commandId,
          e.type,
          e.payload,
          e.previousHash,
          e.stateHash,
        ]),
      "REPLAY_EVENT_HASH",
    );
    reduceEvent(s, e.type, e.payload as Payload);
    assert(e.stateHash === hash(s.core), "REPLAY_STATE_HASH");
    s.events.push(e);
    s.lastEventHash = e.eventHash;
  }
  if (manifest) {
    const m = Red5EventChainManifestSchema.parse(manifest);
    assert(
      m.finalEventHash === s.lastEventHash &&
        m.finalStateHash === hash(s.core) &&
        m.eventCount === events.length,
      "REPLAY_MANIFEST_MISMATCH",
    );
  }
  return s;
}
export function red5EventChainManifest(s: Red5Session) {
  return Red5EventChainManifestSchema.parse({
    version: RED5_EVENT_CHAIN_VERSION,
    genesisHash: s.genesisHash,
    finalEventHash: s.lastEventHash,
    finalStateHash: hash(s.core),
    eventCount: s.events.length,
    executionManifestHash: hash(s.executionManifest),
  });
}
export function resimulateRed5Commands(s: Red5Session) {
  let r = createRed5Session(s.setup);
  for (const c of s.commands) r = executeRed5Command(r, c).session;
  assert(r.events.length === s.events.length, "RESIMULATION_LENGTH");
  for (let i = 0; i < s.events.length; i++)
    assert(
      sha256Hex(canonicalStateBytes(r.events[i])) ===
        sha256Hex(canonicalStateBytes(s.events[i])),
      `RESIMULATION_MISMATCH_${i}`,
    );
}
export function red5FixtureAutopilotStep(s: Red5Session): Red5Command {
  const base = {
    commandId: `auto-${String(s.revision + 1).padStart(6, "0")}`,
    expectedRevision: s.revision,
  };
  if (s.core.phase === "SETUP")
    return { ...base, actorId: "SYSTEM", kind: "CONFIRM_TEAMS", payload: {} };
  if (s.core.phase === "TOSS")
    return {
      ...base,
      actorId: `AI:${s.setup.teams[0].teamId}`,
      kind: "CALL_TOSS",
      payload: { teamId: s.setup.teams[0].teamId, call: "HEADS" },
    };
  if (s.core.phase === "AWAITING_INNINGS")
    return {
      ...base,
      actorId: `AI:${s.core.tossWinnerId}`,
      kind: "CHOOSE_INNINGS",
      payload: { teamId: s.core.tossWinnerId!, choice: "BAT" },
    };
  if (s.core.phase === "AWAITING_FOLLOW_ON")
    return {
      ...base,
      actorId: `AI:${s.core.battingFirstId}`,
      kind: "CHOOSE_FOLLOW_ON",
      payload: { teamId: s.core.battingFirstId!, enforce: true },
    };
  const l = ledger(s);
  if (s.core.phase === "AWAITING_BATTER") {
    const t = activeTeam(s),
      occ = new Set([
        l.innings.northBatterId,
        l.innings.southBatterId,
        ...l.innings.dismissed,
      ]),
      p = t.playerIds.find((x) => !occ.has(x));
    assert(p, "NO_ELIGIBLE_BATTER");
    return {
      ...base,
      actorId: `AI:${t.teamId}`,
      kind: "SET_BATTER",
      payload: { teamId: t.teamId, playerId: p },
    };
  }
  if (s.core.phase === "AWAITING_BOWLER") {
    const t = fieldTeam(s),
      p = t.xi
        .filter(
          (p) =>
            p.bowlingStyle !== null &&
            p.playerId !== t.keeperId &&
            p.playerId !== l.innings.previousOverBowlerId,
        )
        .sort((a, b) => a.playerId.localeCompare(b.playerId))[0];
    assert(p, "NO_ELIGIBLE_BOWLER");
    return {
      ...base,
      actorId: `AI:${t.teamId}`,
      kind: "SET_BOWLER",
      payload: { teamId: t.teamId, bowlerId: p.playerId },
    };
  }
  assert(s.core.phase === "READY", "INVALID_AUTOPILOT_PHASE");
  return {
    ...base,
    actorId: "SYSTEM",
    kind: "ADVANCE",
    payload: { scope: "OVER" },
  };
}
export function runFixtureRed5(setup: FrozenRed5Setup, maxCommands = 1400) {
  let s = createRed5Session(setup);
  while (s.core.phase !== "COMPLETE") {
    assert(s.revision < maxCommands, "FIXTURE_COMMAND_LIMIT");
    s = executeRed5Command(s, red5FixtureAutopilotStep(s)).session;
  }
  return s;
}
export function projectRed5Scorecard(s: Red5Session): Red5Scorecard {
  assert(
    s.core.phase === "COMPLETE" && s.core.result,
    "SCORECARD_NOT_COMPLETE",
  );
  return Red5ScorecardSchema.parse({
    matchId: s.setup.matchId,
    innings: s.core.innings.map((l, i) => ({
      battingTeamId: l.innings.battingTeamId,
      bowlingTeamId: l.innings.bowlingTeamId,
      runs: l.innings.runs,
      wickets: l.innings.wickets,
      legalBalls: l.innings.legalBalls,
      overs: `${Math.floor(l.innings.legalBalls / 6)}.${l.innings.legalBalls % 6}`,
      declared: s.core.declared[i] ?? false,
      batting: clone(l.batting),
      bowling: clone(l.bowling),
    })),
    result: s.core.result,
    clock: s.core.clock,
    followOnEnforced: s.core.followOnEnforced,
  });
}

/** Rebuild a persisted red-ball session solely from the validated setup and accepted commands. */
export function rehydrateRed5Session(
  raw: unknown,
  worldBytes: Readonly<Uint8Array>,
  manifestInput: unknown,
): Red5Session {
  assert(!!raw && typeof raw === "object" && !Array.isArray(raw), "SAVE_SHAPE");
  const stored = raw as Partial<Red5Session>,
    candidate = stored.setup as FrozenRed5Setup | undefined;
  assert(
    !!candidate && candidate.setupVersion === "LC_RED5_SETUP_V1",
    "SAVE_SETUP",
  );
  // Import locally to avoid trusting persisted setup objects.
  const req = {
    setupVersion: "LC_RED5_SETUP_V1" as const,
    setup: {
      schemaVersion: "1.0.0",
      gameId: candidate.gameId,
      matchId: candidate.matchId,
      format: "RED_BALL" as const,
      worldPackId: FROZEN_WORLD_PINS.worldPackId,
      rulesId: candidate.versions.rules,
      modelId: candidate.versions.model,
      randomId: candidate.versions.random,
      seed: candidate.seed,
      teamIds: candidate.teams.map((t) => t.teamId),
      groundId: candidate.ground.groundId,
      capabilities: {
        limitedOversRain: false,
        superOver: false,
        injuries: false,
        prediction: false,
      },
    },
    worldFileSha256: FROZEN_WORLD_PINS.worldFileSha256,
    worldCanonicalSha256: candidate.versions.worldHash,
    rulesHash: candidate.versions.rulesHash,
    modelHash: candidate.versions.modelHash,
    stagePackHash: candidate.stagePackHash,
    selectedTeams: candidate.teams.map((t) => ({
      teamId: t.teamId,
      playerIds: [...t.playerIds],
      captainId: t.captainId,
      keeperId: t.keeperId,
    })),
  };
  const setup = validateRed5MatchSetup(req, worldBytes, manifestInput);
  assert(Array.isArray(stored.commands), "SAVE_COMMANDS");
  let rebuilt = createRed5Session(setup);
  for (const command of stored.commands)
    rebuilt = executeRed5Command(rebuilt, command).session;
  assert(
    typeof stored.revision === "number" && rebuilt.revision === stored.revision,
    "SAVE_REVISION",
  );
  assert(
    Array.isArray(stored.events) &&
      hash(rebuilt.events) === hash(stored.events),
    "SAVE_EVENTS",
  );
  assert(
    stored.core !== undefined && hash(rebuilt.core) === hash(stored.core),
    "SAVE_CORE",
  );
  assert(
    stored.receipts !== undefined &&
      hash(rebuilt.receipts) === hash(stored.receipts),
    "SAVE_RECEIPTS",
  );
  assert(
    stored.executionManifest !== undefined &&
      hash(rebuilt.executionManifest) === hash(stored.executionManifest),
    "SAVE_MANIFEST",
  );
  assert(
    stored.genesisHash === rebuilt.genesisHash &&
      stored.lastEventHash === rebuilt.lastEventHash,
    "SAVE_CHAIN",
  );
  return rebuilt;
}
