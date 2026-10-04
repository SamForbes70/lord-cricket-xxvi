import {
  SCORING_ENGINE_VERSION,
  type InningsLedger,
  type ScoringContext,
  type DeliveryResolution,
} from "@lcxxvi/contracts";
/** Test-only historic ledger reconstruction. Context omits old scorecard lines; these synthetic integer distributions are not player/world generation. */
export function ledgerForContext(c: ScoringContext): InningsLedger {
  const order = [
    c.strikerId,
    c.nonStrikerId,
    ...Array.from({ length: 9 }, (_, n) => `prior-${n + 1}`),
  ];
  const bowlingIds = [c.bowlerId, c.keeperId, ...c.outfieldIds];
  const batting = Object.fromEntries(
    order.map((id) => [
      id,
      { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false },
    ]),
  );
  batting[c.strikerId]!.runs = c.runs;
  batting[c.strikerId]!.ballsFaced = c.legalBalls;
  const bowling = Object.fromEntries(
    bowlingIds.map((id) => [
      id,
      { runsConceded: 0, legalBalls: 0, wickets: 0, maidens: 0 },
    ]),
  );
  bowling[c.bowlerId]!.runsConceded = c.runs;
  bowling[c.bowlerId]!.wickets = c.wickets;
  // Keep the active bowler below the quota for the coming delivery; allocate remaining historic balls elsewhere.
  const quota =
    c.rulesId === "LC_T20_01"
      ? 24
      : c.rulesId === "LC_ODI_01"
        ? 60
        : Number.MAX_SAFE_INTEGER;
  bowling[c.bowlerId]!.legalBalls = Math.min(c.legalBalls, quota - 1);
  let remaining = c.legalBalls - bowling[c.bowlerId]!.legalBalls;
  for (const id of c.outfieldIds) {
    const count = Math.min(remaining, quota);
    bowling[id]!.legalBalls = count;
    remaining -= count;
  }
  if (remaining)
    throw new Error("Historic test fixture exceeds available quota");
  const dismissed = order.slice(2, 2 + c.wickets);
  const dismissals: InningsLedger["dismissals"] = {};
  for (const id of dismissed) {
    batting[id]!.dismissed = true;
    dismissals[id] = {
      kind: "BOWLED",
      playerId: id,
      creditedBowlerId: c.bowlerId,
      fielderId: null,
      wicketEnd: "NORTH",
    };
  }
  return {
    engineVersion: SCORING_ENGINE_VERSION,
    rulesId: c.rulesId,
    nextDeliveryIndex: c.deliveryIndex,
    batting,
    bowling,
    dismissals,
    keeperId: c.keeperId,
    outfieldIds: [...c.outfieldIds],
    currentOverRuns: c.legalBalls < 6 ? c.runs : 0,
    innings: {
      index: c.inningsIndex,
      battingTeamId: c.battingTeamId,
      bowlingTeamId: c.bowlingTeamId,
      runs: c.runs,
      wickets: c.wickets,
      legalBalls: c.legalBalls,
      deliveryAttempts: c.deliveryIndex,
      targetToWin: c.targetToWin,
      allocatedBalls: c.allocatedBalls,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
      northBatterId: c.endsBefore.north,
      southBatterId: c.endsBefore.south,
      strikerEnd: c.strikerEnd,
      battingOrder: order,
      dismissed,
      bowlerId: c.bowlerId,
      previousOverBowlerId: null,
      bowlerLegalBalls: Object.fromEntries(
        bowlingIds.map((id) => [id, bowling[id]!.legalBalls]),
      ),
      freeHitPending: c.freeHitPending,
      ballAgeLegalBalls: c.ballAgeLegalBalls,
      complete: false,
    },
  };
}
export const dotResolution: DeliveryResolution = {
  stage: "DELIVERY",
  legality: "LEGAL",
  batRuns: 0,
  extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
  completedRuns: 0,
  attemptedRuns: 0,
  boundary: "NONE",
  dismissal: null,
  endsAfter: { north: "p1", south: "p2" },
  batContact: false,
  attemptedStroke: true,
  shotSector: null,
  trajectory: null,
  executedLength: "GOOD",
  fieldOutcome: "NONE",
  elapsedSeconds: 40,
};
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
