import {
  DeliveryRecordedSchema,
  DeliveryExpectationSchema,
  ScoringContextSchema,
  type DeliveryRecorded,
  type DeliveryExpectation,
  type ScoringContext,
  type MatchResult,
  type ScoringFixtureAdapter,
} from "@lcxxvi/contracts";
import { validateDeliveryResolution } from "./validate-resolution.js";
export class ScoringInvariantError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ScoringInvariantError";
  }
}
export function invariant(
  ok: boolean,
  code: string,
  message: string,
): asserts ok {
  if (!ok) throw new ScoringInvariantError(code, message);
}
export function addCounters(...values: number[]): number {
  let total = 0;
  for (const value of values) {
    invariant(
      Number.isSafeInteger(value) && value >= 0,
      "UNSAFE_COUNTER",
      "Counter is not a safe non-negative integer",
    );
    total += value;
    invariant(
      Number.isSafeInteger(total),
      "UNSAFE_COUNTER",
      "Counter overflow",
    );
  }
  return total;
}
/** Pure scorer: resolve derived event facts, never increment a state object. */
export function scoreDelivery(
  contextInput: unknown,
  resolutionInput: unknown,
): DeliveryRecorded {
  const { context: c, resolution: r } = validateDeliveryResolution(
    contextInput,
    resolutionInput,
  );
  return DeliveryRecordedSchema.parse({
    type: "DELIVERY_RECORDED",
    inningsIndex: c.inningsIndex,
    deliveryIndex: c.deliveryIndex,
    strikerId: c.strikerId,
    nonStrikerId: c.nonStrikerId,
    bowlerId: c.bowlerId,
    legality: r.legality,
    legalBall: r.legality === "LEGAL",
    countsAsBallFaced: r.legality === "LEGAL" || r.legality === "NO_BALL",
    batRuns: r.batRuns,
    extras: r.extras,
    completedRuns: r.completedRuns,
    boundary: r.boundary,
    dismissal: r.dismissal
      ? {
          ...r.dismissal,
          creditedBowlerId: r.dismissal.kind === "RUN_OUT" ? null : c.bowlerId,
        }
      : null,
    endsAfter: r.endsAfter,
    shotSector: r.shotSector,
    trajectory: r.trajectory,
    executedLength: r.executedLength,
    fieldOutcome: r.fieldOutcome,
    elapsedSeconds: r.elapsedSeconds,
    freeHitNext:
      c.rulesId !== "LC_RED5_01" &&
      (r.legality === "NO_BALL" ||
        (c.freeHitPending && r.legality !== "LEGAL")),
  });
}
/** Validate facts recoverable from an accepted event. Raw contact/stroke evidence is not recoverable from event history. */
export function validateRecordedDelivery(
  contextInput: unknown,
  eventInput: unknown,
): { context: ScoringContext; event: DeliveryRecorded } {
  const c = ScoringContextSchema.parse(contextInput),
    e = DeliveryRecordedSchema.parse(eventInput);
  for (const key of [
    "inningsIndex",
    "deliveryIndex",
    "strikerId",
    "nonStrikerId",
    "bowlerId",
  ] as const)
    invariant(e[key] === c[key], "EVENT_CONTEXT_MISMATCH", key);
  invariant(
    e.legalBall === (e.legality === "LEGAL"),
    "INVALID_EVENT_FLAGS",
    "legalBall",
  );
  invariant(
    e.countsAsBallFaced ===
      (e.legality === "LEGAL" || e.legality === "NO_BALL"),
    "INVALID_EVENT_FLAGS",
    "countsAsBallFaced",
  );
  const freeHit =
    c.rulesId !== "LC_RED5_01" &&
    (e.legality === "NO_BALL" || (c.freeHitPending && e.legality !== "LEGAL"));
  invariant(e.freeHitNext === freeHit, "INVALID_EVENT_FLAGS", "freeHitNext");
  if (e.dismissal)
    invariant(
      e.dismissal.creditedBowlerId ===
        (e.dismissal.kind === "RUN_OUT" ? null : c.bowlerId),
      "INVALID_WICKET_CREDIT",
      "Dismissal credit differs from its kind",
    );
  // Revalidate only supported facts present in the event. This is not recovery of missing raw evidence.
  const { creditedBowlerId: _, ...dismissal } = e.dismissal ?? {
    creditedBowlerId: null,
  };
  void _;
  validateDeliveryResolution(c, {
    stage:
      (e.legality === "WIDE" || e.legality === "NO_BALL") &&
      c.targetToWin !== null &&
      c.runs + 1 >= c.targetToWin
        ? "IMMEDIATE_PENALTY"
        : "DELIVERY",
    legality: e.legality,
    batRuns: e.batRuns,
    extras: e.extras,
    completedRuns: e.completedRuns,
    attemptedRuns: e.completedRuns + (e.dismissal?.kind === "RUN_OUT" ? 1 : 0),
    boundary: e.boundary,
    dismissal: e.dismissal ? dismissal : null,
    endsAfter: e.endsAfter,
    batContact: e.batRuns > 0 || e.dismissal?.kind === "CAUGHT",
    attemptedStroke: true,
    shotSector: e.shotSector,
    trajectory: e.trajectory,
    executedLength: e.executedLength,
    fieldOutcome: e.fieldOutcome,
    elapsedSeconds: e.elapsedSeconds,
  });
  return { context: c, event: e };
}
/** Shared boundary reducer used by both the fixture adapter and full innings ledger. */
export function reduceScoringBoundary(
  contextInput: unknown,
  eventInput: unknown,
): DeliveryExpectation {
  const { context: c, event: e } = validateRecordedDelivery(
    contextInput,
    eventInput,
  );
  const extras = e.extras;
  const delta = {
    teamRuns: addCounters(
      e.batRuns,
      extras.wides,
      extras.noBalls,
      extras.byes,
      extras.legByes,
      extras.penalties,
    ),
    batterRuns: e.batRuns,
    bowlerRuns: addCounters(e.batRuns, extras.wides, extras.noBalls),
    legalBalls: Number(e.legalBall),
    ballsFaced: Number(e.countsAsBallFaced),
    wickets: Number(e.dismissal !== null),
    bowlerWickets: Number(
      e.dismissal?.creditedBowlerId !== null && e.dismissal !== null,
    ),
    deliveryAttempts: 1 as const,
  };
  const totals = {
    runs: addCounters(c.runs, delta.teamRuns),
    wickets: addCounters(c.wickets, delta.wickets),
    legalBalls: addCounters(c.legalBalls, delta.legalBalls),
    ballAgeLegalBalls: addCounters(c.ballAgeLegalBalls, delta.legalBalls),
  };
  const overCompleted = e.legalBall && totals.legalBalls % 6 === 0;
  const strikerEndAfter = overCompleted
    ? c.strikerEnd === "NORTH"
      ? "SOUTH"
      : "NORTH"
    : c.strikerEnd;
  const reached = c.targetToWin !== null && totals.runs >= c.targetToWin;
  const inningsComplete =
    reached ||
    totals.wickets === 10 ||
    (c.allocatedBalls !== null && totals.legalBalls >= c.allocatedBalls);
  let result: MatchResult | null = null;
  if (reached)
    result = {
      kind: "WIN",
      winnerTeamId: c.battingTeamId,
      marginType: "WICKETS",
      marginRuns: null,
      marginWickets: 10 - totals.wickets,
      completionReason: "TARGET_REACHED",
    };
  else if (inningsComplete && c.targetToWin !== null) {
    if (totals.runs === c.targetToWin - 1)
      result = {
        kind: "TIE",
        winnerTeamId: null,
        marginType: null,
        marginRuns: null,
        marginWickets: null,
        completionReason: "CHASE_COMPLETE_LEVEL",
      };
    else
      result = {
        kind: "WIN",
        winnerTeamId: c.bowlingTeamId,
        marginType: "RUNS",
        marginRuns: c.targetToWin - 1 - totals.runs,
        marginWickets: null,
        completionReason: "CHASE_COMPLETE_SHORT",
      };
  }
  const requiredBatterEnd =
    inningsComplete || !e.dismissal
      ? null
      : e.endsAfter.north === null
        ? "NORTH"
        : "SOUTH";
  const nextStrikerId = inningsComplete
    ? null
    : e.endsAfter[strikerEndAfter === "NORTH" ? "north" : "south"];
  const nextAction = result
    ? "NONE"
    : inningsComplete
      ? "START_NEXT_INNINGS"
      : requiredBatterEnd
        ? "SELECT_BATTER"
        : overCompleted
          ? "SELECT_BOWLER"
          : "ADVANCE";
  const events: DeliveryExpectation["events"] = ["DELIVERY_RECORDED"];
  if (overCompleted) events.push("OVER_COMPLETED");
  if (inningsComplete) events.push("INNINGS_COMPLETED");
  if (result) events.push("MATCH_COMPLETED");
  return DeliveryExpectationSchema.parse({
    event: e,
    delta,
    totals,
    strikerEndAfter,
    nextStrikerId,
    requiredBatterEnd,
    freeHitPending: e.freeHitNext,
    overCompleted,
    inningsComplete,
    result,
    events,
    nextAction,
  });
}
export function evaluateScoringDelivery(
  context: unknown,
  resolution: unknown,
): DeliveryExpectation {
  return reduceScoringBoundary(context, scoreDelivery(context, resolution));
}
export const scoringFixtureAdapter: ScoringFixtureAdapter = {
  evaluate: evaluateScoringDelivery,
};
