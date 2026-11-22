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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * A game date ("2027-03-01") in words: "Mon 1 March 2027". Computed from the calendar date alone, so it reads the same
 * in every time zone and locale. Anything that is not a valid ISO date is returned unchanged.
 */
export function formatGameDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return iso;
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}
