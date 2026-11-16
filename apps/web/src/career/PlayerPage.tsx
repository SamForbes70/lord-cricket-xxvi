import React, { useEffect, useRef } from "react";
import type {
  HistoricalPlayerRecord,
  PersistentCareerPlayerStats,
  PlayerContract,
  PlayerLifecycleSkillLedgerEntry,
  RetiredPlayerRecord,
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
  age = null,
  retiredRecord = null,
  skillLedgerEntry = null,
  lastTeamName = null,
  activeContract = null,
  contractTeamName = null,
  isFreeAgent = false,
  careerClubNames = [],
  historicalRecord = null,
  teamName = (id) => id,
  groundName = (id) => id,
  onOpenReplay,
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
  age?: number | null;
  retiredRecord?: RetiredPlayerRecord | null;
  skillLedgerEntry?: PlayerLifecycleSkillLedgerEntry | null;
  lastTeamName?: string | null;
  activeContract?: PlayerContract | null;
  contractTeamName?: string | null;
  isFreeAgent?: boolean;
  careerClubNames?: readonly string[];
  historicalRecord?: HistoricalPlayerRecord | null;
  teamName?: (teamId: string) => string;
  groundName?: (groundId: string) => string;
  onOpenReplay?: (fixtureId: string, triggerId: string) => void;
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
      <p data-testid="player-bio-line">
        {player.playerId} · {player.role.replaceAll("_", " ")} ·{" "}
        {player.batHand === "L" ? "Left" : "Right"}-hand batting
        {age !== null ? ` · Age ${age}` : ""}
        {skillLedgerEntry ? ` · Debut Season ${skillLedgerEntry.debutSeasonNumber}` : ""}
      </p>
      {retiredRecord && (
        <div
          className="career-panel retired-banner"
          role="status"
          data-testid="retired-player-banner"
          style={{ marginBottom: "14px" }}
        >
          <strong>Retired alumni record</strong>
          <p>
            Retired at age {retiredRecord.ageAtRetirement} after Season{" "}
            {retiredRecord.retiredAfterSeasonNumber} ({retiredRecord.retiredCalendarYear})
            {lastTeamName ? ` · Final club: ${lastTeamName}` : ""} · Reason:{" "}
            {retiredRecord.retirementReason.replaceAll("_", " ").toLowerCase()}.
          </p>
        </div>
      )}
      {(activeContract || isFreeAgent) && !retiredRecord && (
        <div
          className="career-panel"
          data-testid="player-contract-summary"
          style={{ marginBottom: "14px" }}
        >
          <strong>Domestic contract status</strong>
          {activeContract ? (
            <p>
              Contracted to <strong>{contractTeamName ?? activeContract.teamId}</strong> · $
              {activeContract.annualWageK}k/yr · Expires after Season{" "}
              {activeContract.expiresAfterSeasonNumber} · Origin:{" "}
              {activeContract.origin.replaceAll("_", " ").toLowerCase()}
              {careerClubNames.length > 0 ? ` · Clubs: ${careerClubNames.join(" → ")}` : ""}
            </p>
          ) : (
            <p>Uncontracted free agent — eligible for domestic contract offers.</p>
          )}
        </div>
      )}
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
        <section className="career-panel" aria-labelledby="player-skills" data-testid="player-skill-ledger">
          <h3 id="player-skills">Base skills</h3>
          <p>
            Fictional {labels[format]} ratings, from 0 to 100.
            {skillLedgerEntry && format === "T20"
              ? " Permanent off-season progression uses fictional lifecycle parameters (separate from temporary readiness)."
              : ""}
          </p>
          <dl className="player-details">
            {skillNames.map(([key, label]) => {
              const currentRating = player.skills[format][key];
              const careerDelta =
                format === "T20" && skillLedgerEntry
                  ? currentRating - skillLedgerEntry.careerEntryT20Skills[key]
                  : 0;
              const seasonDelta =
                format === "T20" && skillLedgerEntry
                  ? currentRating - skillLedgerEntry.priorSeasonT20Skills[key]
                  : 0;
              return (
                <React.Fragment key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {currentRating}
                    {seasonDelta !== 0 && (
                      <small style={{ marginLeft: "6px" }}>
                        ({seasonDelta > 0 ? `+${seasonDelta}` : seasonDelta} last off-season)
                      </small>
                    )}
                    {seasonDelta === 0 && careerDelta !== 0 && (
                      <small style={{ marginLeft: "6px" }}>
                        ({careerDelta > 0 ? `+${careerDelta}` : careerDelta} career)
                      </small>
                    )}
                  </dd>
                </React.Fragment>
              );
            })}
          </dl>
        </section>
        <section className="career-panel" aria-labelledby="player-condition">
          <h3 id="player-condition">Current condition</h3>
          {retiredRecord ? (
            <p>Player is retired from active squad duty. Historical skills and career records remain preserved.</p>
          ) : condition ? (
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
      {format === "T20" && historicalRecord && historicalRecord.matches > 0 && (
        <section
          className="career-panel"
          aria-labelledby="player-historical-records-heading"
          data-testid="player-historical-records"
          style={{ marginTop: "16px" }}
        >
          <h3 id="player-historical-records-heading">
            Historical batting, bowling, fielding &amp; contributing matches
          </h3>
          <p>
            Career T20 records (<code>{historicalRecord.playerId}</code>) ·{" "}
            {historicalRecord.status === "RETIRED"
              ? "Retired alumni record preserved"
              : "Active career record"}{" "}
            · Fielding archive matches: {historicalRecord.fieldingMatchesArchived}/
            {historicalRecord.matches}.
          </p>
          <dl className="player-details" style={{ marginBottom: "14px" }}>
            <dt>High score</dt>
            <dd>
              {historicalRecord.battingInnings > 0
                ? `${historicalRecord.highScoreRuns}${historicalRecord.highScoreNotOut ? "*" : ""}`
                : "–"}
            </dd>
            <dt>50s / 100s / Ducks</dt>
            <dd>
              {historicalRecord.fifties} / {historicalRecord.hundreds} / {historicalRecord.ducks}
            </dd>
            <dt>4s / 6s / Boundary %</dt>
            <dd>
              {historicalRecord.fours} / {historicalRecord.sixes} (
              {decimal(historicalRecord.boundaryRunsPercentX100)}%)
            </dd>
            <dt>Best bowling</dt>
            <dd>
              {historicalRecord.bestBowlingRuns !== null
                ? `${historicalRecord.bestBowlingWickets}/${historicalRecord.bestBowlingRuns}`
                : "–"}
            </dd>
            <dt>3W / 4W / 5W hauls</dt>
            <dd>
              {historicalRecord.threeWicketHauls} / {historicalRecord.fourWicketHauls} /{" "}
              {historicalRecord.fiveWicketHauls}
            </dd>
            <dt>Catches / Stumpings / Run outs</dt>
            <dd>
              {historicalRecord.catches} / {historicalRecord.stumpings} / {historicalRecord.runOuts}{" "}
              (Total {historicalRecord.totalFieldingDismissals})
            </dd>
          </dl>
          {historicalRecord.contributingMatches.length > 0 && (
            <div>
              <h4>Contributing matches ({historicalRecord.contributingMatches.length})</h4>
              <div className="table-wrap">
                <table data-testid="player-contributing-matches-table">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Round</th>
                      <th>Match</th>
                      <th>Venue</th>
                      <th>Batting</th>
                      <th>Bowling</th>
                      <th>Fielding</th>
                      <th>Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalRecord.contributingMatches.map((entry) => {
                      const btnId = `player-replay-${player.playerId}-${entry.fixtureId}`;
                      const legalBalls = entry.bowledLegalBalls ?? 0;
                      const catches = entry.catches ?? 0;
                      const stumpings = entry.stumpings ?? 0;
                      const runOuts = entry.runOuts ?? 0;
                      return (
                        <tr key={`${entry.seasonNumber}-${entry.fixtureId}`}>
                          <td>
                            S{entry.seasonNumber} ({entry.calendarYear})
                          </td>
                          <td>R{entry.roundNumber}</td>
                          <td>
                            {teamName(entry.teamId)} v {teamName(entry.opponentTeamId)}
                            {entry.battingPosition ? (
                              <small> · Bat #{entry.battingPosition}</small>
                            ) : null}
                          </td>
                          <td>{entry.groundId ? groundName(entry.groundId) : "–"}</td>
                          <td>
                            {entry.battedInnings !== null
                              ? `${entry.runsScored ?? 0}${entry.notOut ? "*" : ""} (${entry.ballsFaced ?? 0})`
                              : "–"}
                          </td>
                          <td>
                            {legalBalls > 0
                              ? `${entry.bowlingWickets ?? 0}/${entry.bowlingRunsConceded ?? 0} (${Math.floor(legalBalls / 6)}.${legalBalls % 6})`
                              : "–"}
                          </td>
                          <td>
                            {entry.archiveEvaluated
                              ? catches + stumpings + runOuts > 0
                                ? `${catches}c ${stumpings}st ${runOuts}ro`
                                : "0"
                              : "–"}
                          </td>
                          <td>
                            {onOpenReplay && entry.archiveReplayAvailable ? (
                              <button
                                id={btnId}
                                type="button"
                                className="replay-btn"
                                onClick={() => onOpenReplay(entry.fixtureId, btnId)}
                              >
                                View replay
                              </button>
                            ) : (
                              "–"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
export type PlayerFormat = Format;
