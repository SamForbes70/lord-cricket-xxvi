import { AboutDetails } from "../AboutDetails.js";
import { TeamCrest } from "../world/TeamCrest.js";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { StatsScope } from "./CareerApp.js";
import { metric } from "./format.js";
import type {
  HistoricalBattingPositionBand,
  HistoricalLeaderboardMetric,
  HistoricalPlayerStatusFilter,
} from "@lcxxvi/contracts";
import {
  HistoricalLeaderboardMetricSchema,
} from "@lcxxvi/contracts";
import {
  CareerApplicationService,
} from "./service.js";
import { NoValue } from "../NoValue.js";
import "../data-table.css";
import { AWARD_NOTICE_TEXT } from "../display-labels.js";


/** The career Statistics screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
export function StatisticsScreen(props: StatisticsScreenProps) {
  const {
    service,
    state,
    persistentWorld,
    persistentWorldRef,
    busy,
    controlledTeam,
    statsScope,
    setStatsScope,
    historicalOpponent,
    setHistoricalOpponent,
    historicalVenue,
    setHistoricalVenue,
    historicalBattingPosition,
    setHistoricalBattingPosition,
    historicalPlayerStatus,
    setHistoricalPlayerStatus,
    historicalLeaderboardMetric,
    setHistoricalLeaderboardMetric,
    historicalProjection,
    historicalSeasonScope,
    awardsSeasonFilter,
    setAwardsSeasonFilter,
    openPlayer,
    openReplay,
    replayViewerSection,
  } = props;
  return (
        <section aria-labelledby="statistics-heading">
          <h2 id="statistics-heading">Statistics</h2>
          {replayViewerSection}
          {persistentWorld && (
            <div
              className="action-row scope-bar"
              role="group"
              aria-label="Statistics scope"
              data-testid="statistics-scope-bar"
            >
              <button
                type="button"
                aria-pressed={statsScope === "ACTIVE"}
                onClick={() => setStatsScope("ACTIVE")}
              >
                Active Season {persistentWorld.currentSeasonNumber} ({
                  persistentWorld.currentCalendarYear
                })
              </button>
              <button
                type="button"
                aria-pressed={statsScope === "ALL_TIME"}
                onClick={() => setStatsScope("ALL_TIME")}
              >
                All-time career ({persistentWorld.careerProjection.totalMatchesApplied} matches)
              </button>
              {persistentWorld.completedSeasons.map((record) => (
                <button
                  key={record.seasonId}
                  type="button"
                  aria-pressed={statsScope === record.seasonNumber}
                  onClick={() => setStatsScope(record.seasonNumber)}
                >
                  Season {record.seasonNumber} ({record.calendarYear})
                </button>
              ))}
            </div>
          )}

          {persistentWorld && statsScope === "ALL_TIME" ? (
            <div data-testid="all-time-career-statistics">
              <h3>All-time club honours &amp; records</h3>
              <div className="table-wrap">
                <table className="data-table lead-1">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Closed seasons</th>
                      <th>Titles</th>
                      <th>Runner-up</th>
                      <th>P</th>
                      <th>W</th>
                      <th>L</th>
                      <th>T</th>
                      <th>NR</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...persistentWorld.careerProjection.teamHistory]
                      .sort(
                        (a, b) =>
                          b.titles - a.titles ||
                          b.points - a.points ||
                          b.wins - a.wins ||
                          a.teamId.localeCompare(b.teamId),
                      )
                      .map((row) => (
                        <tr
                          key={row.teamId}
                          className={row.teamId === controlledTeam ? "managed-fixture" : ""}
                        >
                          <td>{service.teamName(row.teamId)}</td>
                          <td>{row.seasonsCompleted}</td>
                          <td>
                            <strong>{row.titles}</strong>
                          </td>
                          <td>{row.runnerUpFinishes}</td>
                          <td>{row.played}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.ties}</td>
                          <td>{row.noResults}</td>
                          <td>{row.points}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <h3>All-time player leaders</h3>
              <div className="stats-grid">
                <div className="career-panel">
                  <h4>Career runs</h4>
                  <ol>
                    {persistentWorld.careerProjection.leaders.runs.map((entry) => (
                      <li key={entry.playerId}>
                        <span>{service.playerName(entry.playerId)}</span>
                        <strong>{entry.value}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="career-panel">
                  <h4>Career wickets</h4>
                  <ol>
                    {persistentWorld.careerProjection.leaders.wickets.map((entry) => (
                      <li key={entry.playerId}>
                        <span>{service.playerName(entry.playerId)}</span>
                        <strong>{entry.value}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <h3>All-time player statistics</h3>
              <div className="table-wrap">
                <table className="data-table lead-2">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Team</th>
                      <th>Seasons</th>
                      <th>M</th>
                      <th>Runs</th>
                      <th>HS</th>
                      <th>Avg</th>
                      <th>SR</th>
                      <th>Wkts</th>
                      <th>Bowl Avg</th>
                      <th>Econ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistentWorld.careerProjection.players.map((player) => (
                      <tr key={player.playerId}>
                        <td>
                          <button
                            type="button"
                            className="player-link"
                            id={`player-link-STATISTICS-${player.playerId}`}
                            aria-label={`View ${service.playerName(player.playerId)}`}
                            onClick={() => openPlayer(player.playerId, "STATISTICS")}
                          >
                            {service.playerName(player.playerId)}
                          </button>
                        </td>
                        <td>{service.teamName(player.teamId)}</td>
                        <td>{player.seasonsPlayed}</td>
                        <td>{player.matches}</td>
                        <td>{player.runs}</td>
                        <td>
                          {player.battingInnings > 0
                            ? `${player.highScoreRuns}${player.highScoreNotOut ? "*" : ""}`
                            : <NoValue />}
                        </td>
                        <td>{metric(player.battingAverageX100)}</td>
                        <td>{metric(player.strikeRateX100)}</td>
                        <td>{player.bowlingWickets}</td>
                        <td>{metric(player.bowlingAverageX100)}</td>
                        <td>{metric(player.economyX100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            (() => {
              const scopedSeason =
                persistentWorld && typeof statsScope === "number"
                  ? persistentWorld.completedSeasons.find((s) => s.seasonNumber === statsScope) ??
                    null
                  : null;
              const tableRows = scopedSeason ? scopedSeason.table : state.projection.table;
              const leaderSets = scopedSeason ? scopedSeason.leaders : state.projection.leaders;
              const playerRows = scopedSeason ? scopedSeason.players : state.projection.players;
              return (
                <div>
                  <h3>
                    {scopedSeason
                      ? `League table · Season ${scopedSeason.seasonNumber} (${scopedSeason.calendarYear})`
                      : "League table"}
                  </h3>
                  <div className="table-wrap">
                    <table className="league-table data-table lead-2">
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Team</th>
                          <th>P</th>
                          <th>W</th>
                          <th>L</th>
                          <th>T</th>
                          <th>NR</th>
                          <th>Pts</th>
                          <th>NRR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row) => (
                          <tr
                            key={row.teamId}
                            className={row.teamId === controlledTeam ? "managed-fixture" : ""}
                          >
                            <td>{row.rank}</td>
                            <td className="league-team"><TeamCrest teamId={row.teamId} name={service.teamName(row.teamId)} colours={service.getWorld().teams.find((t) => t.teamId === row.teamId)?.colours ?? []} size={22} decorative />{service.teamName(row.teamId)}</td>
                            <td>{row.played}</td>
                            <td>{row.wins}</td>
                            <td>{row.losses}</td>
                            <td>{row.ties}</td>
                            <td>{row.noResults}</td>
                            <td>{row.points}</td>
                            <td>
                              {row.nrrX1000 === null ? <NoValue /> : (row.nrrX1000 / 1000).toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h3>Player leaders</h3>
                  <div className="stats-grid">
                    <div className="career-panel">
                      <h4>Runs</h4>
                      <ol>
                        {leaderSets.runs.map((entry) => (
                          <li key={entry.playerId}>
                            <span>{service.playerName(entry.playerId)}</span>
                            <strong>{entry.value}</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="career-panel">
                      <h4>Wickets</h4>
                      <ol>
                        {leaderSets.wickets.map((entry) => (
                          <li key={entry.playerId}>
                            <span>{service.playerName(entry.playerId)}</span>
                            <strong>{entry.value}</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  <h3>Full player statistics</h3>
                  <div className="table-wrap">
                    <table className="data-table lead-2">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Team</th>
                          <th>M</th>
                          <th>Runs</th>
                          <th>Avg</th>
                          <th>SR</th>
                          <th>Wkts</th>
                          <th>Bowl Avg</th>
                          <th>Econ</th>
                          <th>Bowl SR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerRows.map((player) => (
                          <tr key={player.playerId}>
                            <td>
                              <button
                                type="button"
                                className="player-link"
                                id={`player-link-STATISTICS-${player.playerId}`}
                                aria-label={`View ${service.playerName(player.playerId)}`}
                                onClick={() => openPlayer(player.playerId, "STATISTICS")}
                              >
                                {service.playerName(player.playerId)}
                              </button>
                            </td>
                            <td>{service.teamName(player.teamId)}</td>
                            <td>{player.matches}</td>
                            <td>{player.runs}</td>
                            <td>{metric(player.battingAverageX100)}</td>
                            <td>{metric(player.strikeRateX100)}</td>
                            <td>{player.bowlingWickets}</td>
                            <td>{metric(player.bowlingAverageX100)}</td>
                            <td>{metric(player.economyX100)}</td>
                            <td>{metric(player.bowlingStrikeRateX100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}

          {historicalProjection && (
            <section
              className="career-panel"
              aria-labelledby="historical-records-heading"
              data-testid="historical-records-panel"
              style={{ marginTop: "22px" }}
            >
              <div className="section-bar">
                <h3 id="historical-records-heading">
                  Historical records, filters &amp; qualified leaderboards
                </h3>
                <button
                  type="button"
                  data-testid="reset-historical-filters-btn"
                  onClick={() => {
                    setHistoricalOpponent("ALL");
                    setHistoricalVenue("ALL");
                    setHistoricalBattingPosition("ALL");
                    setHistoricalPlayerStatus("ALL");
                    if (persistentWorld) setStatsScope("ALL_TIME");
                  }}
                >
                  Reset filters
                </button>
              </div>
              <p
                className="career-disclosure compact"
                data-testid="historical-stats-provenance"
              >
                {historicalProjection.separationNotice} ({historicalProjection.filteredMatchesCount}/
                {historicalProjection.totalSourceMatches} career fixtures matched).{" "}
                {historicalProjection.filterSupport.fielding.note}
                <AboutDetails summary="About these statistics">
                  Statistics projection <code>{historicalProjection.projectionVersion}</code>.
                </AboutDetails>
              </p>
              <div className="stats-filter-grid" data-testid="historical-stats-filters">
                <label>
                  Format
                  <select aria-label="Historical format filter" value="T20" onChange={() => {}}>
                    {historicalProjection.filterSupport.formats.map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt} (Career)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Season
                  <select
                    aria-label="Historical season filter"
                    value={
                      historicalSeasonScope === "ALL"
                        ? "ALL"
                        : historicalSeasonScope === "ACTIVE" && persistentWorldRef
                          ? String(persistentWorldRef.currentSeasonNumber)
                          : String(historicalSeasonScope)
                    }
                    onChange={(event) => {
                      const val = event.currentTarget.value;
                      if (val === "ALL") {
                        if (persistentWorld) setStatsScope("ALL_TIME");
                      } else {
                        const num = Number.parseInt(val, 10);
                        if (persistentWorld && num === persistentWorld.currentSeasonNumber) {
                          setStatsScope("ACTIVE");
                        } else {
                          setStatsScope(num);
                        }
                      }
                    }}
                  >
                    {persistentWorld && <option value="ALL">All seasons</option>}
                    {historicalProjection.filterSupport.seasons.map((opt) => (
                      <option key={opt.seasonNumber} value={String(opt.seasonNumber)}>
                        Season {opt.seasonNumber} ({opt.calendarYear})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Competition
                  <select
                    aria-label="Historical competition filter"
                    value={historicalProjection.filterSupport.competitions[0]?.competitionId ?? "T20_DOMESTIC"}
                    onChange={() => {}}
                  >
                    {historicalProjection.filterSupport.competitions.map((comp) => (
                      <option key={comp.competitionId} value={comp.competitionId}>
                        {comp.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Opponent
                  <select
                    aria-label="Historical opponent filter"
                    value={historicalOpponent}
                    onChange={(event) => setHistoricalOpponent(event.currentTarget.value)}
                  >
                    <option value="ALL">All opponents</option>
                    {historicalProjection.filterSupport.opponents.map((teamId) => (
                      <option key={teamId} value={teamId}>
                        {service.teamName(teamId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Venue
                  <select
                    aria-label="Historical venue filter"
                    disabled={!historicalProjection.filterSupport.venues.available}
                    value={historicalVenue}
                    onChange={(event) => setHistoricalVenue(event.currentTarget.value)}
                  >
                    <option value="ALL">All venues</option>
                    {historicalProjection.filterSupport.venues.groundIds.map((groundId) => (
                      <option key={groundId} value={groundId}>
                        {service.groundName(groundId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Batting position
                  <select
                    aria-label="Historical batting position filter"
                    value={historicalBattingPosition}
                    onChange={(event) =>
                      setHistoricalBattingPosition(
                        event.currentTarget.value as HistoricalBattingPositionBand,
                      )
                    }
                  >
                    {historicalProjection.filterSupport.battingPosition.bands.map((band) => (
                      <option key={band} value={band}>
                        {band === "ALL"
                          ? "All batting positions"
                          : band === "OPENER"
                            ? "Openers (1 to 2)"
                            : band === "TOP_ORDER"
                              ? "Top order (1 to 3)"
                              : band === "MIDDLE_ORDER"
                                ? "Middle order (4 to 6)"
                                : "Lower order (7 to 11)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Player status
                  <select
                    aria-label="Historical player inclusion filter"
                    value={historicalPlayerStatus}
                    onChange={(event) =>
                      setHistoricalPlayerStatus(
                        event.currentTarget.value as HistoricalPlayerStatusFilter,
                      )
                    }
                  >
                    <option value="ALL">All (active + retired)</option>
                    <option value="ACTIVE">Active players only</option>
                    <option value="RETIRED">Retired alumni only</option>
                  </select>
                </label>
              </div>

              {(() => {
                const activeBoard = historicalProjection.leaderboards[historicalLeaderboardMetric];
                const visibleEntries = activeBoard.entries;
                const unqualifiedCount = Math.max(
                  0,
                  activeBoard.totalCandidatesCount - activeBoard.qualifiedCount,
                );
                return (
                  <div data-testid="historical-leaderboards-section" style={{ marginTop: "14px" }}>
                    <div className="section-bar">
                      <h4>Qualified leaderboards ({activeBoard.title})</h4>
                      <span className="career-disclosure compact" data-testid="leaderboard-qualification-count">
                        {activeBoard.qualifiedCount} qualified of {activeBoard.totalCandidatesCount} candidates
                        {unqualifiedCount > 0
                          ? ` (${unqualifiedCount} below threshold shown in career records below)`
                          : ""}
                      </span>
                    </div>
                    <div
                      className="leaderboard-tabs"
                      role="group"
                      aria-label="Leaderboard categories"
                    >
                      {HistoricalLeaderboardMetricSchema.options.map((cat) => {
                        const board = historicalProjection.leaderboards[cat];
                        return (
                          <button
                            key={cat}
                            type="button"
                            aria-pressed={activeBoard.metric === cat}
                            onClick={() => setHistoricalLeaderboardMetric(cat)}
                          >
                            {board.title}
                          </button>
                        );
                      })}
                    </div>
                    <p className="historical-rule-meta" data-testid="leaderboard-rule-summary">
                      <strong>Qualification:</strong> {activeBoard.qualificationRule.summary} ·{" "}
                      <strong>Denominator:</strong> {activeBoard.denominatorDefinition} ·{" "}
                      <strong>Ties:</strong> {activeBoard.tieRule} ·{" "}
                      <strong>Null handling:</strong> {activeBoard.nullPolicy}
                    </p>
                    {visibleEntries.length === 0 ? (
                      <p>No players meet the qualification threshold for this filter slice yet.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table" data-testid="historical-leaderboard-table">
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Player</th>
                              <th>Team</th>
                              <th>{activeBoard.title}</th>
                              <th>Details</th>
                              <th>Denominator</th>
                              <th>Contributing match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleEntries.map((entry) => {
                              const topFixtureId = entry.contributingFixtureIds[0];
                              const replayBtnId = topFixtureId
                                ? `lb-replay-${activeBoard.metric}-${entry.playerId}-${topFixtureId}`
                                : null;
                              return (
                                <tr key={entry.playerId}>
                                  <td>
                                    {entry.qualified ? entry.rank : <NoValue />}
                                    {entry.qualified && entry.tied ? <small> (T)</small> : null}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="player-link"
                                      onClick={() => openPlayer(entry.playerId, "STATISTICS")}
                                    >
                                      {service.playerName(entry.playerId)}
                                    </button>
                                    {entry.status === "RETIRED" ? <small>Retired</small> : null}
                                  </td>
                                  <td>{service.teamName(entry.teamId)}</td>
                                  <td>
                                    <strong>{entry.primaryDisplay}</strong>
                                  </td>
                                  <td>{entry.secondaryDisplay}</td>
                                  <td>
                                    {entry.denominatorCount} {entry.denominatorLabel}
                                  </td>
                                  <td>
                                    {topFixtureId && replayBtnId ? (
                                      <button
                                        id={replayBtnId}
                                        type="button"
                                        className="replay-btn"
                                        disabled={busy}
                                        onClick={() => void openReplay(topFixtureId, replayBtnId)}
                                      >
                                        View replay ({entry.contributingFixtureIds.length})
                                      </button>
                                    ) : (
                                      <NoValue />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              <h4 style={{ marginTop: "18px" }}>
                Filtered career &amp; fielding records ({historicalProjection.players.length})
              </h4>
              <div className="table-wrap">
                <table className="data-table lead-2" data-testid="historical-player-records-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Status</th>
                      <th>M</th>
                      <th>Runs</th>
                      <th>HS</th>
                      <th>Avg</th>
                      <th>SR</th>
                      <th>50/100</th>
                      <th>Wkts</th>
                      <th>BB</th>
                      <th>Econ</th>
                      <th>Fielding (Ct/St/RO)</th>
                      <th>Latest match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalProjection.players.map((rec) => {
                      const latest = rec.contributingMatches[0];
                      const btnId = latest
                        ? `hist-replay-${rec.playerId}-${latest.fixtureId}`
                        : null;
                      return (
                        <tr key={rec.playerId}>
                          <td>
                            <button
                              type="button"
                              className="player-link"
                              onClick={() => openPlayer(rec.playerId, "STATISTICS")}
                            >
                              {service.playerName(rec.playerId)}
                            </button>
                            <small>{service.teamName(rec.currentTeamId)}</small>
                          </td>
                          <td>{rec.status === "RETIRED" ? "Retired" : "Active"}</td>
                          <td>{rec.matches}</td>
                          <td>{rec.runs}</td>
                          <td>
                            {rec.battingInnings > 0
                              ? `${rec.highScoreRuns}${rec.highScoreNotOut ? "*" : ""}`
                              : <NoValue />}
                          </td>
                          <td>{metric(rec.battingAverageX100)}</td>
                          <td>{metric(rec.strikeRateX100)}</td>
                          <td>
                            {rec.fifties}/{rec.hundreds}
                          </td>
                          <td>{rec.bowlingWickets}</td>
                          <td>
                            {rec.bestBowlingRuns !== null
                              ? `${rec.bestBowlingWickets}/${rec.bestBowlingRuns}`
                              : <NoValue />}
                          </td>
                          <td>{metric(rec.economyX100)}</td>
                          <td>
                            {rec.catches}/{rec.stumpings}/{rec.runOuts}
                          </td>
                          <td>
                            {latest && btnId && latest.archiveReplayAvailable ? (
                              <button
                                id={btnId}
                                type="button"
                                className="replay-btn"
                                disabled={busy}
                                onClick={() => void openReplay(latest.fixtureId, btnId)}
                              >
                                View replay
                              </button>
                            ) : (
                              <NoValue />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {(() => {
            const awardsLedger = service.getAwardsLedger();
            const summaries = awardsLedger?.seasonAwards ?? [];
            if (summaries.length === 0) return null;
            const activeSummary =
              (awardsSeasonFilter !== "LATEST"
                ? summaries.find((s) => s.seasonNumber === awardsSeasonFilter)
                : undefined) ??
              summaries[summaries.length - 1] ??
              null;
            if (!activeSummary) return null;
            return (
              <section
                className="career-panel"
                aria-labelledby="season-awards-heading"
                data-testid="season-awards-panel"
                style={{ marginTop: "18px" }}
              >
                <div className="section-bar">
                  <h3 id="season-awards-heading">
                    Season awards · Season {activeSummary.seasonNumber} ({activeSummary.calendarYear})
                  </h3>
                  <span className="award-provenance-tag" data-testid="season-awards-provenance">
                    Game award · {activeSummary.awardVersion}
                  </span>
                </div>
                {summaries.length > 1 && (
                  <div className="action-row" style={{ marginBottom: "12px" }}>
                    <label>
                      Awards season{" "}
                      <select
                        aria-label="Season awards selector"
                        value={
                          awardsSeasonFilter === "LATEST"
                            ? String(activeSummary.seasonNumber)
                            : String(awardsSeasonFilter)
                        }
                        onChange={(event) =>
                          setAwardsSeasonFilter(Number.parseInt(event.currentTarget.value, 10))
                        }
                      >
                        {summaries.map((s) => (
                          <option key={s.seasonNumber} value={String(s.seasonNumber)}>
                            Season {s.seasonNumber} ({s.calendarYear})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <div className="season-awards-grid">
                  {activeSummary.awards.map((award) => (
                    <article
                      key={award.category}
                      className="career-panel season-award-card"
                      data-testid={`season-award-card-${award.category}`}
                    >
                      <h4>{award.label}</h4>
                      {award.status === "AWARDED" && award.winnerPlayerId ? (
                        <>
                          <p className="season-award-winner">
                            <button
                              type="button"
                              className="player-link"
                              onClick={() => openPlayer(award.winnerPlayerId!, "STATISTICS")}
                            >
                              <strong>{service.playerName(award.winnerPlayerId)}</strong>
                            </button>{" "}
                            ({award.winnerTeamId ? service.teamName(award.winnerTeamId) : <NoValue />})
                          </p>
                          <p className="season-award-stat">
                            {award.headlineStat ?? <NoValue />}{" "}
                            {award.scoreX100 !== null
                              ? `· ${(award.scoreX100 / 100).toFixed(2)} pts`
                              : ""}
                            {award.tieBroken ? " · Tie-break" : ""}
                          </p>
                        </>
                      ) : (
                        <p className="season-award-unavailable">
                          Unavailable ({award.unavailableReason ?? "Not awarded"})
                        </p>
                      )}
                      <p className="match-award-explain">{award.explanationText}</p>
                      <small className="historical-rule-meta">
                        Qualification: {award.qualificationRule}
                      </small>
                    </article>
                  ))}
                </div>
                <p className="award-notice">{AWARD_NOTICE_TEXT}</p>
              </section>
            );
          })()}
        </section>
  );
}

export type StatisticsScreenProps = {
  service: CareerApplicationService;
  state: NonNullable<ReturnType<CareerApplicationService["getState"]>>;
  persistentWorld: ReturnType<CareerApplicationService["getPersistentState"]>;
  persistentWorldRef: ReturnType<CareerApplicationService["getPersistentState"]>;
  busy: boolean;
  controlledTeam: string | null;
  statsScope: StatsScope;
  setStatsScope: Dispatch<SetStateAction<StatsScope>>;
  historicalOpponent: string;
  setHistoricalOpponent: Dispatch<SetStateAction<string>>;
  historicalVenue: string;
  setHistoricalVenue: Dispatch<SetStateAction<string>>;
  historicalBattingPosition: HistoricalBattingPositionBand;
  setHistoricalBattingPosition: Dispatch<SetStateAction<HistoricalBattingPositionBand>>;
  historicalPlayerStatus: HistoricalPlayerStatusFilter;
  setHistoricalPlayerStatus: Dispatch<SetStateAction<HistoricalPlayerStatusFilter>>;
  historicalLeaderboardMetric: HistoricalLeaderboardMetric;
  setHistoricalLeaderboardMetric: Dispatch<SetStateAction<HistoricalLeaderboardMetric>>;
  historicalProjection: ReturnType<CareerApplicationService["historicalStatistics"]>;
  historicalSeasonScope: number | "ACTIVE" | "ALL";
  awardsSeasonFilter: number | "LATEST";
  setAwardsSeasonFilter: Dispatch<SetStateAction<number | "LATEST">>;
  openPlayer: (id: string, origin: "SQUAD" | "STATISTICS" | "CONTRACTS" | "CAREER" | "FIXTURES") => void;
  openReplay: (fixtureId: string, triggerId: string) => Promise<void>;
  replayViewerSection: ReactNode;
};
