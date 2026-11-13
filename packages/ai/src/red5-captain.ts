import type { FieldSlot, RedBallTacticalProfile } from "@lcxxvi/contracts";

/** LC_RED5_TACTICAL_CAPTAIN_V1. Pure deterministic, public-observation-only choices for five-day red-ball matches.
 * Bounded by explicit tactical profile (CONSERVATIVE | BALANCED | AGGRESSIVE).
 * Uses lead, wickets, bowler workload (fatigue/stamina), ball age, pitch wear/turn, and remaining match time.
 */
export interface Red5BowlerCandidate {
  readonly playerId: string;
  readonly isSpin: boolean;
  readonly control: number;
  readonly movement: number;
  readonly variation: number;
  readonly stamina: number;
  readonly fatigueBp: number;
  readonly legalBallsBowled: number;
}

export interface Red5TacticalPublicView {
  readonly profile: RedBallTacticalProfile;
  readonly inningsIndex: number;
  readonly inningsLegalBalls: number;
  readonly inningsRuns: number;
  readonly wicketsLost: number;
  /** Signed batting-side aggregate minus bowling-side aggregate (positive when batting side leads overall). */
  readonly leadRuns: number;
  readonly targetToWin: number | null;
  readonly availableBatters: number;
  readonly day: number;
  readonly localSeconds: number;
  readonly dayLegalBalls: number;
  readonly finalHourActive: boolean;
  readonly finalHourBallsRemaining: number;
  readonly ballAgeLegalBalls: number;
  readonly newBallAvailable: boolean;
  readonly followOnAvailable: boolean;
  readonly pitchSeamBp: number;
  readonly pitchTurnBp: number;
  readonly pitchWearPoints: number;
  readonly strikerHand: "R" | "L";
  readonly outfieldIds: readonly string[];
  readonly bowlingCandidates: readonly Red5BowlerCandidate[];
}

export type Red5TacticalAdvice = Readonly<{
  policyId: "LC_RED5_TACTICAL_CAPTAIN_V1";
  profile: RedBallTacticalProfile;
  shouldDeclare: boolean;
  enforceFollowOn: boolean;
  takeNewBall: boolean;
  aggression: 0 | 1 | 2 | 3 | 4;
  battingIntent: "NORMAL" | "ROTATE" | "PROTECT";
  preferredBowlerId: string | null;
  bowlingEffort: "CONSERVE" | "NORMAL" | "MAXIMUM";
  bowlingLength: "GOOD" | "FULL" | "SHORT";
  fieldIntent: "ATTACK" | "BALANCED" | "DEFEND";
  fieldSlots: readonly FieldSlot[];
  reason: string;
}>;

export const RED_BALL_PROFILE_DESCRIPTIONS: Readonly<Record<RedBallTacticalProfile, string>> = Object.freeze({
  CONSERVATIVE:
    "Prioritises match safety: larger third-innings cushion before declaring, rests fatigued seamers before enforcing follow-on, rotates workload carefully, and bats to save the draw late on Day 5.",
  BALANCED:
    "Standard five-day posture: declares on a 310+ third-innings lead with bowling time in hand, enforces follow-on when bowlers are fresh or Day 4 arrives, and takes the new ball for rested seamers.",
  AGGRESSIVE:
    "Pushes for a result: declares earlier (260+ lead on Day 4, 210+ on Day 5), enforces follow-on unless seamers are exhausted, attacks with close catchers, and chases fourth-innings targets positively.",
});

function assertFinite(value: number, name: string, allowNegative = false): void {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new Error(`LC_RED5_AI_INVALID_${name}`);
  }
}

function assignSlots(outfieldIds: readonly string[], slotIds: readonly string[]): FieldSlot[] {
  if (outfieldIds.length !== 9 || new Set(outfieldIds).size !== 9) {
    throw new Error("LC_RED5_AI_INVALID_OUTFIELD");
  }
  const sorted = [...outfieldIds].sort();
  return sorted.map((playerId, index) => ({ slotId: slotIds[index]!, playerId }));
}

function selectRed5FieldSlots(intent: "ATTACK" | "BALANCED" | "DEFEND"): readonly string[] {
  // Every 9-slot preset uses 4 or 5 off-side slots and 5 or 4 leg-side slots, keeping <= 5 leg-side and <= 2 behind-square for both R and L hands.
  if (intent === "ATTACK") {
    return ["slip-1", "slip-2", "point", "cover", "mid-off", "mid-on", "midwicket", "deep-square-leg", "fine-leg"];
  }
  if (intent === "DEFEND") {
    return ["point", "cover", "mid-off", "deep-cover", "mid-on", "midwicket", "deep-square-leg", "fine-leg", "long-on"];
  }
  return ["slip-1", "point", "cover", "mid-off", "deep-cover", "mid-on", "midwicket", "deep-square-leg", "long-on"];
}

function estimateRemainingMatchOvers(day: number, localSeconds: number, dayLegalBalls: number, finalHourActive: boolean, finalHourBallsRemaining: number): number {
  if (finalHourActive) {
    const futureDays = Math.max(0, 5 - day);
    return Math.floor(finalHourBallsRemaining / 6) + futureDays * 90;
  }
  const remainingTodayByOvers = Math.max(0, 90 - Math.floor(dayLegalBalls / 6));
  const remainingTodayByClock = Math.max(0, Math.floor((18 * 3600 - localSeconds) / 240));
  const todayOvers = Math.min(remainingTodayByOvers, Math.max(15, remainingTodayByClock));
  const futureDays = Math.max(0, 5 - day);
  return todayOvers + futureDays * 90;
}

export function adviseRed5Captain(view: Readonly<Red5TacticalPublicView>): Red5TacticalAdvice {
  assertFinite(view.inningsIndex, "inningsIndex");
  assertFinite(view.inningsLegalBalls, "inningsLegalBalls");
  assertFinite(view.inningsRuns, "inningsRuns");
  assertFinite(view.wicketsLost, "wicketsLost");
  assertFinite(view.leadRuns, "leadRuns", true);
  assertFinite(view.availableBatters, "availableBatters");
  assertFinite(view.day, "day");
  assertFinite(view.localSeconds, "localSeconds");
  assertFinite(view.dayLegalBalls, "dayLegalBalls");
  assertFinite(view.ballAgeLegalBalls, "ballAgeLegalBalls");
  if (view.inningsIndex > 3 || view.wicketsLost > 10 || view.day < 1 || view.day > 5) {
    throw new Error("LC_RED5_AI_INVALID_STATE");
  }

  const remainingOvers = estimateRemainingMatchOvers(
    view.day,
    view.localSeconds,
    view.dayLegalBalls,
    view.finalHourActive,
    view.finalHourBallsRemaining,
  );

  // 1. Declaration decision (never in 4th innings or when trailing)
  let shouldDeclare = false;
  if (view.inningsIndex === 0 && view.wicketsLost < 10) {
    const firstInningsCap = view.profile === "AGGRESSIVE" ? 500 : view.profile === "BALANCED" ? 560 : 620;
    shouldDeclare = view.inningsRuns >= firstInningsCap || (view.day >= 3 && view.inningsRuns >= firstInningsCap - 80);
  } else if (view.inningsIndex === 2 && view.wicketsLost < 10 && view.leadRuns > 0) {
    const day4Target = view.profile === "AGGRESSIVE" ? 260 : view.profile === "BALANCED" ? 320 : 380;
    const day5Target = view.profile === "AGGRESSIVE" ? 210 : view.profile === "BALANCED" ? 260 : 320;
    const requiredLead = view.day >= 5 ? day5Target : day4Target;
    const minBowlingOvers = view.profile === "AGGRESSIVE" ? 42 : view.profile === "BALANCED" ? 50 : 60;
    if (view.leadRuns >= requiredLead && remainingOvers >= minBowlingOvers) {
      shouldDeclare = true;
    } else if (view.day === 5 && remainingOvers <= minBowlingOvers + 12 && remainingOvers >= 35 && view.leadRuns >= day5Target) {
      shouldDeclare = true;
    }
  }

  // 2. Follow-on decision (only meaningful when followOnAvailable is true, lead >= 200)
  const seamers = view.bowlingCandidates.filter(b => !b.isSpin);
  const avgSeamerFatigue =
    seamers.length > 0 ? seamers.reduce((acc, b) => acc + b.fatigueBp, 0) / seamers.length : 0;
  let enforceFollowOn = false;
  if (view.followOnAvailable) {
    if (view.profile === "AGGRESSIVE") {
      enforceFollowOn = avgSeamerFatigue < 5500 || view.day >= 4 || view.leadRuns >= 300;
    } else if (view.profile === "BALANCED") {
      enforceFollowOn = view.day >= 4 || avgSeamerFatigue < 3400 || view.leadRuns >= 285;
    } else {
      enforceFollowOn = view.day >= 4 || (avgSeamerFatigue < 2400 && view.leadRuns >= 260) || view.leadRuns >= 350;
    }
  }

  // 3. New ball decision (available at >= 80 overs on over boundary)
  const restedSeamerAvailable = seamers.some(b => b.fatigueBp < (view.profile === "CONSERVATIVE" ? 5000 : 6500));
  const wornSpinDominant = view.pitchTurnBp >= 6200 && view.pitchWearPoints >= 320 && !seamers.some(b => b.fatigueBp < 3000);
  let takeNewBall = false;
  if (view.newBallAvailable) {
    if (view.profile === "AGGRESSIVE") {
      takeNewBall = restedSeamerAvailable || !wornSpinDominant;
    } else if (view.profile === "BALANCED") {
      takeNewBall = restedSeamerAvailable && !wornSpinDominant;
    } else {
      takeNewBall = restedSeamerAvailable && view.pitchTurnBp < 6200;
    }
  }

  // 4. Batting aggression & intent
  let aggression: 0 | 1 | 2 | 3 | 4 = view.profile === "AGGRESSIVE" ? 2 : 1;
  let battingIntent: "NORMAL" | "ROTATE" | "PROTECT" = view.profile === "CONSERVATIVE" ? "PROTECT" : "ROTATE";

  if (view.inningsIndex === 2 && view.leadRuns >= 180 && view.availableBatters >= 5) {
    // Setting up a declaration
    aggression = view.profile === "AGGRESSIVE" ? 3 : view.profile === "BALANCED" ? 2 : 1;
    battingIntent = view.profile === "CONSERVATIVE" ? "ROTATE" : "NORMAL";
  } else if (view.inningsIndex === 3 && view.targetToWin !== null) {
    const runsNeeded = Math.max(0, view.targetToWin - view.inningsRuns);
    const reqPerOver = runsNeeded / Math.max(1, remainingOvers);
    const canShutShopForDraw =
      (view.day === 5 && view.availableBatters <= 4 && runsNeeded > 75) ||
      (view.profile !== "AGGRESSIVE" && reqPerOver > 4.6 && view.availableBatters <= 5);
    if (canShutShopForDraw) {
      aggression = 0;
      battingIntent = "PROTECT";
    } else if (runsNeeded <= 60 || (view.profile === "AGGRESSIVE" && reqPerOver <= 4.8 && view.availableBatters >= 5)) {
      aggression = reqPerOver > 3.8 ? 3 : 2;
      battingIntent = "NORMAL";
    } else {
      aggression = reqPerOver > 3.5 ? 2 : 1;
      battingIntent = "ROTATE";
    }
  } else if (view.availableBatters <= 4 && view.inningsLegalBalls < 360) {
    aggression = 0;
    battingIntent = "PROTECT";
  }

  // 5. Workload-aware bowler selection
  const validBowlers = view.bowlingCandidates.filter(b => {
    assertFinite(b.control, "control");
    assertFinite(b.movement, "movement");
    assertFinite(b.variation, "variation");
    assertFinite(b.stamina, "stamina");
    assertFinite(b.fatigueBp, "fatigueBp");
    assertFinite(b.legalBallsBowled, "legalBallsBowled");
    return b.fatigueBp <= 10000;
  });

  const fatiguePenaltyDivisor = view.profile === "CONSERVATIVE" ? 42 : view.profile === "BALANCED" ? 52 : 68;
  const effectiveBallAge = takeNewBall ? 0 : view.ballAgeLegalBalls;
  const scores = validBowlers.map(b => {
    const newBallSeamBonus = !b.isSpin && effectiveBallAge < 120 ? 40 + (view.pitchSeamBp - 5000) / 150 : 0;
    const wornSpinBonus =
      b.isSpin && effectiveBallAge >= 90 && (effectiveBallAge >= 180 || view.pitchWearPoints >= 200)
        ? 22 + (view.pitchTurnBp - 5000) / 150 + Math.min(20, view.pitchWearPoints / 25)
        : 0;
    const baseSkill = b.isSpin
      ? 1.9 * b.control + 2.0 * b.variation + 0.9 * b.movement
      : 2.0 * b.control + 2.1 * b.movement + 0.7 * b.variation;
    const heavySpellPenalty = !b.isSpin && b.fatigueBp >= 5500 ? 45 : 0;
    return {
      id: b.playerId,
      score: baseSkill + b.stamina * 0.6 + newBallSeamBonus + wornSpinBonus - b.fatigueBp / fatiguePenaltyDivisor - heavySpellPenalty,
    };
  });
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const chosen = validBowlers.find(b => b.playerId === scores[0]?.id);

  const bowlingEffort: "CONSERVE" | "NORMAL" | "MAXIMUM" =
    chosen && chosen.fatigueBp >= 5200
      ? "CONSERVE"
      : chosen && !chosen.isSpin && effectiveBallAge < 60 && chosen.fatigueBp < 2600 && view.profile === "AGGRESSIVE"
        ? "MAXIMUM"
        : "NORMAL";
  const bowlingLength: "GOOD" | "FULL" | "SHORT" =
    effectiveBallAge < 72 && chosen && !chosen.isSpin ? "FULL" : "GOOD";

  const fieldIntent: "ATTACK" | "BALANCED" | "DEFEND" =
    view.profile === "AGGRESSIVE" && (effectiveBallAge < 150 || view.wicketsLost >= 6 || view.inningsIndex === 3)
      ? "ATTACK"
      : view.profile === "CONSERVATIVE" && view.targetToWin !== null && view.targetToWin - view.inningsRuns < 90
        ? "DEFEND"
        : effectiveBallAge < 90 || view.wicketsLost >= 7
          ? "ATTACK"
          : view.profile === "CONSERVATIVE"
            ? "DEFEND"
            : "BALANCED";

  const fieldSlots = assignSlots(view.outfieldIds, selectRed5FieldSlots(fieldIntent));

  return {
    policyId: "LC_RED5_TACTICAL_CAPTAIN_V1",
    profile: view.profile,
    shouldDeclare,
    enforceFollowOn,
    takeNewBall,
    aggression,
    battingIntent,
    preferredBowlerId: chosen?.playerId ?? null,
    bowlingEffort,
    bowlingLength,
    fieldIntent,
    fieldSlots,
    reason: `Red-ball ${view.profile.toLowerCase()} posture: day ${view.day}, inn ${view.inningsIndex + 1}, lead ${view.leadRuns}, ~${remainingOvers} overs left`,
  };
}
