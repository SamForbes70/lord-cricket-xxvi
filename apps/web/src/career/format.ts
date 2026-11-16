import type { AcademyTrainingFocus, TrainingDirective } from "@lcxxvi/contracts";

/** Display helpers shared by the career screens. */

/** A rate stored as an integer times 100, shown to two decimals; null (no denominator) shows a dash. */
export function metric(value: number | null, divisor = 100): string {
  return value === null ? "–" : (value / divisor).toFixed(2);
}

/** A basis-point value shown as a percentage to one decimal. */
export function percentageBp(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

export const directives: TrainingDirective[] = [
  "REST",
  "BATTING_PRACTICE",
  "BOWLING_PRACTICE",
  "FIELDING_PRACTICE",
];

export const academyFocusOptions: AcademyTrainingFocus[] = [
  "BALANCED",
  "BATTING_PRACTICE",
  "BOWLING_PRACTICE",
  "FIELDING_PRACTICE",
];
