import React, { useEffect, useRef } from "react";
import type { SeasonPlayerStats, SquadPlayerTrainingConditionView, WorldPack } from "@lcxxvi/contracts";

type Format = "T20" | "ODI" | "RED_BALL";
const labels = { T20: "T20", ODI: "ODI", RED_BALL: "Red ball" } as const;
const skillNames: ReadonlyArray<readonly [keyof WorldPack["players"][number]["skills"]["T20"], string]> = [
  ["defence", "Defence"], ["timing", "Timing"], ["power", "Power"], ["rotation", "Strike rotation"],
  ["vsPace", "Against pace"], ["vsSpin", "Against spin"], ["control", "Bowling control"], ["movement", "Movement"],
  ["variation", "Variation"], ["stamina", "Stamina"], ["catching", "Catching"], ["groundFielding", "Ground fielding"],
  ["throwing", "Throwing"], ["keeping", "Keeping"],
];
function decimal(value: number | null): string { return value === null ? "–" : (value / 100).toFixed(2); }
export function PlayerPage({ player, condition, stats, format, onFormat, onBack, backLabel }: {
  player: WorldPack["players"][number]; condition: SquadPlayerTrainingConditionView | null; stats: SeasonPlayerStats | null;
  format: Format; onFormat: (value: Format) => void; onBack: () => void; backLabel: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [player.playerId]);
  return <section aria-labelledby="player-heading">
    <button type="button" onClick={onBack}>{backLabel}</button>
    <h2 id="player-heading" ref={heading} tabIndex={-1}>Player: {player.name}</h2>
    <p>{player.playerId} · {player.role.replaceAll("_", " ")} · {player.batHand === "L" ? "Left" : "Right"}-hand batting</p>
    <label>Player format <select aria-label="Player format" value={format} onChange={event => onFormat(event.currentTarget.value as Format)}>
      {(Object.keys(labels) as Format[]).map(key => <option key={key} value={key}>{labels[key]}</option>)}
    </select></label>
    <div className="player-detail-grid">
      <section className="career-panel" aria-labelledby="player-skills"><h3 id="player-skills">Base skills</h3>
        <p>Fictional {labels[format]} ratings, from 0 to 100.</p>
        <dl className="player-details">{skillNames.map(([key, label]) => <React.Fragment key={key}><dt>{label}</dt><dd>{player.skills[format][key]}</dd></React.Fragment>)}</dl>
      </section>
      <section className="career-panel" aria-labelledby="player-condition"><h3 id="player-condition">Current condition</h3>
        {condition ? <dl className="player-details"><dt>Availability</dt><dd>{condition.availability === "AVAILABLE" ? "Available" : "Unavailable"}{condition.availabilityReason ? `: ${condition.availabilityReason}` : ""}</dd>
          <dt>Fatigue</dt><dd>{(condition.fatigueBp / 100).toFixed(1)}%</dd><dt>Training</dt><dd>{condition.directive.replaceAll("_", " ").toLowerCase()}</dd>
          <dt>Batting readiness</dt><dd>{condition.battingReadiness}</dd><dt>Bowling readiness</dt><dd>{condition.bowlingReadiness}</dd><dt>Fielding readiness</dt><dd>{condition.fieldingReadiness}</dd></dl>
          : <p>Current condition is unavailable for this player.</p>}
        <p>Condition is from this T20 career. Readiness is temporary and separate from base skills.</p>
      </section>
      <section className="career-panel" aria-labelledby="player-performance"><h3 id="player-performance">Recorded performance</h3>
        {format !== "T20" ? <p>No {format === "ODI" ? "ODI" : "red-ball"} career statistics are available in this T20 season.</p>
          : !stats || stats.matches === 0 ? <p>No T20 career statistics are available yet.</p>
          : <><p>T20 league season. A dash means the rate has no denominator.</p><dl className="player-details">
            <dt>Matches</dt><dd>{stats.matches}</dd><dt>Runs</dt><dd>{stats.runs}</dd><dt>Batting average</dt><dd>{decimal(stats.battingAverageX100)}</dd>
            <dt>Strike rate</dt><dd>{decimal(stats.strikeRateX100)}</dd><dt>Wickets</dt><dd>{stats.bowlingWickets}</dd>
            <dt>Bowling average</dt><dd>{decimal(stats.bowlingAverageX100)}</dd><dt>Economy</dt><dd>{decimal(stats.economyX100)}</dd>
          </dl></>}
      </section>
    </div>
  </section>;
}
export type PlayerFormat = Format;
