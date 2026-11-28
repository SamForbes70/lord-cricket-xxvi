import type { MomentKind } from "./match-moments.js";

/**
 * CP09 (Studio Production Directive 05): the short broadcast sting that goes with a match moment (CP04). It is a
 * graphic's sound, layered just after the ball's own cue (bat, crowd, stumps), so it starts a little late and sits
 * quieter than the cue. Everything is synthesised in the browser from sine and triangle tones: no recorded,
 * downloaded or purchased audio. The table is fixed, so the same moment always makes the same sound; nothing here
 * draws a random number.
 *
 * "full" is the Full moments setting; "brief" is the Brief setting, and also Full under reduced motion (the system
 * setting or the match's Reduced motion), which keeps one soft note instead of the flourish.
 */

export type MomentStingMode = "full" | "brief";

export interface StingTone {
  readonly type: "sine" | "triangle";
  readonly hz: number;
  /** Seconds after the sting starts. */
  readonly delaySec: number;
  readonly durationSec: number;
  /** Relative level before the effects volume (the ball cues use 0.45 to 0.8). */
  readonly level: number;
}

/** The sting starts this long after the moment appears, so the ball's own sound is heard first. */
export const MOMENT_STING_LEAD_SEC = 0.16;

const tone = (hz: number, delaySec: number, durationSec: number, level = 0.3, type: StingTone["type"] = "sine"): StingTone =>
  ({ type, hz, delaySec, durationSec, level });

/** Full stings: a short figure per moment. Rising for runs and milestones, falling for wickets. */
const FULL: Record<MomentKind, readonly StingTone[]> = {
  FOUR: [tone(587, 0, 0.09), tone(784, 0.08, 0.14)],
  SIX: [tone(523, 0, 0.08), tone(659, 0.07, 0.08), tone(1046, 0.14, 0.2)],
  WICKET: [tone(440, 0, 0.12, 0.3, "triangle"), tone(349, 0.11, 0.2, 0.3, "triangle")],
  HAT_TRICK: [tone(523, 0, 0.1, 0.3, "triangle"), tone(440, 0.1, 0.1, 0.3, "triangle"), tone(349, 0.2, 0.26, 0.32, "triangle")],
  FIFTY: [tone(523, 0, 0.12), tone(784, 0.11, 0.22)],
  HUNDRED: [tone(523, 0, 0.1), tone(659, 0.09, 0.1), tone(784, 0.18, 0.1), tone(1046, 0.27, 0.3, 0.32)],
  FIVE_WICKETS: [tone(392, 0, 0.1), tone(494, 0.09, 0.1), tone(587, 0.18, 0.1), tone(784, 0.27, 0.28, 0.32)],
  MAIDEN: [tone(660, 0, 0.12, 0.22), tone(990, 0.1, 0.18, 0.2)],
  RESULT: [tone(392, 0, 0.14), tone(523, 0.13, 0.14), tone(659, 0.26, 0.14), tone(784, 0.39, 0.4, 0.34)],
};

/** The tones of a moment's sting. Pure: the same kind and mode always give the same list. Brief is one soft note,
 * the last note of the full figure. */
export function momentStingTones(kind: MomentKind, mode: MomentStingMode): readonly StingTone[] {
  const full = FULL[kind];
  if (mode === "full") return full;
  const last = full[full.length - 1]!;
  return [tone(last.hz, 0, Math.min(0.16, last.durationSec), 0.18, last.type)];
}

/** How long a sting lasts, in milliseconds, from its first note to the end of its last (lead not included). */
export function momentStingDurationMs(kind: MomentKind, mode: MomentStingMode): number {
  return Math.round(Math.max(...momentStingTones(kind, mode).map((t) => t.delaySec + t.durationSec)) * 1000);
}

/** The sting a moment gets: none when moments are off; one soft note under Brief or reduced motion. */
export function momentStingMode(momentsPref: "full" | "brief" | "off", reducedMotion: boolean): MomentStingMode | null {
  if (momentsPref === "off") return null;
  return momentsPref === "full" && !reducedMotion ? "full" : "brief";
}
