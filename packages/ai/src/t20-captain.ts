/** LC_T20_TACTICAL_CAPTAIN_V2. Pure deterministic, public-observation-only choices.
 * V2 (Pavilion P04, 25 November 2026): never picks a bowler after whom the rest of the innings cannot be bowled
 * (bowling-plan.ts); otherwise the same choices as V1.
 * The caller owns legality; candidates here are already filtered by the cricket engine.
 * No match seed, random counter, hidden player attributes or opponent future actions occur in this DTO.
 */
export interface TacticalBowlerCandidate {
  readonly playerId: string;
  readonly control: number;
  readonly movement: number;
  readonly variation: number;
  readonly stamina: number;
  readonly fatigueBp: number;
  readonly legalBallsBowled: number;
  readonly quotaRemaining: number;
}
export interface T20TacticalPublicView {
  readonly inningsLegalBalls: number;
  readonly inningsRuns: number;
  readonly wicketsLost: number;
  readonly targetToWin: number | null;
  readonly availableBatters: number;
  readonly bowlingCandidates: readonly TacticalBowlerCandidate[];
  /** The bowler of the previous over (not a candidate for this one) and the balls left in their quota. */
  readonly previousOverBowler?: { readonly playerId: string; readonly quotaRemaining: number } | null;
}
export type T20TacticalAdvice = Readonly<{
  policyId: "LC_T20_TACTICAL_CAPTAIN_V2";
  aggression: 0 | 1 | 2 | 3 | 4;
  preferredBowlerId: string | null;
  bowlingEffort: "CONSERVE" | "NORMAL" | "MAXIMUM";
  bowlingLength: "GOOD" | "FULL" | "YORKER";
  fieldIntent: "ATTACK" | "BALANCED" | "DEFEND";
  reason: string;
}>;

import { feasibleBowlerChoice, type BowlerOvers } from "./bowling-plan.js";

/** Every bowling-capable player with overs left, the previous over's bowler included, in whole overs. */
export function bowlersWithOversLeft(
  view: { readonly bowlingCandidates: readonly { readonly playerId: string; readonly quotaRemaining: number }[]; readonly previousOverBowler?: { readonly playerId: string; readonly quotaRemaining: number } | null },
  ballsPerOver: number,
): BowlerOvers[] {
  const all = [...view.bowlingCandidates, ...(view.previousOverBowler ? [view.previousOverBowler] : [])];
  return all.map(p => ({ playerId: p.playerId, oversLeft: Math.floor(p.quotaRemaining / ballsPerOver) }));
}

function assertFiniteNonnegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`LC_T20_AI_INVALID_${name}`);
}
/** Rule-based expected-utility proxy on allowed observable values. Not empirically fitted. */
export function adviseT20Captain(view: Readonly<T20TacticalPublicView>): T20TacticalAdvice {
  for (const [name, value] of Object.entries({
    inningsLegalBalls: view.inningsLegalBalls,
    inningsRuns: view.inningsRuns,
    wicketsLost: view.wicketsLost,
    availableBatters: view.availableBatters,
  })) assertFiniteNonnegative(value, name);
  if (view.inningsLegalBalls > 120 || view.wicketsLost > 10) throw new Error("LC_T20_AI_INVALID_INNINGS");
  const remaining = Math.max(1, 120 - view.inningsLegalBalls);
  const requiredRate = view.targetToWin === null ? null : Math.max(0, view.targetToWin - view.inningsRuns) * 6 / remaining;
  const phase = view.inningsLegalBalls < 36 ? "EARLY" : view.inningsLegalBalls < 90 ? "MIDDLE" : "DEATH";
  let aggression: 0 | 1 | 2 | 3 | 4 = phase === "EARLY" ? 2 : phase === "MIDDLE" ? 2 : 3;
  if (requiredRate !== null) {
    aggression = requiredRate > 12 ? 4 : requiredRate > 9 ? 3 : requiredRate < 5 ? 1 : 2;
  }
  if (view.wicketsLost >= 7 && remaining > 24 && (requiredRate === null || requiredRate <= 9)) {
    aggression = Math.min(aggression, 1) as 0 | 1;
  }
  const valid = view.bowlingCandidates.filter(p => {
    for (const [name, value] of Object.entries(p)) {
      if (name !== "playerId") assertFiniteNonnegative(value as number, name);
    }
    return p.quotaRemaining > 0 && p.fatigueBp <= 10000;
  });
  // Preserve death overs for good bowlers when there is sufficient remaining capacity.
  const scores = valid.map(p => ({
    id: p.playerId,
    score: 2*p.control + 2*p.movement + p.variation + p.stamina/2 - p.fatigueBp/90
      - (phase !== "DEATH" && p.quotaRemaining <= 6 ? 30 : 0),
  }));
  scores.sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
  const chosenId = feasibleBowlerChoice(scores.map(s => s.id), Math.ceil(remaining / 6), bowlersWithOversLeft(view, 6), view.previousOverBowler?.playerId ?? null);
  const chosen = valid.find(p => p.playerId === chosenId);
  const bowlingEffort = chosen && chosen.fatigueBp >= 7000 ? "CONSERVE" : phase === "DEATH" && chosen && chosen.fatigueBp < 4000 ? "MAXIMUM" : "NORMAL";
  return {
    policyId: "LC_T20_TACTICAL_CAPTAIN_V2",
    aggression,
    preferredBowlerId: chosen?.playerId ?? null,
    bowlingEffort,
    bowlingLength: phase === "DEATH" ? "YORKER" : phase === "MIDDLE" ? "FULL" : "GOOD",
    fieldIntent: view.wicketsLost >= 7 ? "ATTACK" : phase === "DEATH" ? "DEFEND" : "BALANCED",
    reason: `Public score context: ${phase.toLowerCase()} phase, ${view.wicketsLost} wickets, ${remaining} balls remaining${requiredRate === null ? "" : `, required rate ${requiredRate.toFixed(2)}`}`,
  };
}
