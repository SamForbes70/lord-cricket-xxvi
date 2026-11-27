/**
 * Pavilion P04 stage B (owner approval of 24 November 2026): a versioned, context-aware batting policy.
 *
 * LC_T20_BATTING_POLICY_V1 chooses the striker's aggression (0 to 4) and intent from what a captain can see: balls
 * left, wickets in hand, the required rate in a chase, and the batting skill of the two batters at the crease. It
 * replaces the captain's fixed phase rule (2, 2, then 3 at the death) and the old practice of always sending intent
 * NORMAL.
 *
 * The rules are cricket judgements, not fitted values, and no target total was tuned into them (P04 diagnosis,
 * stage B). They were measured on the frozen corpus (scripts/pavilion-p04b-measure.ts); the measurement is in the
 * pull request and docs/pavilion/p04/stage-b.json.
 *
 * Pure and deterministic. It reads no seed, random counter or hidden state. A choice it makes is recorded as a match
 * command, so replays of matches played under older policies are unaffected.
 */
export const T20_BATTING_POLICY_ID = "LC_T20_BATTING_POLICY_V1" as const;

export interface BatterSkills {
  readonly timing: number;
  readonly power: number;
  readonly defence: number;
  readonly rotation: number;
}

export interface T20BattingView {
  readonly inningsLegalBalls: number;
  readonly inningsRuns: number;
  readonly wicketsLost: number;
  readonly targetToWin: number | null;
  /** The batter about to face, or null when not known. */
  readonly striker: BatterSkills | null;
  /** The batter at the other end, or null when not known. */
  readonly partner: BatterSkills | null;
}

export type BattingIntent = "NORMAL" | "ROTATE" | "PROTECT";
export type T20BattingAdvice = Readonly<{
  policyId: typeof T20_BATTING_POLICY_ID;
  aggression: 0 | 1 | 2 | 3 | 4;
  intent: BattingIntent;
  reason: string;
}>;

/** Sum of the four batting skills. In the fictional world, bowlers score about 95 to 170, specialists 225 to 300. */
export const battingSkill = (s: BatterSkills) => s.timing + s.power + s.defence + s.rotation;
/** Below this a batter is treated as a tail-ender (most bowlers; no specialist batter). */
export const TAIL_BELOW = 175;

const clamp = (n: number): 0 | 1 | 2 | 3 | 4 => Math.max(0, Math.min(4, Math.round(n))) as 0 | 1 | 2 | 3 | 4;

export function adviseT20Batting(view: Readonly<T20BattingView>): T20BattingAdvice {
  for (const [name, value] of Object.entries({ b: view.inningsLegalBalls, r: view.inningsRuns, w: view.wicketsLost })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`LC_T20_BATTING_INVALID_${name}`);
  }
  if (view.inningsLegalBalls > 120 || view.wicketsLost > 10) throw new Error("LC_T20_BATTING_INVALID_INNINGS");
  const ballsLeft = Math.max(1, 120 - view.inningsLegalBalls);
  const inHand = Math.max(0, 10 - view.wicketsLost);
  const tailStriker = view.striker !== null && battingSkill(view.striker) < TAIL_BELOW;
  const tailPartner = view.partner !== null && battingSkill(view.partner) < TAIL_BELOW;
  const reasons: string[] = [];
  let aggression: number;

  if (view.targetToWin === null) {
    // Setting a total: attack the powerplay with wickets in hand, build in the middle, accelerate by resources.
    if (view.inningsLegalBalls < 36) aggression = view.wicketsLost <= 1 ? 3 : 2;
    else if (view.inningsLegalBalls < 90) aggression = inHand >= 7 && view.inningsLegalBalls >= 66 ? 3 : 2;
    else aggression = inHand >= 4 ? 4 : 3;
    if (ballsLeft <= 12) aggression = 4;
    // Few wickets and many balls: protect the innings so it lasts the overs.
    if (inHand <= 3 && ballsLeft > 18) {
      aggression = Math.min(aggression, 2);
      reasons.push("few wickets left");
    }
    reasons.unshift(`setting a total, ${ballsLeft} balls and ${inHand} wickets left`);
  } else {
    const needed = Math.max(0, view.targetToWin - view.inningsRuns);
    const rate = (needed * 6) / ballsLeft;
    aggression = rate < 6 ? 1 : rate < 8 ? 2 : rate < 10 ? 3 : 4;
    if (inHand <= 3 && rate < 10) {
      aggression -= 1;
      reasons.push("few wickets left");
    }
    if (inHand >= 6 && ballsLeft <= 30 && rate >= 8) aggression += 1;
    if (ballsLeft <= 6 && needed > ballsLeft) aggression = 4;
    reasons.unshift(`chasing ${needed} from ${ballsLeft} balls (rate ${rate.toFixed(2)}), ${inHand} wickets left`);
  }

  // A tail-ender does not slog early when a recognised batter is still there to score.
  if (tailStriker && !tailPartner && ballsLeft > 12) {
    aggression = Math.min(aggression, 2);
    reasons.push("tail-ender on strike");
  }
  aggression = Math.max(aggression, 1);

  // Strike: a tail-ender looks for a single to give the recognised batter the strike; in the middle overs, when not
  // attacking, singles keep the score moving.
  let intent: BattingIntent = "NORMAL";
  if (tailStriker && !tailPartner && ballsLeft > 6) intent = "ROTATE";
  else if (aggression <= 2 && view.inningsLegalBalls >= 36 && view.inningsLegalBalls < 90) intent = "ROTATE";

  return { policyId: T20_BATTING_POLICY_ID, aggression: clamp(aggression), intent, reason: reasons.join("; ") };
}

/** LC_T20_BATTING_POLICY_V2 (captain V5, 26 November 2026). */
export const T20_BATTING_POLICY_V2_ID = "LC_T20_BATTING_POLICY_V2" as const;
export type T20BattingAdviceV2 = Readonly<{
  policyId: typeof T20_BATTING_POLICY_V2_ID;
  aggression: 0 | 1 | 2 | 3 | 4;
  intent: BattingIntent;
  reason: string;
}>;

/**
 * V1 everywhere except in the first innings's death overs (overs 16 to 20, setting a total), where V1 held the striker
 * to aggression 2 in two cases that a side setting a total does not hold back in (docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md):
 *
 * - three or fewer wickets left with more than 18 balls to go: V1 protected the innings so it lasts the overs. In the
 *   death so few balls are left that a wicket costs little; V2 attacks at 3 (V1 was 2) and still not at 4.
 * - a tail-ender on strike with a recognised batter at the other end: V2 attacks at 3 (V1 was 2) and still looks for
 *   the single (ROTATE) while more than 12 balls are left, as V1 did.
 *
 * Everything else, including every chase rule and the powerplay and middle overs, is V1's. Cricket judgement, not
 * fitted to any total. Pure and deterministic.
 */
export function adviseT20BattingV2(view: Readonly<T20BattingView>): T20BattingAdviceV2 {
  const v1 = adviseT20Batting(view);
  const setting = view.targetToWin === null;
  const death = view.inningsLegalBalls >= 90;
  if (!setting || !death || v1.aggression >= 3) return { ...v1, policyId: T20_BATTING_POLICY_V2_ID };
  const reason = v1.reason.split("; ");
  const held = reason.includes("few wickets left") || reason.includes("tail-ender on strike");
  if (!held) return { ...v1, policyId: T20_BATTING_POLICY_V2_ID };
  return { ...v1, policyId: T20_BATTING_POLICY_V2_ID, aggression: 3, reason: `${v1.reason}; death overs: attack at 3` };
}

/** LC_T20_BATTING_POLICY_V3 (captain V6, 27 November 2026). */
export const T20_BATTING_POLICY_V3_ID = "LC_T20_BATTING_POLICY_V3" as const;
export type T20BattingAdviceV3 = Readonly<{
  policyId: typeof T20_BATTING_POLICY_V3_ID;
  aggression: 0 | 1 | 2 | 3 | 4;
  intent: BattingIntent;
  reason: string;
}>;

/**
 * V2 everywhere except a tail-ender (batting skill below TAIL_BELOW) on strike in the first innings's death overs
 * (overs 16 to 20, setting a total) with more than one over left (docs/pavilion/BATTING_POLICY_V3.md):
 *
 * - with a recognised batter at the other end: aggression 2 and ROTATE. The tail-ender's job is to give the strike to
 *   the batter who can clear the rope, not to slog himself (V2: 3 while more than 12 balls were left, then 4).
 * - with another tail-ender at the other end: aggression 3 at most. No recognised batter is left to farm the strike
 *   to, so he attacks, but not with a full slog until the last over (V2 reached 4 with 12 balls left).
 *
 * In the last over (6 balls or fewer left) everyone swings, as in V2. Recognised batters, the chase and the powerplay
 * and middle overs are V2's. An unknown partner counts as recognised, as in V1. Cricket judgement written before
 * measuring, not fitted to any total or gate. Pure and deterministic.
 */
export function adviseT20BattingV3(view: Readonly<T20BattingView>): T20BattingAdviceV3 {
  const v2 = adviseT20BattingV2(view);
  const advice = { ...v2, policyId: T20_BATTING_POLICY_V3_ID };
  const setting = view.targetToWin === null;
  const death = view.inningsLegalBalls >= 90;
  const ballsLeft = Math.max(1, 120 - view.inningsLegalBalls);
  const tailStriker = view.striker !== null && battingSkill(view.striker) < TAIL_BELOW;
  if (!setting || !death || !tailStriker || ballsLeft <= 6) return advice;
  const tailPartner = view.partner !== null && battingSkill(view.partner) < TAIL_BELOW;
  if (!tailPartner) {
    return { ...advice, aggression: 2, intent: "ROTATE", reason: `${v2.reason}; death overs: tail-ender gives the strike to the recognised batter` };
  }
  if (v2.aggression <= 3) return advice;
  return { ...advice, aggression: 3, reason: `${v2.reason}; death overs: two tail-enders, attack at 3 until the last over` };
}
