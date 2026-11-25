/**
 * Keeps a limited-overs innings finishable when a person chooses the bowler (found while making tour and auction
 * matches playable, 18 November 2026).
 *
 * The rules allow an XI with only five bowlers. With five, an unlucky order (A, B, A, B, then C, D, C, D) leaves a
 * single bowler with overs left who bowled the over before, and the innings cannot go on. This check refuses a choice
 * that makes the remaining overs impossible to bowl. It reads the ledger only; the frozen engines are unchanged.
 */

import { canCompleteBowling } from "@lcxxvi/ai";

export type BowlerState = { id: string; eligible: boolean; legalBalls: number };

/**
 * Whether choosing `choiceId` for the next over still leaves a legal way to bowl every over that remains: no bowler
 * twice in a row, and none past `quotaBalls`. `oversRemaining` counts the next over.
 */
export function leavesInningsFinishable(choiceId: string, bowlers: readonly BowlerState[], oversRemaining: number, quotaBalls: number): boolean {
  const left = (b: BowlerState) => (b.eligible ? Math.max(0, Math.ceil((quotaBalls - b.legalBalls) / 6)) : 0);
  const choice = bowlers.find((b) => b.id === choiceId);
  if (!choice || left(choice) < 1) return false;
  const n = oversRemaining - 1;
  if (n <= 0) return true;
  // The same rule the computer captains use (packages/ai bowling-plan.ts): the overs after this one must not start
  // with the chosen bowler.
  return canCompleteBowling(n, bowlers.map((b) => ({ playerId: b.id, oversLeft: left(b) - (b.id === choiceId ? 1 : 0) })), choiceId);
}

/** The reason to refuse each eligible bowler that would strand the innings; none if every choice would. */
export function strandingReasons(bowlers: readonly BowlerState[], oversRemaining: number, quotaBalls: number): Map<string, string> {
  const eligible = bowlers.filter((b) => b.eligible);
  const finishable = new Set(eligible.filter((b) => leavesInningsFinishable(b.id, bowlers, oversRemaining, quotaBalls)).map((b) => b.id));
  const reasons = new Map<string, string>();
  if (finishable.size === 0) return reasons;
  for (const b of eligible) if (!finishable.has(b.id)) reasons.set(b.id, "Would leave overs that no one could bowl");
  return reasons;
}
