import type { View } from "./protocol.js";

type Cell = string | number | null | undefined;
export type ScorecardRow = readonly [string, string, string, string, string, string, string];

export function scorecardRows(view: View): ScorecardRow[] {
  if (!view.scorecard) return [];
  const name = (id: string) => view.names[id] ?? view.teams.find(team => team.id === id)?.name ?? id;
  const rules = view.format === "T20" ? "LC_T20_01" : view.format === "ODI" ? "LC_ODI_01" : "LC_RED5_01";
  const rows: ScorecardRow[] = [
    ["Match", "Format", view.format, "Rules", rules, "Model", "synthetic-alpha-01 (SYNTHETIC_ALPHA)"],
    ["Match", "Ground", view.ground, "Result", view.resultText ?? "Unavailable", "Match ID", view.scorecard.matchId],
  ];
  view.scorecard.innings.forEach((innings, index) => {
    const label = `Innings ${index + 1}`;
    rows.push([label, "Total", name(innings.battingTeamId), `${innings.runs}/${innings.wickets}`, "Overs", innings.overs, ""]);
    rows.push([label, "Batting", "Player", "Runs", "Balls", "Fours", "Sixes"]);
    for (const [id, batter] of Object.entries(innings.batting)) rows.push([label, batter.dismissed ? "Out" : "Not out / did not bat", name(id), String(batter.runs), String(batter.ballsFaced), String(batter.fours), String(batter.sixes)]);
    rows.push([label, "Bowling", "Player", "Overs", "Runs", "Wickets", "Maidens"]);
    for (const [id, bowler] of Object.entries(innings.bowling)) {
      if (bowler.legalBalls || bowler.runsConceded || bowler.wickets || bowler.maidens) rows.push([label, "Bowler", name(id), `${Math.floor(bowler.legalBalls / 6)}.${bowler.legalBalls % 6}`, String(bowler.runsConceded), String(bowler.wickets), String(bowler.maidens)]);
    }
    if ("extras" in innings) {
      const x = innings.extras;
      rows.push([label, "Extras", "Wides", String(x.wides), "No-balls", String(x.noBalls), ""]);
      rows.push([label, "Extras", "Byes", String(x.byes), "Leg-byes", String(x.legByes), `Penalties: ${x.penalties}`]);
    } else rows.push([label, "Extras", "Breakdown unavailable in this scorecard", "", "", "", ""]);
  });
  return rows;
}

export function csvCell(value: Cell): string {
  let text = value == null ? "" : String(value);
  let prefix = 0;
  while (prefix < text.length && (text.charCodeAt(prefix) <= 32 || /\s/u.test(text[prefix]!))) prefix++;
  if (prefix > 0 && /[\t\r\n]/u.test(text.slice(0, prefix)) || "=+-@".includes(text[prefix] ?? "\0")) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function scorecardCsv(rows: readonly ScorecardRow[]): string {
  return `\ufeff${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
