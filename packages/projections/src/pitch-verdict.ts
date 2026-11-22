import type { PitchTendency } from "@lcxxvi/contracts";
import { classifyPitchTendency } from "./tactical-briefing.js";

/**
 * A plain-words pitch verdict for the pitch inspection (E5). Pure and unsaved: it reads the ground's seam and spin
 * assistance (basis points, 5000 is neutral) through the same thresholds as the tactical briefing, and says only what
 * the model uses those values for: how much the ball moves for pace and spin bowlers.
 */
export type PitchVerdict = { tendency: PitchTendency; headline: string; detail: string };

const VERDICT: Record<PitchTendency, Omit<PitchVerdict, "tendency">> = {
  LIVE_BOTH: { headline: "A bowler's pitch", detail: "Both pace and spin bowlers get more help than usual." },
  SEAM_FRIENDLY: { headline: "A seamer's pitch", detail: "Pace bowlers get extra movement; spin starts close to normal." },
  SPIN_FRIENDLY: { headline: "A spinner's pitch", detail: "Spinners get turn, and more as the pitch wears." },
  FLAT: { headline: "A batting pitch", detail: "Little help for pace or spin bowlers." },
  BALANCED: { headline: "An even pitch", detail: "No strong help for pace or spin bowlers." },
};

export function pitchVerdict(seamBp: number, turnBp: number): PitchVerdict {
  const tendency = classifyPitchTendency(seamBp, turnBp);
  return { tendency, ...VERDICT[tendency] };
}
