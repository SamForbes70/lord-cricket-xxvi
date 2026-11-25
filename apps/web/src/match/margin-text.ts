/** "by 1 run", "by 2 runs", "by 1 wicket", "by 4 wickets": the margin of a win, with the right number. */
export function marginText(r: { marginType?: string | null; marginRuns?: number | null; marginWickets?: number | null }): string {
  const n = r.marginRuns ?? r.marginWickets ?? 0;
  const unit = r.marginType === "WICKETS" ? "wicket" : "run";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
