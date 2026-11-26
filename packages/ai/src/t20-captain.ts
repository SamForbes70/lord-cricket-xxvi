/** LC_T20_TACTICAL_CAPTAIN_V5. Pure deterministic, public-observation-only choices.
 * V2 (Pavilion P04, 25 November 2026): never picks a bowler after whom the rest of the innings cannot be bowled
 * (bowling-plan.ts); otherwise the same choices as V1.
 * V3 (Pavilion P04 stage B): batting aggression and intent come from LC_T20_BATTING_POLICY_V1 (batting-policy.ts),
 * which also reads the skill of the two batters at the crease; bowling and field choices are V2's.
 * V4 (Pavilion, 25 November 2026): plans the bowling so the best bowlers keep overs for the death. V2's choice spent
 * the best bowlers first and left the weakest to bowl overs 16 to 20 (docs/pavilion/CAPTAIN_V4_DEATH_OVERS.md).
 * Before the death, each of the best bowlers keeps up to two overs back (deathOverReserve) until the five death
 * overs are covered, and the captain picks from the overs left over; in the death it picks its best bowler. The
 * batting policy, lengths, effort rule and field intent are V3's. Never strands the innings (bowling-plan.ts).
 * V5 (Pavilion, 26 November 2026): a varied death-overs bowling plan instead of a yorker at full effort on almost
 * every ball (t20DeathBowlingPlanV5), and LC_T20_BATTING_POLICY_V2 at the death (batting-policy.ts). Bowler choice,
 * the powerplay and middle-overs plans and field intent are V4's (docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md).
 * V4 stays available as adviseT20CaptainV4 for measurement and comparison. A captain's choices are recorded as
 * match commands, so a match played under an older version replays from its commands, not from this code.
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
  /** The bowler of the previous over (not a candidate for this one), the balls left in their quota and, from V4, their
   * public bowling skills, so the death-over plan can count them. Without skills they keep no overs for the death. */
  readonly previousOverBowler?: PreviousOverBowler | null;
  /** The batter about to face and the one at the other end (public batting skills), when known. */
  readonly striker?: BatterSkills | null;
  readonly partner?: BatterSkills | null;
  /** V5: whether the bowler of the current over bowls pace or spin (public: the bowling style), when known. The
   * death-overs plan of a spinner has no bouncer or yorker. Unknown is treated as pace. */
  readonly bowlerStyle?: T20BowlerStyle | null;
}
export type T20BowlerStyle = "PACE" | "SPIN";
/** Pace for FAST and MEDIUM, spin for any other style (the generator's rule), null for no style. */
export function t20BowlerStyleOf(bowlingStyle: string | null | undefined): T20BowlerStyle | null {
  if (!bowlingStyle) return null;
  return bowlingStyle === "FAST" || bowlingStyle === "MEDIUM" ? "PACE" : "SPIN";
}
export type PreviousOverBowler = Readonly<{
  playerId: string;
  quotaRemaining: number;
  control?: number;
  movement?: number;
  variation?: number;
  stamina?: number;
}>;
/** The current tactical captain. */
export const T20_TACTICAL_CAPTAIN_ID = "LC_T20_TACTICAL_CAPTAIN_V5" as const;
/** The previous version, kept for measurement and comparison (adviseT20CaptainV4). */
export const T20_TACTICAL_CAPTAIN_V4_ID = "LC_T20_TACTICAL_CAPTAIN_V4" as const;
export type T20TacticalCaptainId = typeof T20_TACTICAL_CAPTAIN_ID | typeof T20_TACTICAL_CAPTAIN_V4_ID;
export type T20BowlingLength = "GOOD" | "FULL" | "YORKER" | "SHORT";
export type T20BowlingEffort = "CONSERVE" | "NORMAL" | "MAXIMUM";
export type T20TacticalAdvice = Readonly<{
  policyId: T20TacticalCaptainId;
  aggression: 0 | 1 | 2 | 3 | 4;
  battingIntent: BattingIntent;
  preferredBowlerId: string | null;
  bowlingEffort: T20BowlingEffort;
  bowlingLength: T20BowlingLength;
  fieldIntent: "ATTACK" | "BALANCED" | "DEFEND";
  reason: string;
}>;

import { feasibleBowlerChoice, type BowlerOvers } from "./bowling-plan.js";
import { adviseT20Batting, adviseT20BattingV2, battingSkill, TAIL_BELOW, type BatterSkills, type BattingIntent } from "./batting-policy.js";

/** Every bowling-capable player with overs left, the previous over's bowler included, in whole overs. */
export function bowlersWithOversLeft(
  view: { readonly bowlingCandidates: readonly { readonly playerId: string; readonly quotaRemaining: number }[]; readonly previousOverBowler?: { readonly playerId: string; readonly quotaRemaining: number } | null },
  ballsPerOver: number,
): BowlerOvers[] {
  const all = [...view.bowlingCandidates, ...(view.previousOverBowler ? [view.previousOverBowler] : [])];
  return all.map(p => ({ playerId: p.playerId, oversLeft: Math.floor(p.quotaRemaining / ballsPerOver) }));
}

/** Overs 16 to 20. */
export const T20_DEATH_OVERS = 5;
/** The most overs one bowler keeps back for the death. */
export const T20_DEATH_RESERVE_PER_BOWLER = 2;

/** A bowler's standing for the death-over plan: skills only, so the plan does not move with fatigue from over to over. */
export function t20BowlerSkill(p: { readonly control: number; readonly movement: number; readonly variation: number; readonly stamina: number }): number {
  return 2 * p.control + 2 * p.movement + p.variation + p.stamina / 2;
}

/**
 * The overs each bowler keeps back for the death: best bowler first (ties by playerId), up to
 * T20_DEATH_RESERVE_PER_BOWLER each and no more than they have left, until `deathOvers` are covered. With six
 * bowlers on four overs each that is two overs for the best two and one for the third. Pure and deterministic.
 */
export function deathOverReserve(
  bowlers: readonly { readonly playerId: string; readonly oversLeft: number; readonly skill: number }[],
  deathOvers: number,
): Map<string, number> {
  const reserve = new Map<string, number>();
  let toCover = Math.max(0, deathOvers);
  const ranked = [...bowlers].sort((a, b) => b.skill - a.skill || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  for (const b of ranked) {
    const kept = Math.min(T20_DEATH_RESERVE_PER_BOWLER, Math.max(0, b.oversLeft), toCover);
    reserve.set(b.playerId, kept);
    toCover -= kept;
  }
  return reserve;
}

function assertFiniteNonnegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`LC_T20_AI_INVALID_${name}`);
}
type T20Phase = "EARLY" | "MIDDLE" | "DEATH";
/** Bowler choice, phase and the checks V4 and V5 share. */
function captainCore(view: Readonly<T20TacticalPublicView>) {
  for (const [name, value] of Object.entries({
    inningsLegalBalls: view.inningsLegalBalls,
    inningsRuns: view.inningsRuns,
    wicketsLost: view.wicketsLost,
    availableBatters: view.availableBatters,
  })) assertFiniteNonnegative(value, name);
  if (view.inningsLegalBalls > 120 || view.wicketsLost > 10) throw new Error("LC_T20_AI_INVALID_INNINGS");
  const remaining = Math.max(1, 120 - view.inningsLegalBalls);
  const requiredRate = view.targetToWin === null ? null : Math.max(0, view.targetToWin - view.inningsRuns) * 6 / remaining;
  const phase: T20Phase = view.inningsLegalBalls < 36 ? "EARLY" : view.inningsLegalBalls < 90 ? "MIDDLE" : "DEATH";
  const valid = view.bowlingCandidates.filter(p => {
    for (const [name, value] of Object.entries(p)) {
      if (name !== "playerId") assertFiniteNonnegative(value as number, name);
    }
    return p.quotaRemaining > 0 && p.fatigueBp <= 10000;
  });
  for (const [name, value] of Object.entries(view.previousOverBowler ?? {})) {
    if (name !== "playerId" && value !== undefined) assertFiniteNonnegative(value as number, name);
  }
  const oversRemaining = Math.ceil(remaining / 6);
  const overs = bowlersWithOversLeft(view, 6);
  const score = (p: TacticalBowlerCandidate) => t20BowlerSkill(p) - p.fatigueBp / 90;
  const byId = (a: { playerId: string }, b: { playerId: string }) => a.playerId.localeCompare(b.playerId);
  let order: string[];
  if (phase === "DEATH") {
    // The death: the best bowler who can bowl now.
    order = [...valid].sort((a, b) => score(b) - score(a) || byId(a, b)).map(p => p.playerId);
  } else {
    // Before the death: keep the best bowlers' last overs back and bowl the overs left over, best first. Only when no
    // one has an over to spare, dip into the reserve of the least skilled reserved bowler.
    const prev = view.previousOverBowler;
    const prevSkill = prev && [prev.control, prev.movement, prev.variation, prev.stamina].every(v => typeof v === "number")
      ? t20BowlerSkill(prev as Required<PreviousOverBowler>) : Number.NEGATIVE_INFINITY;
    const skillOf = new Map<string, number>([...valid.map(p => [p.playerId, t20BowlerSkill(p)] as const), ...(prev ? [[prev.playerId, prevSkill] as const] : [])]);
    const reserve = deathOverReserve(overs.map(b => ({ ...b, skill: skillOf.get(b.playerId) ?? Number.NEGATIVE_INFINITY })), T20_DEATH_OVERS);
    const spare = (p: TacticalBowlerCandidate) => Math.floor(p.quotaRemaining / 6) - (reserve.get(p.playerId) ?? 0) > 0;
    const free = valid.filter(spare).sort((a, b) => score(b) - score(a) || byId(a, b));
    const reserved = valid.filter(p => !spare(p)).sort((a, b) => t20BowlerSkill(a) - t20BowlerSkill(b) || byId(a, b));
    order = [...free, ...reserved].map(p => p.playerId);
  }
  const chosenId = feasibleBowlerChoice(order, oversRemaining, overs, view.previousOverBowler?.playerId ?? null);
  const chosen = valid.find(p => p.playerId === chosenId) ?? null;
  const reason = `Public score context: ${phase.toLowerCase()} phase, ${view.wicketsLost} wickets, ${remaining} balls remaining${requiredRate === null ? "" : `, required rate ${requiredRate.toFixed(2)}`}`;
  return { phase, chosen, reason };
}

function battingView(view: Readonly<T20TacticalPublicView>) {
  return {
    inningsLegalBalls: view.inningsLegalBalls, inningsRuns: view.inningsRuns, wicketsLost: view.wicketsLost,
    targetToWin: view.targetToWin, striker: view.striker ?? null, partner: view.partner ?? null,
  };
}

/** V4's effort rule: conserve when tired, flat out at the death while fresh. */
function effortV4(phase: T20Phase, chosen: TacticalBowlerCandidate | null): T20BowlingEffort {
  return chosen && chosen.fatigueBp >= 7000 ? "CONSERVE" : phase === "DEATH" && chosen && chosen.fatigueBp < 4000 ? "MAXIMUM" : "NORMAL";
}

/** V4's length by phase: good length early, full in the middle, a yorker at the death. */
function lengthV4(phase: T20Phase): T20BowlingLength {
  return phase === "DEATH" ? "YORKER" : phase === "MIDDLE" ? "FULL" : "GOOD";
}

function fieldIntent(view: Readonly<T20TacticalPublicView>, phase: T20Phase): "ATTACK" | "BALANCED" | "DEFEND" {
  return view.wicketsLost >= 7 ? "ATTACK" : phase === "DEATH" ? "DEFEND" : "BALANCED";
}

function advice(policyId: T20TacticalCaptainId, batting: Readonly<{ aggression: 0 | 1 | 2 | 3 | 4; intent: BattingIntent }>, chosen: TacticalBowlerCandidate | null, plan: T20DeathBowlingPlan, field: "ATTACK" | "BALANCED" | "DEFEND", reason: string): T20TacticalAdvice {
  return {
    policyId,
    aggression: batting.aggression,
    battingIntent: batting.intent,
    preferredBowlerId: chosen?.playerId ?? null,
    bowlingEffort: plan.effort,
    bowlingLength: plan.length,
    fieldIntent: field,
    reason,
  };
}

/** LC_T20_TACTICAL_CAPTAIN_V4, unchanged: kept for measurement and comparison. Rule-based, not empirically fitted. */
export function adviseT20CaptainV4(view: Readonly<T20TacticalPublicView>): T20TacticalAdvice {
  const { phase, chosen, reason } = captainCore(view);
  const batting = adviseT20Batting(battingView(view));
  return advice(T20_TACTICAL_CAPTAIN_V4_ID, batting, chosen, { length: lengthV4(phase), effort: effortV4(phase, chosen) }, fieldIntent(view, phase), reason);
}

export type T20DeathBowlingPlan = Readonly<{ length: T20BowlingLength; effort: T20BowlingEffort }>;

/**
 * V5's death-overs plan for one ball (overs 16 to 20). Cricket judgement, not fitted to any total
 * (docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md). The ball's place in the over sets the plan, so each over mixes:
 *
 *   ball of the over      1          2              3          4            5              6
 *   pace                  yorker     slower ball    yorker     bouncer      slower ball    hard length
 *                         (normal)   (good length)  (maximum)  (maximum)    (full)         (maximum)
 *   pace, tail on strike  as pace, but the sixth ball is a yorker at maximum effort
 *   spin                  good       full, slower   good,      full         good, slower   full, quicker
 *                         length     (flighted)     quicker    length       length
 *
 * Pace: two yorkers (three to a tail-ender), two slower balls, one bouncer (the T20 playing condition allows one
 * short ball an over) and one hard length. Spin: no bouncer and no yorker; pace changes on good and full lengths.
 * A tired bowler (fatigue 7,000 bp or more) conserves effort on every ball, as in V4. Pure and deterministic.
 */
export function t20DeathBowlingPlanV5(input: Readonly<{ ballOfOver: number; style: T20BowlerStyle; strikerIsTail: boolean; fatigueBp: number }>): T20DeathBowlingPlan {
  if (!Number.isInteger(input.ballOfOver) || input.ballOfOver < 0 || input.ballOfOver > 5) throw new Error("LC_T20_AI_INVALID_BALL_OF_OVER");
  const pace: readonly T20DeathBowlingPlan[] = [
    { length: "YORKER", effort: "NORMAL" },
    { length: "GOOD", effort: "CONSERVE" },
    { length: "YORKER", effort: "MAXIMUM" },
    { length: "SHORT", effort: "MAXIMUM" },
    { length: "FULL", effort: "CONSERVE" },
    input.strikerIsTail ? { length: "YORKER", effort: "MAXIMUM" } : { length: "GOOD", effort: "MAXIMUM" },
  ];
  const spin: readonly T20DeathBowlingPlan[] = [
    { length: "GOOD", effort: "NORMAL" },
    { length: "FULL", effort: "CONSERVE" },
    { length: "GOOD", effort: "MAXIMUM" },
    { length: "FULL", effort: "NORMAL" },
    { length: "GOOD", effort: "CONSERVE" },
    { length: "FULL", effort: "MAXIMUM" },
  ];
  const plan = (input.style === "SPIN" ? spin : pace)[input.ballOfOver]!;
  return input.fatigueBp >= 7000 ? { length: plan.length, effort: "CONSERVE" } : plan;
}

/** LC_T20_TACTICAL_CAPTAIN_V5, the current captain. Rule-based expected-utility proxy on allowed observable values. */
export function adviseT20Captain(view: Readonly<T20TacticalPublicView>): T20TacticalAdvice {
  const { phase, chosen, reason } = captainCore(view);
  const batting = adviseT20BattingV2(battingView(view));
  // The plan is for the ball about to be bowled, by the bowler of the current over: in the death that bowler is the
  // chosen one (V4's choice of the best available bowler), or the one already bowling the over.
  const strikerIsTail = view.striker !== null && view.striker !== undefined && battingSkill(view.striker) < TAIL_BELOW;
  const plan = phase === "DEATH"
    ? t20DeathBowlingPlanV5({ ballOfOver: view.inningsLegalBalls % 6, style: view.bowlerStyle ?? "PACE", strikerIsTail, fatigueBp: chosen?.fatigueBp ?? 0 })
    : { length: lengthV4(phase), effort: effortV4(phase, chosen) };
  return advice(T20_TACTICAL_CAPTAIN_ID, batting, chosen, plan, fieldIntent(view, phase), reason);
}
