/**
 * CP02B (CD-031): words for stored values. Screens show these labels instead of internal enum spellings ("NORMAL",
 * "BATTING_PRACTICE", "ACTIVE") or record ids. Display only: the stored values, option values and test hooks are
 * unchanged, so nothing saved or sent to the match worker depends on this file.
 */
import { ROLE_LABEL } from "./world/player-visuals.js";

/** The text shown where a value does not exist (no innings, no economy yet). Never a dash (CD-030, CD-048). */
export const NO_VALUE_TEXT = "none";

const SPECIAL: Record<string, string> = {
  ALLROUNDER: "All-rounder",
  OFF: "Off stump",
  STUMPS: "Stumps",
  LEG: "Leg stump",
  CONSERVE: "Conserve",
  NORMAL: "Normal",
  MAXIMUM: "Maximum",
  BALANCED: "Balanced",
  REST: "Rest",
};

/**
 * A stored upper-case value in sentence case: "BATTING_PRACTICE" becomes "Batting practice". Values that are already
 * words ("Positive") are returned unchanged.
 */
export function enumLabel(value: string): string {
  if (SPECIAL[value]) return SPECIAL[value]!;
  if (!/^[A-Z0-9_]+$/.test(value)) return value;
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A player role in words ("All-rounder", "Keeper"). */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? enumLabel(role);
}

/** A squad member's availability: "Available" or "Unavailable". */
export function availabilityLabel(availability: string): string {
  return enumLabel(availability);
}

/** A career save's phase in the saved-career list. */
export function careerPhaseLabel(phase: string): string {
  return phase === "ACTIVE" ? "In progress" : phase === "COMPLETE" ? "Season complete" : enumLabel(phase);
}

/** A saved match's phase in the saved-games list ("AWAITING_BATTER" becomes "Awaiting batter"). */
export function matchPhaseLabel(phase: string): string {
  return phase === "COMPLETE" ? "Finished" : enumLabel(phase);
}

/**
 * CP02B (CD-044): the award provenance line on screen. The stored `provenanceNotice` (contracts) keeps its recorded
 * wording; screens show this neutral sentence, which names no real governing body.
 */
export const AWARD_NOTICE_TEXT =
  "Game award: the game's own transparent points rule for matches and seasons, not a formula used by any real governing body or broadcaster.";
