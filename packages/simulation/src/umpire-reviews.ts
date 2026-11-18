import type { BallTracking, ScoringContext as DeliveryContext, DeliveryResolution } from "@lcxxvi/contracts";
import { createRandomService } from "./determinism.js";

/**
 * Stage 14 player reviews (`LC_T20_DRS_01`, `LC_ODI_DRS_01`; owner decisions B1a to B5a, 18 November 2026; design in
 * docs/DRS_PROPOSAL.md, numbers accepted as a starting point).
 *
 * The frozen generator decides what really happened on each ball. This module adds an umpire: for a close leg-before or
 * caught-behind appeal it draws ball-tracking readings and an on-field decision from its own random stage
 * (`MATCH_DELIVERY` domain, stage `umpire-review`), so no generator draw moves. It never changes a ball that was not a
 * close appeal, and never touches wides, no-balls or free hits (no dismissal of these kinds is possible on them).
 *
 * Ball tracking is decisive: any reading out means not out; otherwise any umpire's call keeps the on-field decision;
 * otherwise out. The frozen generator has no ball path, so the readings are drawn to agree with its outcome: a ball it
 * gave out is hitting (or clipping, an umpire's call); a ball it gave not out shows why (pitching outside leg, impact
 * outside the line, missing), or clips the stumps as an umpire's call.
 */

const random = createRandomService();

export type AppealKind = "LBW" | "CAUGHT_BEHIND";
export type Decisive = "OUT" | "NOT_OUT" | "UMPIRES_CALL";
export type ReviewCue = "CONFIDENT" | "DOUBTFUL";

export type Appeal = {
  kind: AppealKind;
  onFieldOut: boolean;
  /** What ball tracking (leg-before) or the edge detector (caught behind) will show. Hidden until a review. */
  decisive: Decisive;
  tracking: BallTracking | null;
  /**
   * What the side entitled to review can sense on the field: the batter or the bowler and keeper are confident, or
   * not. Drawn so that a wrong decision is more often felt as wrong; it never reveals the reading itself.
   */
  cue: ReviewCue;
};

/** Starting numbers from the approved proposal, in basis points. */
export const UMPIRE_POLICY = Object.freeze({
  lbwClearOutGivenOutBp: 8500,
  lbwUmpiresCallGivenOutBp: 5000,
  lbwNotOutGivenOutBp: 600,
  edgeGivenOutBp: 8000,
  noEdgeGivenOutBp: 400,
  /** Of the balls the generator gave out leg-before, the share that only clip the stumps (umpire's call). */
  lbwOutClippingBp: 3000,
  /** Of leg-before shouts the generator gave not out, the share the fielding side appeals at all. */
  lbwNotOutAppealBp: 2000,
  /** Of balls that beat the bat without a dismissal, the share that bring a caught-behind appeal. */
  missAppealBp: 600,
  /** Of edges the keeper catches, the share that are thin enough to be in doubt (the rest are given out plainly). */
  thinEdgeBp: 3500,
  /** Chance the reviewing side feels confident: when the on-field decision is wrong, umpire's call, or right. */
  cueWrongBp: 7000,
  cueUmpiresCallBp: 4000,
  cueRightBp: 1500,
});

function decisiveFrom(tracking: BallTracking): Decisive {
  const readings = [tracking.pitching, tracking.impact, tracking.wickets];
  if (readings.includes("OUT")) return "NOT_OUT";
  if (readings.includes("UMPIRES_CALL")) return "UMPIRES_CALL";
  return "OUT";
}

/**
 * Decides whether this ball brings a reviewable appeal and, if so, the hidden truth and the on-field decision. `contact`
 * is the generator's contact class for the ball (its `contact` stage).
 */
export function drawAppeal(input: {
  seed: string;
  matchId: string;
  attemptOrdinal: number;
  context: DeliveryContext;
  resolution: DeliveryResolution;
  contact: string | null;
}): Appeal | null {
  const { context: c, resolution: r } = input;
  if (r.legality !== "LEGAL" || c.freeHitPending || r.stage !== "DELIVERY") return null;
  const bp = (drawIndex: number) =>
    random.uint32({
      seed: input.seed,
      domain: "MATCH_DELIVERY",
      entityId: `${input.matchId}:${c.inningsIndex}`,
      eventOrdinal: input.attemptOrdinal,
      stageName: "umpire-review",
      drawIndex,
    }) % 10000;
  const p = UMPIRE_POLICY;
  let kind: AppealKind;
  let decisive: Decisive;
  let tracking: BallTracking | null = null;
  let givenOutBp: number;
  if (input.contact === "PAD") {
    kind = "LBW";
    const generatorOut = r.dismissal?.kind === "LBW";
    const roll = bp(0);
    if (generatorOut) tracking = { pitching: "IN", impact: "IN", wickets: roll < p.lbwOutClippingBp ? "UMPIRES_CALL" : "IN" };
    else if (roll < 2500) tracking = { pitching: "OUT", impact: "IN", wickets: "IN" };
    else if (roll < 5000) tracking = { pitching: "IN", impact: "OUT", wickets: "IN" };
    else if (roll < 8500) tracking = { pitching: "IN", impact: "IN", wickets: "OUT" };
    else tracking = { pitching: "IN", impact: "IN", wickets: "UMPIRES_CALL" };
    decisive = decisiveFrom(tracking);
    if (decisive === "NOT_OUT" && bp(1) >= p.lbwNotOutAppealBp) return null;
    givenOutBp = decisive === "OUT" ? p.lbwClearOutGivenOutBp : decisive === "UMPIRES_CALL" ? p.lbwUmpiresCallGivenOutBp : p.lbwNotOutGivenOutBp;
  } else if (input.contact === "EDGE" && r.dismissal?.kind === "CAUGHT" && r.dismissal.fielderId === c.keeperId) {
    if (bp(1) >= p.thinEdgeBp) return null;
    kind = "CAUGHT_BEHIND";
    decisive = "OUT";
    givenOutBp = p.edgeGivenOutBp;
  } else if (input.contact === "MISS" && r.dismissal === null) {
    if (bp(1) >= p.missAppealBp) return null;
    kind = "CAUGHT_BEHIND";
    decisive = "NOT_OUT";
    givenOutBp = p.noEdgeGivenOutBp;
  } else return null;
  const onFieldOut = bp(2) < givenOutBp;
  const wrong = (decisive === "OUT" && !onFieldOut) || (decisive === "NOT_OUT" && onFieldOut);
  const cueBp = wrong ? p.cueWrongBp : decisive === "UMPIRES_CALL" ? p.cueUmpiresCallBp : p.cueRightBp;
  return { kind, onFieldOut, decisive, tracking, cue: bp(3) < cueBp ? "CONFIDENT" : "DOUBTFUL" };
}

const NO_EXTRAS = { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };

/** The ball as recorded when the batter is given out for this appeal (a dead ball: no runs count). */
export function outResolution(r: DeliveryResolution, c: DeliveryContext, kind: AppealKind): DeliveryResolution {
  if (kind === "LBW" && r.dismissal?.kind === "LBW") return r;
  if (kind === "CAUGHT_BEHIND" && r.dismissal?.kind === "CAUGHT") return r;
  const strikerSide = c.strikerEnd === "NORTH" ? "north" : "south";
  const endsAfter = { north: c.endsBefore.north, south: c.endsBefore.south, [strikerSide]: null } as DeliveryResolution["endsAfter"];
  const common = { ...r, batRuns: 0, extras: { ...NO_EXTRAS }, completedRuns: 0, attemptedRuns: 0, boundary: "NONE" as const, endsAfter };
  return kind === "LBW"
    ? { ...common, dismissal: { kind: "LBW", playerId: c.strikerId, fielderId: null, wicketEnd: c.strikerEnd }, batContact: false, trajectory: null, shotSector: null, fieldOutcome: "NONE" }
    : { ...common, dismissal: { kind: "CAUGHT", playerId: c.strikerId, fielderId: c.keeperId, wicketEnd: c.strikerEnd }, batContact: true, attemptedStroke: true, trajectory: "EDGE", fieldOutcome: "CATCH" };
}

/** The ball as recorded when the batter is given not out: unchanged if the generator had no dismissal, else a dot ball. */
export function notOutResolution(r: DeliveryResolution, c: DeliveryContext): DeliveryResolution {
  if (r.dismissal === null) return r;
  return {
    ...r,
    dismissal: null,
    batRuns: 0,
    extras: { ...NO_EXTRAS },
    completedRuns: 0,
    attemptedRuns: 0,
    boundary: "NONE",
    fieldOutcome: r.fieldOutcome === "CATCH" ? "STOP" : r.fieldOutcome,
    endsAfter: { north: c.endsBefore.north, south: c.endsBefore.south },
  };
}
