/**
 * Batting policy V3 (captain V6, 27 November 2026): the captains the research scripts can be asked to play, by name.
 * docs/pavilion/BATTING_POLICY_V3.md. Research only: nothing here is used by the game.
 *
 *   V4   adviseT20CaptainV4 (LC_T20_BATTING_POLICY_V1)
 *   V5   adviseT20CaptainV5 (LC_T20_BATTING_POLICY_V2)
 *   V6   adviseT20Captain, the current captain (LC_T20_BATTING_POLICY_V3, candidate A: the tail-ender rule)
 *   V6B  V6's bowling and field with candidate B's batting (relative to the partner), below. Measured and reported,
 *        not chosen; it lives here so its numbers can be reproduced.
 */
import {
  adviseT20BattingV2, adviseT20Captain, adviseT20CaptainV4, adviseT20CaptainV5, battingSkill,
  type T20BattingView, type T20TacticalAdvice, type T20TacticalPublicView,
} from "@lcxxvi/ai";

export type CaptainName = "V4" | "V5" | "V6" | "V6B";
export const CAPTAIN_NAMES: readonly CaptainName[] = ["V4", "V5", "V6", "V6B"];

/** Candidate B: a striker this many batting-skill points below his partner is the weaker batter (about one class in the
 * fictional world: specialists 245 to 300, all-rounders and keepers 190 to 250, bowlers 108 to 170). */
export const CANDIDATE_B_GAP = 50;

/**
 * Candidate B, written before measuring: V2 everywhere except the first innings's death overs with more than one
 * over left, where a striker at least CANDIDATE_B_GAP skill points below the batter at the other end attacks at 3 at
 * most and looks for the single (ROTATE), to give the stronger batter the strike. Both batters must be known.
 */
export function candidateBBatting(view: Readonly<T20BattingView>): { aggression: 0 | 1 | 2 | 3 | 4; intent: "NORMAL" | "ROTATE" | "PROTECT" } {
  const v2 = adviseT20BattingV2(view);
  const ballsLeft = Math.max(1, 120 - view.inningsLegalBalls);
  if (view.targetToWin !== null || view.inningsLegalBalls < 90 || ballsLeft <= 6 || !view.striker || !view.partner) return v2;
  if (battingSkill(view.striker) > battingSkill(view.partner) - CANDIDATE_B_GAP) return v2;
  return { aggression: Math.min(v2.aggression, 3) as 0 | 1 | 2 | 3, intent: "ROTATE" };
}

const battingView = (view: Readonly<T20TacticalPublicView>): T20BattingView => ({
  inningsLegalBalls: view.inningsLegalBalls, inningsRuns: view.inningsRuns, wicketsLost: view.wicketsLost,
  targetToWin: view.targetToWin, striker: view.striker ?? null, partner: view.partner ?? null,
});

export function captainByName(name: string): (view: T20TacticalPublicView) => T20TacticalAdvice {
  switch (name) {
    case "V4": return adviseT20CaptainV4;
    case "V5": return adviseT20CaptainV5;
    case "V6": return adviseT20Captain;
    case "V6B": return (view) => {
      const b = candidateBBatting(battingView(view));
      return { ...adviseT20Captain(view), aggression: b.aggression, battingIntent: b.intent };
    };
    default: throw new Error(`unknown captain ${name}: use ${CAPTAIN_NAMES.join(", ")}`);
  }
}
