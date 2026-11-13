import React, { useEffect, useRef } from "react";
import type {
  PersistentCareerPlayerStats,
  SeasonPlayerStats,
  SquadPlayerTrainingConditionView,
  WorldPack,
} from "@lcxxvi/contracts";

type Format = "T20" | "ODI" | "RED_BALL";
const labels = { T20: "T20", ODI: "ODI", RED_BALL: "Red ball" } as const;
const skillNames: ReadonlyArray<
  readonly [keyof WorldPack["players"][number]["skills"]["T20"], string]
> = [
  ["defence", "Defence"],
  ["timing", "Timing"],
  ["power", "Power"],
  ["rotation", "Strike rotation"],
  ["vsPace", "Against pace"],
  ["vsSpin", "Against spin"],
  ["control", "Bowling control"],
  ["movement", "Movement"],
  ["variation", "Variation"],
  ["stamina", "Stamina"],
  ["catching", "Catching"],
  ["groundFielding", "Ground fielding"],
  ["throwing", "Throwing"],
  ["keeping", "Keeping"],
];

function decimal(value: number | null): string {
  return value === null ? "–" : (value / 100).toFixed(2);
}

export type PlayerSeasonBreakdownRow = {
  seasonNumber: number;
  calendarYear: number;
  phase: "ACTIVE" | "COMPLETE";
  stats: SeasonPlayerStats;
};

export function PlayerPage({
  player,
  condition,
  stats,
  careerStats = null,
  seasonBreakdown = [],
  format,
  onFormat,
  onBack,
  backLabel,
}: {
  player: WorldPack["players"][number];
  condition: SquadPlayerTrainingConditionView | null;
  stats: SeasonPlayerStats | null;
  careerStats?: PersistentCareerPlayerStats | null;
  seasonBreakdown?: readonly PlayerSeasonBreakdownRow[];
  format: Format;
  onFormat: (value: Format) => void;
  onBack: () => void;
  backLabel: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [player.playerId]);

  return (
    <section aria-labelledby="player-heading">
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      <h2 id="player-heading" ref={heading} tabIndex={-1}>
        Player: {player.name}
      </h2>
      <p>
        {player.playerId} · {player.role.replaceAll("_", " ")} ·{" "}
        {player.batHand === "L" ? "Left" : "Right"}-hand batting
      </p>
      <label>
        Player format{" "}
        <select
          aria-label="Player format"
          value={format}
          onChange={(event) => onFormat(event.currentTarget.value as Format)}
        >
          {(Object.keys(labels) as Format[]).map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
      </label>
      <div className="player-detail-grid">
        <section className="career-panel" aria-labelledby="player-skills">
          <h3 id="player-skills">Base skills</h3>
          <p>Fictional {labels[format]} ratings, from 0 to 100.</p>
          <dl className="player-details">
            {skillNames.map(([key, label]) => (
              <React.Fragment key={key}>
                <dt>{label}</dt>
                <dd>{player.skills[format][key]}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
        <section className="career-panel" aria-labelledby="player-condition">
          <h3 id="player-condition">Current condition</h3>
          {condition ? (
            <dl className="player-details">
              <dt>Availability</dt>
              <dd>
                {condition.availability === "AVAILABLE" ? "Available" : "Unavailable"}
                {condition.availabilityReason ? `: ${condition.availabilityReason}` : ""}
              </dd>
              <dt>Fatigue</dt>
              <dd>{(condition.fatigueBp / 100).toFixed(1)}%</dd>
              <dt>Training</dt>
              <dd>{condition.directive.replaceAll("_", " ").toLowerCase()}</dd>
              <dt>Batting readiness</dt>
              <dd>{condition.battingReadiness}</dd>
              <dt>Bowling readiness</dt>
              <dd>{condition.bowlingReadiness}</dd>
              <dt>Fielding readiness</dt>
              <dd>{condition.fieldingReadiness}</dd>
            </dl>
          ) : (
            <p>Current condition is unavailable for this player.</p>
          )}
          <p>Condition is from this T20 career. Readiness is temporary and separate from base skills.</p>
        </section>
        <section className="career-panel" aria-labelledby="player-performance">
          <h3 id="player-performance">Recorded performance</h3>
          {format !== "T20" ? (
            <p>
              No {format === "ODI" ? "ODI" : "red-ball"} career statistics are available in this
              T20 career.
            </p>
          ) : !stats || stats.matches === 0 ? (
            <p>No T20 career statistics are available yet.</p>
          ) : (
            <>
              <p>Active T20 league season. A dash means the rate has no denominator.</p>
              <dl className="player-details">
                <dt>Matches</dt>
                <dd>{stats.matches}</dd>
                <dt>Runs</dt>
                <dd>{stats.runs}</dd>
                <dt>Batting average</dt>
                <dd>{decimal(stats.battingAverageX100)}</dd>
                <dt>Strike rate</dt>
                <dd>{decimal(stats.strikeRateX100)}</dd>
                <dt>Wickets</dt>
                <dd>{stats.bowlingWickets}</dd>
                <dt>Bowling average</dt>
                <dd>{decimal(stats.bowlingAverageX100)}</dd>
                <dt>Economy</dt>
                <dd>{decimal(stats.economyX100)}</dd>
              </dl>
            </>
          )}
        </section>
      </div>
      {format === "T20" && careerStats && (careerStats.matches > 0 || seasonBreakdown.length > 1) && (
        <section
          className="career-panel"
          aria-labelledby="player-career-history"
          data-testid="player-career-history"
          style={{ marginTop: "16px" }}
        >
          <h3 id="player-career-history">Career history across seasons</h3>
          <dl className="player-details" style={{ maxWidth: "460px", marginBottom: "14px" }}>
            <dt>Seasons played</dt>
            <dd>{careerStats.seasonsPlayed}</dd>
            <dt>Career matches</dt>
            <dd>{careerStats.matches}</dd>
            <dt>Career runs</dt>
            <dd>{careerStats.runs}</dd>
            <dt>Career batting average</dt>
            <dd>{decimal(careerStats.battingAverageX100)}</dd>
            <dt>Career strike rate</dt>
            <dd>{decimal(careerStats.strikeRateX100)}</dd>
            <dt>Career wickets</dt>
            <dd>{careerStats.bowlingWickets}</dd>
            <dt>Career bowling average</dt>
            <dd>{decimal(careerStats.bowlingAverageX100)}</dd>
            <dt>Career economy</dt>
            <dd>{decimal(careerStats.economyX100)}</dd>
          </dl>
          {seasonBreakdown.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Status</th>
                    <th>M</th>
                    <th>Runs</th>
                    <th>Avg</th>
                    <th>SR</th>
                    <th>Wkts</th>
                    <th>Bowl Avg</th>
                    <th>Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonBreakdown.map((row) => (
                    <tr key={row.seasonNumber}>
                      <td>
                        Season {row.seasonNumber} · {row.calendarYear}
                      </td>
                      <td>{row.phase === "COMPLETE" ? "Completed" : "Active"}</td>
                      <td>{row.stats.matches}</td>
                      <td>{row.stats.runs}</td>
                      <td>{decimal(row.stats.battingAverageX100)}</td>
                      <td>{decimal(row.stats.strikeRateX100)}</td>
                      <td>{row.stats.bowlingWickets}</td>
                      <td>{decimal(row.stats.bowlingAverageX100)}</td>
                      <td>{decimal(row.stats.economyX100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
export type PlayerFormat = Format;
