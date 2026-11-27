/**
 * CP04 (CD-017): how a batter was out, in the form a cricket scorecard prints it, from the innings ledger's recorded
 * dismissal (kind, credited bowler and fielder). Pure; nothing is inferred beyond what the ledger records.
 *
 *   c Fielder b Bowler, c & b Bowler, c †Keeper b Bowler, b Bowler, lbw b Bowler, st †Keeper b Bowler,
 *   run out (Fielder), hit wicket b Bowler, not out, did not bat.
 *
 * The dagger marks the wicketkeeper, as printed scorecards do.
 */
export interface RecordedDismissal {
  kind: "BOWLED" | "LBW" | "CAUGHT" | "RUN_OUT" | "STUMPED" | "HIT_WICKET";
  creditedBowlerId: string | null;
  fielderId: string | null;
}

export function dismissalText(d: RecordedDismissal, names: Readonly<Record<string, string>>, keeperId?: string | null): string {
  const who = (id: string | null) => (id ? (names[id] ?? id) : "");
  const fielder = (id: string | null) => (id && keeperId && id === keeperId ? `†${who(id)}` : who(id));
  const bowler = d.creditedBowlerId ? `b ${who(d.creditedBowlerId)}` : "";
  switch (d.kind) {
    case "BOWLED":
      return bowler || "bowled";
    case "LBW":
      return `lbw ${bowler}`.trim();
    case "CAUGHT":
      if (d.fielderId && d.fielderId === d.creditedBowlerId) return `c & b ${who(d.creditedBowlerId)}`;
      return d.fielderId ? `c ${fielder(d.fielderId)} ${bowler}`.trim() : `caught ${bowler}`.trim();
    case "STUMPED":
      return d.fielderId ? `st ${fielder(d.fielderId)} ${bowler}`.trim() : `stumped ${bowler}`.trim();
    case "RUN_OUT":
      return d.fielderId ? `run out (${who(d.fielderId)})` : "run out";
    case "HIT_WICKET":
      return `hit wicket ${bowler}`.trim();
  }
}

/** A scorecard row's status: the dismissal, "not out" for the two at the crease, or "did not bat". */
export function batterStatusText(
  playerId: string,
  ledger: {
    batting: Readonly<Record<string, { dismissed: boolean; ballsFaced: number }>>;
    dismissals: Readonly<Record<string, RecordedDismissal>>;
    keeperId: string;
    innings: { northBatterId: string | null; southBatterId: string | null };
  },
  names: Readonly<Record<string, string>>,
): string {
  const recorded = ledger.dismissals[playerId];
  if (recorded) return dismissalText(recorded, names, ledger.keeperId);
  if (ledger.batting[playerId]?.dismissed) return "out";
  if (playerId === ledger.innings.northBatterId || playerId === ledger.innings.southBatterId || (ledger.batting[playerId]?.ballsFaced ?? 0) > 0) return "not out";
  return "did not bat";
}
