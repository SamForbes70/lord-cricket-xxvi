/** Display helpers shared by the career screens. */

/** A rate stored as an integer times 100, shown to two decimals; null (no denominator) shows a dash. */
export function metric(value: number | null, divisor = 100): string {
  return value === null ? "–" : (value / divisor).toFixed(2);
}
