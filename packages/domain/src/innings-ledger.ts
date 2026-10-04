import {
  InningsLedgerSchema,
  ScoringContextSchema,
  type InningsLedger,
  type ScoringContext,
  type DeliveryExpectation,
} from "@lcxxvi/contracts";
import {
  addCounters,
  invariant,
  scoreDelivery,
  reduceScoringBoundary,
} from "./scoring-kernel.js";
/** Full ledger consistency; called before and after every public state transition. */
export function validateInningsLedger(input: unknown): InningsLedger {
  const s = InningsLedgerSchema.parse(input),
    i = s.innings;
  const battingIds = Object.keys(s.batting),
    bowlingIds = Object.keys(s.bowling);
  invariant(
    i.battingTeamId !== i.bowlingTeamId,
    "INVALID_LEDGER",
    "Teams must differ",
  );
  invariant(
    i.battingOrder.length === 11 &&
      new Set(i.battingOrder).size === 11 &&
      battingIds.length === 11 &&
      i.battingOrder.every((id) => Object.hasOwn(s.batting, id)),
    "INVALID_LEDGER",
    "Batting order must identify eleven ledger players",
  );
  invariant(
    bowlingIds.length === 11 &&
      [s.keeperId, ...s.outfieldIds, ...(i.bowlerId ? [i.bowlerId] : [])].every(
        (id) => Object.hasOwn(s.bowling, id),
      ),
    "INVALID_LEDGER",
    "Bowling references missing",
  );
  invariant(
    new Set([s.keeperId, ...s.outfieldIds]).size === 10 &&
      !bowlingIds.some((id) => Object.hasOwn(s.batting, id)),
    "INVALID_LEDGER",
    "Field identities overlap",
  );
  invariant(
    new Set(i.dismissed).size === i.dismissed.length &&
      i.dismissed.length === i.wickets &&
      i.dismissed.every((id) => s.batting[id]?.dismissed),
    "INVALID_LEDGER",
    "Dismissed identities mismatch",
  );
  invariant(
    battingIds.filter((id) => s.batting[id]!.dismissed).length === i.wickets,
    "INVALID_LEDGER",
    "Dismissal flags mismatch",
  );
  invariant(
    i.complete ||
      !(
        i.wickets === 10 ||
        (i.allocatedBalls !== null && i.legalBalls >= i.allocatedBalls) ||
        (i.targetToWin !== null && i.runs >= i.targetToWin)
      ),
    "INVALID_LEDGER",
    "Terminal innings must be marked complete",
  );
  const quota =
    s.rulesId === "LC_T20_01" ? 24 : s.rulesId === "LC_ODI_01" ? 60 : null;
  invariant(
    quota === null ||
      Object.values(s.bowling).every((l) => l.legalBalls <= quota),
    "BOWLER_QUOTA",
    "Stored quota exceeded",
  );
  const occupants = [i.northBatterId, i.southBatterId].filter(
    (id): id is string => id !== null,
  );
  invariant(
    new Set(occupants).size === occupants.length &&
      occupants.every(
        (id) => Object.hasOwn(s.batting, id) && !s.batting[id]!.dismissed,
      ),
    "INVALID_LEDGER",
    "Invalid end occupancy",
  );
  invariant(
    addCounters(
      ...Object.values(s.batting).map((l) => l.runs),
      ...Object.values(i.extras),
    ) === i.runs,
    "SCORE_RECONCILIATION",
    "Bat runs plus extras must equal innings runs",
  );
  invariant(
    addCounters(...Object.values(s.bowling).map((l) => l.legalBalls)) ===
      i.legalBalls,
    "BALL_RECONCILIATION",
    "Bowler legal-ball counts must reconcile",
  );
  invariant(
    addCounters(...Object.values(s.bowling).map((l) => l.runsConceded)) ===
      i.runs - i.extras.byes - i.extras.legByes - i.extras.penalties,
    "SCORE_RECONCILIATION",
    "Bowler conceded runs mismatch",
  );
  invariant(
    Object.keys(s.dismissals).length === i.wickets &&
      i.dismissed.every((id) => s.dismissals[id]?.playerId === id),
    "WICKET_RECONCILIATION",
    "Dismissal records missing",
  );
  for (const id of bowlingIds)
    invariant(
      s.bowling[id]!.wickets ===
        Object.values(s.dismissals).filter((d) => d.creditedBowlerId === id)
          .length,
      "WICKET_RECONCILIATION",
      "Bowler credits must match dismissal records",
    );
  for (const d of Object.values(s.dismissals))
    invariant(
      (d.kind === "RUN_OUT"
        ? d.creditedBowlerId === null
        : d.creditedBowlerId !== null &&
          Object.hasOwn(s.bowling, d.creditedBowlerId)) &&
        (d.fielderId === null || Object.hasOwn(s.bowling, d.fielderId)),
      "WICKET_RECONCILIATION",
      "Invalid historical dismissal credit",
    );
  invariant(
    addCounters(...Object.values(s.batting).map((l) => l.ballsFaced)) ===
      addCounters(i.legalBalls, i.extras.noBalls),
    "BALL_RECONCILIATION",
    "Batter balls faced must equal legal deliveries plus delivered no-balls",
  );
  invariant(
    Object.keys(i.bowlerLegalBalls).length === bowlingIds.length &&
      bowlingIds.every(
        (id) => i.bowlerLegalBalls[id] === s.bowling[id]!.legalBalls,
      ),
    "BALL_RECONCILIATION",
    "Bowler quota map mismatch",
  );
  invariant(
    i.deliveryAttempts >= i.legalBalls &&
      s.nextDeliveryIndex >= i.deliveryAttempts &&
      i.ballAgeLegalBalls <= i.legalBalls,
    "INVALID_LEDGER",
    "Delivery/ball-age counters inconsistent",
  );
  invariant(
    i.bowlerId !== null || s.currentOverRuns === 0,
    "INVALID_LEDGER",
    "No active bowler for unfinished over runs",
  );
  if (i.bowlerId)
    invariant(
      i.bowlerId !== s.keeperId && !s.outfieldIds.includes(i.bowlerId),
      "INVALID_LEDGER",
      "Bowler cannot occupy keeper/outfield slot",
    );
  if (i.previousOverBowlerId !== null)
    invariant(
      Object.hasOwn(s.bowling, i.previousOverBowlerId),
      "INVALID_LEDGER",
      "Previous bowler absent",
    );
  for (const l of Object.values(s.batting))
    invariant(
      addCounters(l.fours * 4, l.sixes * 6) <= l.runs,
      "INVALID_LEDGER",
      "Boundary counters exceed bat runs",
    );
  for (const l of Object.values(s.bowling))
    invariant(
      l.maidens <= Math.floor(l.legalBalls / 6),
      "INVALID_LEDGER",
      "Maiden counter exceeds completed overs",
    );
  invariant(
    s.rulesId === "LC_RED5_01"
      ? i.allocatedBalls === null && i.index <= 3
      : i.allocatedBalls === (s.rulesId === "LC_T20_01" ? 120 : 300) &&
          i.index <= 1,
    "INVALID_LEDGER",
    "Unsupported profile allocation/index",
  );
  invariant(
    s.rulesId !== "LC_RED5_01" || !i.freeHitPending,
    "INVALID_LEDGER",
    "Red-ball free hit",
  );
  return s;
}
export function contextFromLedger(input: unknown): ScoringContext {
  const s = validateInningsLedger(input),
    i = s.innings;
  invariant(
    !i.complete,
    "INNINGS_COMPLETE",
    "No more delivery after completion",
  );
  invariant(
    i.northBatterId !== null && i.southBatterId !== null,
    "BATTER_REQUIRED",
    "Both ends need selected batters",
  );
  invariant(i.bowlerId !== null, "BOWLER_REQUIRED", "Select a bowler");
  const quota =
    s.rulesId === "LC_T20_01" ? 24 : s.rulesId === "LC_ODI_01" ? 60 : null;
  invariant(
    quota === null || s.bowling[i.bowlerId]!.legalBalls < quota,
    "BOWLER_QUOTA",
    "Active bowler exhausted",
  );
  return ScoringContextSchema.parse({
    rulesId: s.rulesId,
    inningsIndex: i.index,
    deliveryIndex: s.nextDeliveryIndex,
    battingTeamId: i.battingTeamId,
    bowlingTeamId: i.bowlingTeamId,
    strikerId: i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId,
    nonStrikerId: i.strikerEnd === "NORTH" ? i.southBatterId : i.northBatterId,
    bowlerId: i.bowlerId,
    keeperId: s.keeperId,
    outfieldIds: s.outfieldIds,
    endsBefore: { north: i.northBatterId, south: i.southBatterId },
    strikerEnd: i.strikerEnd,
    runs: i.runs,
    wickets: i.wickets,
    legalBalls: i.legalBalls,
    allocatedBalls: i.allocatedBalls,
    targetToWin: i.targetToWin,
    freeHitPending: i.freeHitPending,
    ballAgeLegalBalls: i.ballAgeLegalBalls,
  });
}
/** Atomic innings boundary reduction. OVER_COMPLETED is an output notification, never applied a second time. */
export function reduceInningsLedger(
  input: unknown,
  eventInput: unknown,
): { ledger: InningsLedger; observation: DeliveryExpectation } {
  const s = validateInningsLedger(input),
    c = contextFromLedger(s),
    o = reduceScoringBoundary(c, eventInput),
    e = o.event,
    i = s.innings;
  const quota =
    s.rulesId === "LC_T20_01" ? 24 : s.rulesId === "LC_ODI_01" ? 60 : null;
  invariant(
    quota === null ||
      s.bowling[e.bowlerId]!.legalBalls + o.delta.legalBalls <= quota,
    "BOWLER_QUOTA",
    "Bowler quota exceeded",
  );
  invariant(
    i.previousOverBowlerId !== e.bowlerId,
    "CONSECUTIVE_OVERS",
    "Previous over bowler cannot bowl this over",
  );
  const batter = s.batting[e.strikerId]!,
    bowler = s.bowling[e.bowlerId]!;
  batter.runs = addCounters(batter.runs, o.delta.batterRuns);
  batter.ballsFaced = addCounters(batter.ballsFaced, o.delta.ballsFaced);
  if (e.boundary === "FOUR" && e.batRuns === 4)
    batter.fours = addCounters(batter.fours, 1);
  if (e.boundary === "SIX" && e.batRuns === 6)
    batter.sixes = addCounters(batter.sixes, 1);
  if (e.dismissal) {
    s.batting[e.dismissal.playerId]!.dismissed = true;
    s.dismissals[e.dismissal.playerId] = e.dismissal;
    i.dismissed.push(e.dismissal.playerId);
  }
  bowler.runsConceded = addCounters(bowler.runsConceded, o.delta.bowlerRuns);
  bowler.legalBalls = addCounters(bowler.legalBalls, o.delta.legalBalls);
  bowler.wickets = addCounters(bowler.wickets, o.delta.bowlerWickets);
  s.currentOverRuns = addCounters(s.currentOverRuns, o.delta.bowlerRuns);
  if (o.overCompleted) {
    if (s.currentOverRuns === 0)
      bowler.maidens = addCounters(bowler.maidens, 1);
    s.currentOverRuns = 0;
    i.previousOverBowlerId = e.bowlerId;
    i.bowlerId = null;
  }
  i.runs = o.totals.runs;
  i.wickets = o.totals.wickets;
  i.legalBalls = o.totals.legalBalls;
  i.ballAgeLegalBalls = o.totals.ballAgeLegalBalls;
  i.deliveryAttempts = addCounters(i.deliveryAttempts, 1);
  i.strikerEnd = o.strikerEndAfter;
  i.northBatterId = e.endsAfter.north;
  i.southBatterId = e.endsAfter.south;
  i.freeHitPending = o.freeHitPending;
  i.complete = o.inningsComplete;
  for (const key of [
    "wides",
    "noBalls",
    "byes",
    "legByes",
    "penalties",
  ] as const)
    i.extras[key] = addCounters(i.extras[key], e.extras[key]);
  i.bowlerLegalBalls[e.bowlerId] = bowler.legalBalls;
  s.nextDeliveryIndex = addCounters(s.nextDeliveryIndex, 1);
  return { ledger: validateInningsLedger(s), observation: o };
}
export function applyDeliveryResolution(
  input: unknown,
  resolution: unknown,
): { ledger: InningsLedger; observation: DeliveryExpectation } {
  const context = contextFromLedger(input);
  const event = scoreDelivery(context, resolution);
  return reduceInningsLedger(input, event);
}
export function selectInningsBatter(
  input: unknown,
  playerId: string,
): InningsLedger {
  const s = validateInningsLedger(input),
    i = s.innings;
  invariant(!i.complete, "INNINGS_COMPLETE", "Cannot select after completion");
  invariant(
    Object.hasOwn(s.batting, playerId) &&
      !s.batting[playerId]!.dismissed &&
      ![i.northBatterId, i.southBatterId].includes(playerId),
    "ILLEGAL_BATTER",
    "Player must be available and not already at an end",
  );
  invariant(
    (i.northBatterId === null) !== (i.southBatterId === null),
    "ILLEGAL_SELECTION",
    "Exactly one replacement end must be empty",
  );
  if (i.northBatterId === null) i.northBatterId = playerId;
  else i.southBatterId = playerId;
  return validateInningsLedger(s);
}
/** Caller supplies the replacement legal field identities; no automatic field/keeper reshuffle. */
export function selectInningsBowler(
  input: unknown,
  playerId: string,
  outfieldIds: readonly string[],
): InningsLedger {
  const s = validateInningsLedger(input),
    i = s.innings;
  invariant(!i.complete, "INNINGS_COMPLETE", "Cannot select after completion");
  invariant(
    i.northBatterId !== null && i.southBatterId !== null,
    "BATTER_REQUIRED",
    "Batter decision has priority",
  );
  invariant(
    i.bowlerId === null && i.legalBalls % 6 === 0,
    "ILLEGAL_SELECTION",
    "Bowler selection only at an over boundary",
  );
  invariant(
    Object.hasOwn(s.bowling, playerId) &&
      playerId !== s.keeperId &&
      playerId !== i.previousOverBowlerId,
    "ILLEGAL_BOWLER",
    "Unknown, keeping or consecutive bowler",
  );
  const quota =
    s.rulesId === "LC_T20_01" ? 24 : s.rulesId === "LC_ODI_01" ? 60 : null;
  invariant(
    quota === null || s.bowling[playerId]!.legalBalls < quota,
    "BOWLER_QUOTA",
    "Quota exhausted",
  );
  i.bowlerId = playerId;
  s.outfieldIds = [...outfieldIds];
  return validateInningsLedger(s);
}
