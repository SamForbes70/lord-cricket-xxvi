import { describe, it, expect } from "vitest";
import { canonicalJson, type DeliveryExpectation } from "@lcxxvi/contracts";
import {
  scoreDelivery,
  evaluateScoringDelivery,
  applyDeliveryResolution,
  reduceInningsLedger,
  validateInningsLedger,
  contextFromLedger,
  selectInningsBatter,
  selectInningsBowler,
  ScoringInvariantError,
} from "@lcxxvi/domain";
import {
  loadCorpus,
  assertScoringObservation,
} from "../support/scoring-fixtures.js";
import {
  ledgerForContext,
  deepFreeze,
  dotResolution,
} from "../support/ledger-fixtures.js";
const corpus = loadCorpus();
describe("actual scorer and boundary reducer against untouched Pass 02 goldens", () => {
  for (const f of corpus.deliveries)
    it(`${f.id}: exact full observation`, () => {
      const before = canonicalJson(f);
      deepFreeze(f);
      assertScoringObservation(
        f,
        evaluateScoringDelivery(f.context, f.resolution),
      );
      expect(canonicalJson(f)).toBe(before);
    });
});
describe("full innings ledger reducer across every delivery fixture", () => {
  for (const f of corpus.deliveries)
    it(`${f.id}: full ledger, scorecard and state invariants`, () => {
      const input = deepFreeze(ledgerForContext(f.context)),
        before = canonicalJson(input);
      const result = applyDeliveryResolution(input, f.resolution);
      assertScoringObservation(f, result.observation);
      expect(canonicalJson(input)).toBe(before);
      validateInningsLedger(result.ledger);
      expect(result.ledger.innings.runs).toBe(f.expected.totals.runs);
      expect(result.ledger.innings.wickets).toBe(f.expected.totals.wickets);
      expect(result.ledger.innings.legalBalls).toBe(
        f.expected.totals.legalBalls,
      );
      expect(result.ledger.innings.freeHitPending).toBe(
        f.expected.freeHitPending,
      );
      expect(
        result.ledger.batting[f.context.strikerId]!.runs -
          input.batting[f.context.strikerId]!.runs,
      ).toBe(f.expected.delta.batterRuns);
      expect(
        result.ledger.bowling[f.context.bowlerId]!.runsConceded -
          input.bowling[f.context.bowlerId]!.runsConceded,
      ).toBe(f.expected.delta.bowlerRuns);
      expect(
        result.ledger.bowling[f.context.bowlerId]!.wickets -
          input.bowling[f.context.bowlerId]!.wickets,
      ).toBe(f.expected.delta.bowlerWickets);
      expect(result.ledger.nextDeliveryIndex).toBe(f.context.deliveryIndex + 1);
    });
});
describe("scorer rejects invalid fixtures before any state update", () => {
  for (const f of corpus.invalid)
    it(f.id, () => {
      expect(() =>
        scoreDelivery(deepFreeze(f.context), deepFreeze(f.resolution)),
      ).toThrow(f.expectedError);
    });
});
const ordinary = corpus.deliveries.find((f) => f.id === "S01")!;
function fresh() {
  return ledgerForContext({
    ...ordinary.context,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    deliveryIndex: 0,
    ballAgeLegalBalls: 0,
  });
}
it("reduces a six-dot over to a maiden and requires a different next bowler", () => {
  let state = fresh();
  for (let i = 0; i < 6; i++)
    state = applyDeliveryResolution(state, dotResolution).ledger;
  expect(state.bowling.b1).toEqual({
    runsConceded: 0,
    legalBalls: 6,
    wickets: 0,
    maidens: 1,
  });
  expect(state.innings.bowlerId).toBeNull();
  expect(state.innings.previousOverBowlerId).toBe("b1");
  expect(state.innings.strikerEnd).toBe("SOUTH");
  expect(() => selectInningsBowler(state, "b1", state.outfieldIds)).toThrow(
    "ILLEGAL_BOWLER",
  );
  expect(() => applyDeliveryResolution(state, dotResolution)).toThrow(
    "BOWLER_REQUIRED",
  );
  state = selectInningsBowler(state, "f1", [
    "b1",
    ...state.outfieldIds.filter((id) => id !== "f1"),
  ]);
  expect(state.innings.bowlerId).toBe("f1");
  expect(contextFromLedger(state).strikerId).toBe("p2");
});
it("counts a maiden with byes, but no maiden with a wide before the first legal ball", () => {
  let byes = fresh();
  const b = {
    ...dotResolution,
    extras: { ...dotResolution.extras, byes: 4 },
    boundary: "FOUR" as const,
  };
  byes = applyDeliveryResolution(byes, b).ledger;
  for (let i = 0; i < 5; i++)
    byes = applyDeliveryResolution(byes, dotResolution).ledger;
  expect(byes.innings.runs).toBe(4);
  expect(byes.bowling.b1!.maidens).toBe(1);
  let wide = fresh();
  wide = applyDeliveryResolution(wide, {
    ...dotResolution,
    legality: "WIDE",
    extras: { ...dotResolution.extras, wides: 1 },
  }).ledger;
  expect(wide.innings.legalBalls).toBe(0);
  expect(wide.currentOverRuns).toBe(1);
  for (let i = 0; i < 6; i++)
    wide = applyDeliveryResolution(wide, dotResolution).ledger;
  expect(wide.bowling.b1!.maidens).toBe(0);
  expect(wide.innings.deliveryAttempts).toBe(7);
});
it("requires batter before bowler after sixth-ball wicket, then resumes at survivor end", () => {
  const f = corpus.deliveries.find((f) => f.id === "F05")!;
  const state = applyDeliveryResolution(
    ledgerForContext(f.context),
    f.resolution,
  ).ledger;
  expect(() =>
    selectInningsBowler(state, "f1", [
      "b1",
      ...state.outfieldIds.filter((id) => id !== "f1"),
    ]),
  ).toThrow("BATTER_REQUIRED");
  expect(() => selectInningsBatter(state, "p1")).toThrow("ILLEGAL_BATTER");
  expect(() => selectInningsBatter(state, "p2")).toThrow("ILLEGAL_BATTER");
  const selected = selectInningsBatter(state, "prior-3");
  expect(selected.innings.northBatterId).toBe("prior-3");
  expect(selected.innings.southBatterId).toBe("p2");
  const ready = selectInningsBowler(selected, "f1", [
    "b1",
    ...state.outfieldIds.filter((id) => id !== "f1"),
  ]);
  expect(contextFromLedger(ready).strikerId).toBe("p2");
});
it("rejects duplicate/out-of-order delivery indexes without mutating the ledger", () => {
  const s = fresh(),
    event = scoreDelivery(contextFromLedger(s), dotResolution),
    next = reduceInningsLedger(s, event).ledger;
  const frozen = deepFreeze(next);
  expect(() => reduceInningsLedger(frozen, event)).toThrow(
    "EVENT_CONTEXT_MISMATCH",
  );
  expect(() =>
    reduceInningsLedger(frozen, { ...event, deliveryIndex: 7 }),
  ).toThrow("EVENT_CONTEXT_MISMATCH");
  expect(frozen.innings.deliveryAttempts).toBe(1);
});
it("rejects tampered event counters and wicket credits", () => {
  const f = corpus.deliveries.find((f) => f.id === "RO1")!,
    s = ledgerForContext(f.context),
    event = scoreDelivery(f.context, f.resolution);
  expect(() => reduceInningsLedger(s, { ...event, legalBall: false })).toThrow(
    "INVALID_EVENT_FLAGS",
  );
  expect(() =>
    reduceInningsLedger(s, {
      ...event,
      dismissal: { ...event.dismissal, creditedBowlerId: "b1" },
    }),
  ).toThrow("INVALID_WICKET_CREDIT");
  expect(() => reduceInningsLedger(s, { ...event, freeHitNext: true })).toThrow(
    "INVALID_EVENT_FLAGS",
  );
});
it("rejects further delivery or selection after immediate target completion", () => {
  const f = corpus.deliveries.find((f) => f.id === "F07")!;
  const s = applyDeliveryResolution(
    ledgerForContext(f.context),
    f.resolution,
  ).ledger;
  expect(() => applyDeliveryResolution(s, dotResolution)).toThrow(
    "INNINGS_COMPLETE",
  );
  expect(() => selectInningsBatter(s, "prior-3")).toThrow("INNINGS_COMPLETE");
  expect(() => selectInningsBowler(s, "f1", s.outfieldIds)).toThrow(
    "INNINGS_COMPLETE",
  );
});
it("refuses a legal delivery after the active bowler has reached quota", () => {
  const s = ledgerForContext({
    ...ordinary.context,
    legalBalls: 29,
    deliveryIndex: 31,
    ballAgeLegalBalls: 29,
  });
  s.bowling.b1!.legalBalls = 24;
  s.innings.bowlerLegalBalls.b1 = 24;
  s.bowling.f1!.legalBalls = 5;
  s.innings.bowlerLegalBalls.f1 = 5;
  const before = canonicalJson(s);
  expect(() => applyDeliveryResolution(s, dotResolution)).toThrow(
    "BOWLER_QUOTA",
  );
  expect(canonicalJson(s)).toBe(before);
});
it("catches ledger corruption in score, balls, dismissals and end occupancy", () => {
  const f = corpus.deliveries.find((f) => f.id === "F05")!;
  const base = ledgerForContext(f.context);
  for (const mutate of [
    (s: typeof base) => {
      s.innings.runs += 1;
    },
    (s: typeof base) => {
      s.bowling.b1!.legalBalls += 1;
    },
    (s: typeof base) => {
      s.batting.p1!.ballsFaced += 1;
    },
    (s: typeof base) => {
      s.bowling.b1!.wickets = 0;
    },
    (s: typeof base) => {
      s.innings.southBatterId = "p1";
    },
  ]) {
    const bad = structuredClone(base);
    mutate(bad);
    expect(() => validateInningsLedger(bad)).toThrow(ScoringInvariantError);
  }
});
it("records batter boundaries without treating bye boundaries as bat boundaries", () => {
  const f = corpus.deliveries.find((f) => f.id === "S20")!;
  const result = applyDeliveryResolution(
    ledgerForContext(f.context),
    f.resolution,
  );
  expect(result.ledger.batting.p1!.fours).toBe(1);
  const bye = applyDeliveryResolution(fresh(), {
    ...dotResolution,
    extras: { ...dotResolution.extras, byes: 4 },
    boundary: "FOUR",
  });
  expect(bye.ledger.batting.p1!.fours).toBe(0);
});
it("resolves a completed chase short of target as a runs win, including a last wicket", () => {
  const f = corpus.deliveries.find((f) => f.id === "F09")!;
  const result = evaluateScoringDelivery(
    { ...f.context, targetToWin: 110 },
    f.resolution,
  );
  expect(result.result).toEqual({
    kind: "WIN",
    winnerTeamId: "team-B",
    marginType: "RUNS",
    marginRuns: 9,
    marginWickets: null,
    completionReason: "CHASE_COMPLETE_SHORT",
  });
  expect(result.nextAction).toBe("NONE");
});
it("rejects running or dismissals after an already completed winning run", () => {
  const f = corpus.deliveries.find((f) => f.id === "RO1")!;
  expect(() =>
    scoreDelivery({ ...f.context, targetToWin: 101 }, f.resolution),
  ).toThrow("INVALID_DISMISSAL");
  const two = corpus.deliveries.find((f) => f.id === "S02")!;
  expect(() =>
    scoreDelivery({ ...two.context, targetToWin: 101 }, two.resolution),
  ).toThrow("INVALID_RUNNING");
});
it("is byte-identical across repeat calls and preserves snapshot isolation", () => {
  const s = deepFreeze(fresh()),
    r = deepFreeze(dotResolution);
  const a = applyDeliveryResolution(s, r),
    b = applyDeliveryResolution(s, r);
  expect(canonicalJson(a)).toBe(canonicalJson(b));
  a.ledger.batting.p1!.runs = 99;
  expect(b.ledger.batting.p1!.runs).toBe(0);
  expect(s.batting.p1!.runs).toBe(0);
});
it("independent full-observation harness detects a deliberately wrong reducer result", () => {
  const f = ordinary;
  const bad: DeliveryExpectation = evaluateScoringDelivery(
    f.context,
    f.resolution,
  );
  bad.delta.bowlerRuns = 1;
  expect(() => assertScoringObservation(f, bad)).toThrow();
});
it("supports no-ball/byes over complete innings reconciliation without double attribution", () => {
  const c = {
    ...ordinary.context,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    deliveryIndex: 0,
    ballAgeLegalBalls: 0,
  };
  let state = ledgerForContext(c);
  const noBall = {
    ...dotResolution,
    legality: "NO_BALL" as const,
    extras: { ...dotResolution.extras, noBalls: 1, byes: 2 },
    completedRuns: 2,
    attemptedRuns: 2,
  };
  state = applyDeliveryResolution(state, noBall).ledger;
  expect(state.innings.runs).toBe(3);
  expect(state.innings.extras).toEqual({
    wides: 0,
    noBalls: 1,
    byes: 2,
    legByes: 0,
    penalties: 0,
  });
  expect(state.batting.p1!.runs).toBe(0);
  expect(state.batting.p1!.ballsFaced).toBe(1);
  expect(state.bowling.b1!.runsConceded).toBe(1);
  for (let i = 0; i < 6; i++)
    state = applyDeliveryResolution(state, dotResolution).ledger;
  expect(state.batting.p1!.ballsFaced).toBe(7);
  expect(state.innings.legalBalls).toBe(6);
  expect(state.innings.freeHitPending).toBe(false);
  expect(state.bowling.b1!.maidens).toBe(0);
});
it("can reduce its own accepted event without guessing contact from trajectory metadata", () => {
  const context = {
    ...ordinary.context,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    deliveryIndex: 0,
    ballAgeLegalBalls: 0,
  };
  const supplied = {
    ...dotResolution,
    extras: { ...dotResolution.extras, byes: 4 },
    boundary: "FOUR" as const,
    trajectory: "GROUND" as const,
  };
  const event = scoreDelivery(context, supplied);
  expect(
    reduceInningsLedger(ledgerForContext(context), event).ledger.innings.runs,
  ).toBe(4);
});
