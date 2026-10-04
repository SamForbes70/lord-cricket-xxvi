import {
  ScoringContextSchema,
  DeliveryResolutionSchema,
  type ScoringContext,
  type DeliveryResolution,
  type ResolutionErrorCode,
} from "@lcxxvi/contracts";
export class ResolutionValidationError extends Error {
  constructor(
    readonly code: ResolutionErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "ResolutionValidationError";
  }
}
const requireValue = (
  ok: boolean,
  code: ResolutionErrorCode,
  detail: string,
) => {
  if (!ok) throw new ResolutionValidationError(code, detail);
};
/** Pure supported-profile validation. Does not score, reduce state, emit events or sample. */
export function validateDeliveryResolution(
  contextInput: unknown,
  resolutionInput: unknown,
): { context: ScoringContext; resolution: DeliveryResolution } {
  const cResult = ScoringContextSchema.safeParse(contextInput);
  const rResult = DeliveryResolutionSchema.safeParse(resolutionInput);
  if (!cResult.success || !rResult.success)
    throw new ResolutionValidationError(
      "INVALID_STRUCTURE",
      "Context or resolution failed strict schema validation",
    );
  const c = cResult.data,
    r = rResult.data,
    e = r.extras,
    d = r.dismissal;
  requireValue(
    c.deliveryIndex >= c.legalBalls,
    "INVALID_CONTEXT",
    "Global delivery attempt index precedes legal-ball count",
  );
  requireValue(
    c.rulesId === "LC_RED5_01"
      ? c.allocatedBalls === null && c.inningsIndex <= 3
      : c.allocatedBalls === (c.rulesId === "LC_T20_01" ? 120 : 300) &&
          c.inningsIndex <= 1,
    "INVALID_CONTEXT",
    "Base profile allocation or innings index invalid",
  );
  const players = [
    c.strikerId,
    c.nonStrikerId,
    c.bowlerId,
    c.keeperId,
    ...c.outfieldIds,
  ];
  requireValue(
    new Set(players).size === players.length &&
      c.battingTeamId !== c.bowlingTeamId,
    "INVALID_CONTEXT",
    "IDs must be distinct",
  );
  requireValue(
    c.endsBefore[c.strikerEnd === "NORTH" ? "north" : "south"] ===
      c.strikerId &&
      c.endsBefore[c.strikerEnd === "NORTH" ? "south" : "north"] ===
        c.nonStrikerId,
    "INVALID_CONTEXT",
    "Starting ends must identify both batters",
  );
  requireValue(
    (c.allocatedBalls === null || c.legalBalls < c.allocatedBalls) &&
      (c.targetToWin === null || c.runs < c.targetToWin),
    "INVALID_CONTEXT",
    "Innings already ended",
  );
  requireValue(
    c.rulesId !== "LC_RED5_01" || !c.freeHitPending,
    "INVALID_CONTEXT",
    "Red-ball profile has no free hit",
  );
  requireValue(
    e.penalties === 0,
    "UNSUPPORTED_PENALTY",
    "Penalty scoring requires a later administrative contract",
  );
  const runs = r.batRuns + e.wides + e.noBalls + e.byes + e.legByes;
  requireValue(
    Number.isSafeInteger(runs) &&
      Number.isSafeInteger(c.runs + runs) &&
      Number.isSafeInteger(c.legalBalls + 1) &&
      Number.isSafeInteger(c.deliveryIndex + 1) &&
      Number.isSafeInteger(c.ballAgeLegalBalls + 1),
    "UNSAFE_TOTAL",
    "Counter arithmetic must remain safe",
  );
  requireValue(
    !(e.byes > 0 && e.legByes > 0) &&
      !(r.batRuns > 0 && (e.byes > 0 || e.legByes > 0)),
    "INVALID_EXTRAS",
    "Conflicting run channels",
  );
  requireValue(
    !(r.batContact && (e.byes > 0 || e.legByes > 0)) &&
      (e.legByes === 0 || r.attemptedStroke) &&
      (r.batRuns === 0 || r.batContact),
    "INVALID_EXTRAS",
    "Contact/stroke evidence inconsistent",
  );
  if (r.legality === "LEGAL")
    requireValue(
      e.wides === 0 && e.noBalls === 0,
      "INVALID_EXTRAS",
      "Legal ball cannot charge wide/no-ball",
    );
  if (r.legality === "NO_BALL")
    requireValue(
      e.noBalls === 1 && e.wides === 0,
      "INVALID_EXTRAS",
      "No-ball overrides wide and carries one automatic run",
    );
  if (r.legality === "WIDE")
    requireValue(
      e.wides >= 1 &&
        e.noBalls === 0 &&
        e.byes === 0 &&
        e.legByes === 0 &&
        r.batRuns === 0 &&
        !r.batContact,
      "INVALID_EXTRAS",
      "Wide channel is exclusive",
    );
  if (r.legality === "DEAD")
    requireValue(
      runs === 0 &&
        d === null &&
        r.completedRuns === 0 &&
        r.attemptedRuns === 0 &&
        !r.batContact &&
        r.boundary === "NONE" &&
        r.fieldOutcome === "NONE",
      "INVALID_EXTRAS",
      "Early dead ball cannot score or dismiss",
    );
  if (r.boundary !== "NONE")
    requireValue(
      r.completedRuns === 0 &&
        r.attemptedRuns === 0 &&
        d === null &&
        runs - e.noBalls - (r.legality === "WIDE" ? 1 : 0) ===
          (r.boundary === "FOUR" ? 4 : 6) &&
        (r.boundary !== "SIX" || (r.batRuns === 6 && r.batContact)),
      "INVALID_BOUNDARY",
      "Boundary allowance incompatible with running/dismissal",
    );
  else
    requireValue(
      r.completedRuns ===
        r.batRuns + e.byes + e.legByes + Math.max(0, e.wides - 1),
      "INVALID_RUNNING",
      "Completed runs exclude automatic penalties",
    );
  requireValue(
    r.attemptedRuns === r.completedRuns + (d?.kind === "RUN_OUT" ? 1 : 0),
    "INVALID_RUNNING",
    "Only the failed run-out attempt remains uncompleted",
  );
  if (r.stage === "IMMEDIATE_PENALTY")
    requireValue(
      (r.legality === "WIDE" || r.legality === "NO_BALL") &&
        c.targetToWin !== null &&
        c.runs + 1 >= c.targetToWin &&
        runs === 1 &&
        r.batRuns === 0 &&
        r.completedRuns === 0 &&
        r.attemptedRuns === 0 &&
        d === null &&
        r.boundary === "NONE" &&
        !r.batContact &&
        r.trajectory === null &&
        r.shotSector === null &&
        r.fieldOutcome === "NONE",
      "INVALID_IMMEDIATE_PENALTY",
      "Winning automatic extra must terminate before contact or dismissal",
    );
  else if (
    (r.legality === "WIDE" || r.legality === "NO_BALL") &&
    c.targetToWin !== null &&
    c.runs + 1 >= c.targetToWin
  )
    throw new ResolutionValidationError(
      "INVALID_IMMEDIATE_PENALTY",
      "Immediate winning extra requires truncated resolution",
    );
  requireValue(
    !(c.targetToWin !== null && c.runs + runs >= c.targetToWin && d !== null),
    "INVALID_DISMISSAL",
    "Result achieved before a later dismissal",
  );
  requireValue(
    !(
      c.targetToWin !== null &&
      r.boundary === "NONE" &&
      c.runs + runs > c.targetToWin
    ),
    "INVALID_RUNNING",
    "Running cannot continue past the winning run",
  );
  if (d) {
    requireValue(
      d.playerId === c.strikerId || d.playerId === c.nonStrikerId,
      "INVALID_DISMISSAL",
      "Dismissed player must be active",
    );
    requireValue(
      d.kind === "RUN_OUT" || d.playerId === c.strikerId,
      "INVALID_DISMISSAL",
      "Only a run-out may dismiss the non-striker",
    );
    requireValue(
      !(r.legality === "NO_BALL" || c.freeHitPending) || d.kind === "RUN_OUT",
      "INVALID_DISMISSAL",
      "No-ball/free-hit mask",
    );
    requireValue(
      r.legality !== "WIDE" ||
        ["RUN_OUT", "STUMPED", "HIT_WICKET"].includes(d.kind),
      "INVALID_DISMISSAL",
      "Wide dismissal mask",
    );
    requireValue(
      r.legality !== "DEAD",
      "INVALID_DISMISSAL",
      "Dead-ball dismissal",
    );
    requireValue(
      d.fielderId === null ||
        [c.bowlerId, c.keeperId, ...c.outfieldIds].includes(d.fielderId),
      "INVALID_DISMISSAL",
      "Unknown fielder",
    );
    if (d.kind === "CAUGHT")
      requireValue(
        r.batContact &&
          ["AERIAL", "EDGE"].includes(r.trajectory ?? "") &&
          d.fielderId !== null &&
          r.fieldOutcome === "CATCH" &&
          r.batRuns === 0,
        "INVALID_DISMISSAL",
        "Catch requires bat contact, fielder and zero bat runs",
      );
    if (d.kind === "STUMPED")
      requireValue(
        d.fielderId === c.keeperId && !r.batContact && r.attemptedRuns === 0,
        "INVALID_DISMISSAL",
        "Stumping requires keeper and no run attempted",
      );
    if (d.kind === "RUN_OUT")
      requireValue(
        d.fielderId !== null && r.fieldOutcome === "RUN_OUT",
        "INVALID_DISMISSAL",
        "Run-out needs a fielder and outcome",
      );
    if (["BOWLED", "LBW", "HIT_WICKET"].includes(d.kind))
      requireValue(
        d.fielderId === null,
        "INVALID_DISMISSAL",
        "Unassisted dismissal",
      );
    if (d.kind === "LBW")
      requireValue(
        !r.batContact,
        "INVALID_DISMISSAL",
        "LBW cannot follow bat contact",
      );
    if (d.kind !== "RUN_OUT")
      requireValue(
        d.wicketEnd === c.strikerEnd && r.completedRuns === 0,
        "INVALID_DISMISSAL",
        "Supported non-run-out dismissal is at striker end without completed runs",
      );
  }
  requireValue(
    r.fieldOutcome !== "CATCH" || d?.kind === "CAUGHT",
    "INVALID_DISMISSAL",
    "Ineligible catch must be a stop, not a credited catch",
  );
  requireValue(
    r.fieldOutcome !== "RUN_OUT" || d?.kind === "RUN_OUT",
    "INVALID_DISMISSAL",
    "Run-out outcome requires a dismissal",
  );
  const occupied = [r.endsAfter.north, r.endsAfter.south].filter(
    (id): id is string => id !== null,
  );
  if (d)
    requireValue(
      occupied.length === 1 &&
        occupied[0] ===
          (d.playerId === c.strikerId ? c.nonStrikerId : c.strikerId),
      "INVALID_ENDS",
      "Exactly the surviving batter occupies an end",
    );
  else {
    const swap = r.completedRuns % 2 === 1;
    requireValue(
      r.endsAfter.north === c.endsBefore[swap ? "south" : "north"] &&
        r.endsAfter.south === c.endsBefore[swap ? "north" : "south"],
      "INVALID_ENDS",
      "Physical running determines ends",
    );
  }
  if (d && d.kind !== "RUN_OUT")
    requireValue(
      r.endsAfter[c.strikerEnd === "NORTH" ? "north" : "south"] === null,
      "INVALID_ENDS",
      "Incoming batter belongs at dismissed striker end",
    );
  return { context: c, resolution: r };
}
