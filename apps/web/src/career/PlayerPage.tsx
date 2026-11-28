import React, { useEffect, useRef } from "react";
import type { CareerStoryCard } from "@lcxxvi/contracts";
import { CareerStoriesPanel } from "./CareerStoriesPanel.js";
import { PlayerPortrait, RatingBadge, RoleChip } from "../world/PlayerPortrait.js";
import { overallRating, playerStrengths } from "../world/player-visuals.js";
import { careerWorld } from "./world-state.js";
import { derivePlayerIdentity, styleWithBasis, type PlayerIdentity, type StoryRecord } from "@lcxxvi/projections";
import {
  type HistoricalPlayerRecord,
  type PersistentCareerPlayerStats,
  type PlayerContract,
  type PlayerLifecycleSkillLedgerEntry,
  type RetiredPlayerRecord,
  type SeasonAwardsSummary,
  type SeasonPlayerStats,
  type SquadPlayerTrainingConditionView,
  type WorldPack,
} from "@lcxxvi/contracts";
import { NoValue } from "../NoValue.js";
import { AWARD_NOTICE_TEXT, NO_VALUE_TEXT, roleLabel } from "../display-labels.js";

export type PlayerAwardsSummary = {
  playerOfTheMatchCount: number;
  playerOfTheMatchSeasons: number[];
  seasonAwards: SeasonAwardsSummary[];
};

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
  return value === null ? NO_VALUE_TEXT : (value / 100).toFixed(2);
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
  awardsSummary = null,
  stories = [],
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
  awardsSummary?: PlayerAwardsSummary | null;
  /** Stage 11 story cards about this player, oldest first. */
  stories?: readonly CareerStoryCard[];
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
        {roleLabel(player.role)} ·{" "}
        {player.batHand === "L" ? "Left" : "Right"}-hand batting
        {age !== null ? ` · Age ${age}` : ""}
        {skillLedgerEntry ? ` · Debut Season ${skillLedgerEntry.debutSeasonNumber}` : ""}
      </p>
      <PlayerHero player={player} format={format} />
      <PlayerIdentityPanel
        identity={derivePlayerIdentity(
          { playerId: player.playerId, role: player.role, bowlingStyle: player.bowlingStyle, skills: player.skills.T20 },
          storyRecord({
            player,
            age,
            retiredRecord,
            lastTeamName,
            activeContract,
            contractTeamName,
            careerStats,
            historicalRecord,
            awardsSummary,
          }),
        )}
      />
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
            <p>Uncontracted free agent, eligible for domestic contract offers.</p>
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
                    <span className="skill-bar" aria-hidden="true" style={{ "--v": String(currentRating) } as React.CSSProperties} />
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
      {stories.length > 0 && (
        <CareerStoriesPanel
          stories={stories}
          title="Career timeline & milestones"
          testId="player-career-timeline"
          withControls={false}
          busy={false}
          {...(onOpenReplay ? { onOpenReplay } : {})}
        />
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
            Career T20 records ·{" "}
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
                : <NoValue />}
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
                : <NoValue />}
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
                          <td>{entry.groundId ? groundName(entry.groundId) : <NoValue />}</td>
                          <td>
                            {entry.battedInnings !== null
                              ? `${entry.runsScored ?? 0}${entry.notOut ? "*" : ""} (${entry.ballsFaced ?? 0})`
                              : <NoValue />}
                          </td>
                          <td>
                            {legalBalls > 0
                              ? `${entry.bowlingWickets ?? 0}/${entry.bowlingRunsConceded ?? 0} (${Math.floor(legalBalls / 6)}.${legalBalls % 6})`
                              : <NoValue />}
                          </td>
                          <td>
                            {entry.archiveEvaluated
                              ? catches + stumpings + runOuts > 0
                                ? `${catches}c ${stumpings}st ${runOuts}ro`
                                : "0"
                              : <NoValue />}
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
                              <NoValue />
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
      {format === "T20" && awardsSummary && (
        <section
          className="career-panel"
          aria-labelledby="player-awards-heading"
          data-testid="player-awards-summary"
          style={{ marginTop: "16px" }}
        >
          <div className="section-bar">
            <h3 id="player-awards-heading">Awards &amp; honours</h3>
            <span className="award-provenance-tag">Game award</span>
          </div>
          <dl className="player-details" style={{ maxWidth: "460px", marginBottom: "12px" }}>
            <dt>Player of the Match awards</dt>
            <dd data-testid="player-potm-count">
              {awardsSummary.playerOfTheMatchCount}
              {awardsSummary.playerOfTheMatchSeasons.length > 0 && (
                <small style={{ marginLeft: "6px" }}>
                  (Seasons {awardsSummary.playerOfTheMatchSeasons.join(", ")})
                </small>
              )}
            </dd>
          </dl>
          {(() => {
            const wonSeasonAwards = awardsSummary.seasonAwards.flatMap((season) =>
              season.awards
                .filter(
                  (award) =>
                    award.status === "AWARDED" && award.winnerPlayerId === player.playerId,
                )
                .map((award) => ({ season, award })),
            );
            if (wonSeasonAwards.length === 0) {
              return <p>No season awards won yet across completed or active T20 seasons.</p>;
            }
            return (
              <div className="table-wrap">
                <table data-testid="player-season-awards-table">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Award</th>
                      <th>Club</th>
                      <th>Headline stat</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wonSeasonAwards.map(({ season, award }) => (
                      <tr key={`${season.seasonNumber}-${award.category}`}>
                        <td>
                          Season {season.seasonNumber} ({season.calendarYear})
                        </td>
                        <td>
                          <strong>{award.label}</strong>
                          {award.tieBroken ? <small> · Tie-break applied</small> : null}
                        </td>
                        <td>{award.winnerTeamId ? teamName(award.winnerTeamId) : <NoValue />}</td>
                        <td>{award.headlineStat ?? <NoValue />}</td>
                        <td>
                          {award.scoreX100 !== null ? `${(award.scoreX100 / 100).toFixed(2)} pts` : <NoValue />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p className="award-notice">{AWARD_NOTICE_TEXT}</p>
        </section>
      )}
    </section>
  );
}
export type PlayerFormat = Format;

/** The recorded figures the identity's story may use, from the same props the panels below show. */
function storyRecord({
  player,
  age,
  retiredRecord,
  lastTeamName,
  activeContract,
  contractTeamName,
  careerStats,
  historicalRecord,
  awardsSummary,
}: {
  player: WorldPack["players"][number];
  age: number | null;
  retiredRecord: RetiredPlayerRecord | null;
  lastTeamName: string | null;
  activeContract: PlayerContract | null;
  contractTeamName: string | null;
  careerStats: PersistentCareerPlayerStats | null;
  historicalRecord: HistoricalPlayerRecord | null;
  awardsSummary: PlayerAwardsSummary | null;
}): StoryRecord {
  const h = historicalRecord;
  const c = careerStats;
  const club = retiredRecord
    ? lastTeamName ? { name: lastTeamName, relation: "LAST" as const } : null
    : activeContract && contractTeamName ? { name: contractTeamName, relation: "CURRENT" as const } : null;
  const seasonAwardsWon = (awardsSummary?.seasonAwards ?? []).reduce(
    (sum, season) => sum + season.awards.filter((a) => a.status === "AWARDED" && a.winnerPlayerId === player.playerId).length,
    0,
  );
  const base = {
    name: player.name,
    club,
    age,
    retired: retiredRecord !== null,
    playerOfTheMatchCount: awardsSummary?.playerOfTheMatchCount ?? 0,
    seasonAwardsWon,
  };
  if (h) {
    return {
      ...base,
      matches: h.matches,
      seasonsPlayed: h.seasonsPlayed,
      runs: h.runs,
      battingInnings: h.battingInnings,
      highScore: h.battingInnings > 0 ? { runs: h.highScoreRuns, notOut: h.highScoreNotOut } : null,
      fifties: h.fifties,
      hundreds: h.hundreds,
      wickets: h.bowlingWickets,
      bestBowling: h.bestBowlingRuns !== null ? { wickets: h.bestBowlingWickets, runs: h.bestBowlingRuns } : null,
      recentMatches: h.contributingMatches.map((m) => ({
        seasonNumber: m.seasonNumber,
        roundNumber: m.roundNumber,
        batted: m.battedInnings !== null,
        runs: m.runsScored ?? 0,
        notOut: m.notOut ?? false,
        bowled: (m.bowledLegalBalls ?? 0) > 0,
        wickets: m.bowlingWickets ?? 0,
        runsConceded: m.bowlingRunsConceded ?? 0,
      })),
    };
  }
  return {
    ...base,
    matches: c?.matches ?? 0,
    seasonsPlayed: c?.seasonsPlayed ?? 0,
    runs: c?.runs ?? 0,
    battingInnings: c?.battingInnings ?? 0,
    highScore: c && c.battingInnings > 0 ? { runs: c.highScoreRuns, notOut: c.highScoreNotOut } : null,
    fifties: c?.fifties ?? 0,
    hundreds: c?.hundreds ?? 0,
    wickets: c?.bowlingWickets ?? 0,
    bestBowling: null,
    recentMatches: [],
  };
}

/**
 * LC_PLAYER_IDENTITY_V1 on the player page: the playing style read from the T20 ratings (with the ratings that earn
 * it), two personality traits marked as flavour, and the story so far from recorded figures only.
 */
function PlayerIdentityPanel({ identity }: { identity: PlayerIdentity }) {
  return (
    <section className="career-panel player-identity" aria-labelledby="player-identity-heading" data-testid="player-identity">
      <h3 id="player-identity-heading">Who they are</h3>
      <p className="player-identity-style">
        <span className="style-tag" data-testid="player-identity-style">{identity.primary.label}</span>
        {identity.secondary && (
          <span className="style-tag style-tag-secondary" data-testid="player-identity-secondary">{identity.secondary.label}</span>
        )}
      </p>
      <p data-testid="player-identity-basis">
        <small>
          Playing style, from T20 ratings: {styleWithBasis(identity.primary)}
          {identity.secondary ? `; also ${styleWithBasis(identity.secondary)}` : ""}.
        </small>
      </p>
      {identity.story && (
        <p className="player-identity-story" data-testid="player-identity-story">
          <strong>Story so far.</strong> {identity.story.text}
        </p>
      )}
      <div className="player-identity-traits" data-testid="player-identity-traits">
        <p className="eyebrow">Personality · flavour, not a rating</p>
        <ul>
          {identity.traits.map((trait) => (
            <li key={trait.id}>
              <strong>{trait.label}.</strong> {trait.flavour}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The player page's hero card (owner order of 20 November 2026, step 5): face, overall rating, role and the four
 * strengths as bars, for the chosen format. Decorative: every figure on it is also written in the panels below.
 */
function PlayerHero({ player, format }: { player: WorldPack["players"][number]; format: Format }) {
  const kit = careerWorld.teams.find((team) => team.squadIds.includes(player.playerId))?.colours ?? [];
  const s = playerStrengths(player, format);
  const bars: [string, number][] = [["Batting", s.batting], ["Bowling", s.bowling], ["Fielding", s.fielding], ...(player.role === "KEEPER" ? [["Keeping", s.keeping] as [string, number]] : [])];
  return (
    <div className="player-hero" aria-hidden="true">
      <PlayerPortrait playerId={player.playerId} role={player.role} kit={kit} size={112} />
      <div className="player-hero-main">
        <RoleChip role={player.role} decorative />
      </div>
      <RatingBadge rating={overallRating(player, format)} label={`${format === "RED_BALL" ? "RED" : format} OVR`} decorative />
      <div className="player-hero-bars">
        {bars.map(([label, value]) => (
          <div key={label} className="player-hero-bar">
            <span>{label}</span>
            <span className="skill-bar" style={{ "--v": String(value) } as React.CSSProperties} />
            <b>{value || <NoValue />}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
