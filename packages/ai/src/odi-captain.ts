import type { FieldSlot } from "@lcxxvi/contracts";
import type { TacticalBowlerCandidate } from "./t20-captain.js";

/** LC_ODI_TACTICAL_CAPTAIN_V1. Pure deterministic, public-observation-only choices for 50-over ODI matches.
 * Respects the 60-ball bowler quota, three ODI field-restriction phases (0..59, 60..239, 240..299),
 * striker handedness leg-side / behind-square limits, and remaining batting resources.
 */
export interface ODITacticalPublicView {
  readonly inningsLegalBalls: number;
  readonly inningsRuns: number;
  readonly wicketsLost: number;
  readonly targetToWin: number | null;
  readonly availableBatters: number;
  readonly strikerHand: "R" | "L";
  readonly outfieldIds: readonly string[];
  readonly bowlingCandidates: readonly TacticalBowlerCandidate[];
}

export type ODITacticalAdvice = Readonly<{
  policyId: "LC_ODI_TACTICAL_CAPTAIN_V1";
  aggression: 0 | 1 | 2 | 3 | 4;
  battingIntent: "NORMAL" | "ROTATE" | "PROTECT";
  preferredBowlerId: string | null;
  bowlingEffort: "CONSERVE" | "NORMAL" | "MAXIMUM";
  bowlingLength: "GOOD" | "FULL" | "YORKER";
  fieldIntent: "ATTACK" | "BALANCED" | "DEFEND";
  fieldSlots: readonly FieldSlot[];
  reason: string;
}>;

function assertFiniteNonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`LC_ODI_AI_INVALID_${name}`);
}

function assignSlots(outfieldIds: readonly string[], slotIds: readonly string[]): FieldSlot[] {
  if (outfieldIds.length !== 9 || new Set(outfieldIds).size !== 9) {
    throw new Error("LC_ODI_AI_INVALID_OUTFIELD");
  }
  const sorted = [...outfieldIds].sort();
  return sorted.map((playerId, index) => ({ slotId: slotIds[index]!, playerId }));
}

function selectODIFieldSlots(
  legalBalls: number,
  intent: "ATTACK" | "BALANCED" | "DEFEND",
): readonly string[] {
  // Every preset keeps 4 or 5 off-side slots, 4 or 5 leg-side slots, and <= 2 behind-square on both sides,
  // remaining legal for both RHB and LHB even when strike rotates mid-over.
  if (legalBalls < 60) {
    if (intent === "ATTACK") {
      return ["slip-1", "slip-2", "point", "cover", "mid-off", "mid-on", "midwicket", "deep-square-leg", "fine-leg"];
    }
    return ["slip-1", "slip-2", "point", "cover", "mid-off", "mid-on", "midwicket", "deep-square-leg", "long-on"];
  }
  if (legalBalls < 240) {
    if (intent === "ATTACK") {
      return ["slip-1", "point", "cover", "mid-off", "deep-cover", "mid-on", "midwicket", "deep-square-leg", "fine-leg"];
    }
    if (intent === "DEFEND") {
      return ["point", "cover", "mid-off", "deep-cover", "long-off", "mid-on", "midwicket", "deep-square-leg", "long-on"];
    }
    return ["point", "cover", "mid-off", "deep-cover", "mid-on", "midwicket", "deep-square-leg", "fine-leg", "long-on"];
  }
  if (intent === "ATTACK") {
    return ["slip-1", "point", "cover", "deep-cover", "long-off", "mid-on", "midwicket", "deep-square-leg", "long-on"];
  }
  return ["point", "cover", "deep-cover", "long-off", "mid-on", "midwicket", "deep-square-leg", "fine-leg", "long-on"];
}

export function adviseODICaptain(view: Readonly<ODITacticalPublicView>): ODITacticalAdvice {
  for (const [name, value] of Object.entries({
    inningsLegalBalls: view.inningsLegalBalls,
    inningsRuns: view.inningsRuns,
    wicketsLost: view.wicketsLost,
    availableBatters: view.availableBatters,
  })) {
    assertFiniteNonnegative(value, name);
  }
  if (view.inningsLegalBalls > 300 || view.wicketsLost > 10) {
    throw new Error("LC_ODI_AI_INVALID_INNINGS");
  }

  const remaining = Math.max(1, 300 - view.inningsLegalBalls);
  const requiredRate =
    view.targetToWin === null ? null : (Math.max(0, view.targetToWin - view.inningsRuns) * 6) / remaining;
  const phase = view.inningsLegalBalls < 60 ? "POWERPLAY_1" : view.inningsLegalBalls < 240 ? "MIDDLE" : "LATE";

  let aggression: 0 | 1 | 2 | 3 | 4 = phase === "POWERPLAY_1" ? 2 : phase === "MIDDLE" ? 2 : 3;
  let battingIntent: "NORMAL" | "ROTATE" | "PROTECT" = phase === "MIDDLE" ? "ROTATE" : "NORMAL";

  if (requiredRate !== null) {
    aggression = requiredRate > 10.5 ? 4 : requiredRate > 7.5 ? 3 : requiredRate < 4.2 ? 1 : 2;
    battingIntent = requiredRate > 8 ? "NORMAL" : requiredRate < 4.5 ? "ROTATE" : battingIntent;
  } else if (phase === "LATE" && view.availableBatters >= 5) {
    aggression = 4;
    battingIntent = "NORMAL";
  }

  // Preserve batting resources after top/middle-order collapse when overs remain.
  if (view.availableBatters <= 5 && remaining > 90 && (requiredRate === null || requiredRate <= 7.5)) {
    aggression = Math.min(aggression, 1) as 0 | 1;
    battingIntent = view.availableBatters <= 3 ? "PROTECT" : "ROTATE";
  }

  const valid = view.bowlingCandidates.filter(p => {
    for (const [name, value] of Object.entries(p)) {
      if (name !== "playerId") assertFiniteNonnegative(value as number, name);
    }
    return p.quotaRemaining > 0 && p.fatigueBp <= 10000;
  });

  // Save scarce death-over quota (<= 18 balls left) during middle overs when higher-quota bowlers exist.
  const hasAmpleAlternative = valid.some(p => p.quotaRemaining >= 24 && p.fatigueBp < 5500);
  const scores = valid.map(p => {
    const quotaReservePenalty =
      phase === "MIDDLE" && hasAmpleAlternative
        ? p.quotaRemaining <= 12
          ? 95
          : p.quotaRemaining <= 18
            ? 70
            : 0
        : 0;
    const phaseSkill =
      phase === "POWERPLAY_1"
        ? 2.2 * p.movement + 1.8 * p.control + 0.8 * p.variation
        : phase === "MIDDLE"
          ? 2.0 * p.control + 1.8 * p.variation + 1.0 * p.movement
          : 2.2 * p.control + 1.8 * p.variation + 1.4 * p.movement;
    return {
      id: p.playerId,
      score: phaseSkill + p.stamina / 2 - p.fatigueBp / 85 - quotaReservePenalty,
    };
  });
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const chosen = valid.find(p => p.playerId === scores[0]?.id);

  const bowlingEffort =
    chosen && chosen.fatigueBp >= 6500
      ? "CONSERVE"
      : phase === "LATE" && chosen && chosen.fatigueBp < 3800
        ? "MAXIMUM"
        : "NORMAL";
  const bowlingLength = phase === "LATE" ? "YORKER" : phase === "POWERPLAY_1" ? "FULL" : "GOOD";
  const fieldIntent: "ATTACK" | "BALANCED" | "DEFEND" =
    view.wicketsLost >= 7 || (phase === "POWERPLAY_1" && view.wicketsLost >= 2)
      ? "ATTACK"
      : phase === "LATE" || (requiredRate !== null && requiredRate > 7.5)
        ? "DEFEND"
        : "BALANCED";

  const fieldSlots = assignSlots(
    view.outfieldIds,
    selectODIFieldSlots(view.inningsLegalBalls, fieldIntent),
  );

  return {
    policyId: "LC_ODI_TACTICAL_CAPTAIN_V1",
    aggression,
    battingIntent,
    preferredBowlerId: chosen?.playerId ?? null,
    bowlingEffort,
    bowlingLength,
    fieldIntent,
    fieldSlots,
    reason: `Public ODI context: ${phase.toLowerCase()}, ${view.wicketsLost} wickets, ${remaining} balls left${requiredRate === null ? "" : `, req ${requiredRate.toFixed(2)}`}`,
  };
}
