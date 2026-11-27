import { TeamCrest } from "../world/TeamCrest.js";
import { groundArtBackground } from "../world/ground-art.js";
import { PlayerPortrait } from "../world/PlayerPortrait.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { PreMatchBriefingPanel } from "../match/TacticalBriefingPanels.js";
import { useMemo, useState } from "react";
import { buildFixturePreview, buildMatchReport, computeMatchAwardFromCompletion, playerForm, playerMilestones, playingStyle, projectSeasonReview, rankClubStrength, selectionAdvice, SELECTION_ADVICE_NOTE, seasonObjective, seasonObjectivePhrase, seasonObjectiveStatus, type SeasonReview } from "@lcxxvi/projections";
import { overallRating, playerStrengths } from "../world/player-visuals.js";
import { formatGameDate } from "./format.js";
import { clubFormGuide, clubStanding, FORM_OUTCOME_WORD, ordinal, squadStrip, type SquadStripPlayer } from "./clubhouse-front-page.js";
import "./clubhouse.css";
import { MatchReportPanel, matchReportSeenKey, readReportSeen, writeReportSeen } from "./MatchReportPanel.js";
import { SeasonFinale, readFinaleSeen, seasonFinaleSeenKey, writeFinaleSeen } from "./SeasonFinale.js";
import { CareerApplicationService } from "./service.js";

export const selectionNoteKey = (
  save: string,
  season: string,
  fixture: string,
) => JSON.stringify(["lcxxvi-selection-focus", save, season, fixture]);

/**
 * The ground painting sits in its own region beside (or, on a phone, above) the lead story, so no text is set over it.
 * It needs no wash; clubhouse.css blends its inner edge into the panel for each layout.
 */
const LEAD_ART_WASH = "linear-gradient(rgba(16, 41, 43, 0), rgba(16, 41, 43, 0))";

/**
 * The career Home screen, the Clubhouse (split out of CareerApp.tsx, audit Phase 5). CP07 lays it out as a front page:
 * the next match leads; the last result, the table and the board sit in the rail; squad news and match preparation
 * follow. Every value comes from the season projection, the squad view or an existing projection.
 */
export function HomeScreen(props: HomeScreenProps) {
  const {
    service,
    state,
    persistentWorld,
    busy,
    inspectionOnly,
    action,
    nextFixture,
    pendingMatch,
    playMatch,
    simulateMatch,
    closeSeason,
    copyToPersistentWorld,
    displayWorld,
    showTacticalBriefings,
    controlledTeam,
    completedManaged,
    openAnalysis,
    openPlayer,
  } = props;
  const call = pendingMatch ? null : service.selectionCall();
  const previous = state.completedMatches
    .filter(
      (m) => m.homeTeamId === controlledTeam || m.awayTeamId === controlledTeam,
    )
    .at(-1);
  let backed: string | null = null;
  try {
    if (previous)
      backed = localStorage.getItem(
        selectionNoteKey(
          service.getSaveId() ?? "",
          state.seasonId,
          previous.fixtureId,
        ),
      );
  } catch {
    /* portable saves still show the official result */
  }
  const backedXI = previous?.selectedTeams.find(
    (t) => t.teamId === controlledTeam,
  );
  const backedBat = backed
    ? previous?.scorecard.innings.find(
        (i) => i.battingTeamId === controlledTeam,
      )?.batting[backed]
    : null;
  const backedBowl = backed
    ? previous?.scorecard.innings.find(
        (i) => i.battingTeamId !== controlledTeam,
      )?.bowling[backed]
    : null;
  const budget = call && service.managedClubBudget();
  const report = previous && controlledTeam
    ? buildMatchReport({
        completion: previous,
        focusTeamId: controlledTeam,
        appliedMatches: state.projection.appliedMatches,
        teamIds: state.projection.table.map((row) => row.teamId),
        // The saved awards ledger loads lazily; until it has, the same award formula runs on the scorecard alone.
        award:
          service.getMatchAwardForFixture(persistentWorld?.currentSeasonNumber ?? 1, previous.fixtureId) ??
          computeMatchAwardFromCompletion(previous, { seasonNumber: persistentWorld?.currentSeasonNumber ?? 1 }),
        teamName: (teamId) => service.teamName(teamId),
        playerName: (playerId) => service.playerName(playerId),
      })
    : null;
  // E2: the board's objective, from each club's best eleven, and the club's standing against it.
  const playersById = new Map(displayWorld.players.map((player) => [player.playerId, player]));
  // Career totals for the milestones in the squad strip, as the Squad screen works them out; once per saved state.
  const careerTotals = useMemo(() => {
    const records = service.historicalStatistics({})?.players ?? [];
    return new Map(records.map((record) => [record.playerId, { runs: record.runs, wickets: record.bowlingWickets, matches: record.matches }]));
  }, [service, state]);
  const objective = controlledTeam
    ? seasonObjective(
        rankClubStrength(
          displayWorld.teams.map((team) => ({
            teamId: team.teamId,
            ratings: team.squadIds.flatMap((id) => {
              const player = playersById.get(id);
              return player ? [overallRating(player, "T20")] : [];
            }),
          })),
        ),
        controlledTeam,
      )
    : null;
  const objectiveStatus = objective && controlledTeam
    ? seasonObjectiveStatus({ objective, table: state.projection.table, teamId: controlledTeam, totalRounds: 14, seasonComplete: state.phase === "COMPLETE" })
    : null;
  // E7: the fixture preview, from recorded results in this and past seasons.
  const opponentId = nextFixture && controlledTeam
    ? (nextFixture.homeTeamId === controlledTeam ? nextFixture.awayTeamId : nextFixture.homeTeamId)
    : null;
  const preview = opponentId && controlledTeam
    ? buildFixturePreview({
        focusTeamId: controlledTeam,
        opponentTeamId: opponentId,
        meetings: [
          ...(persistentWorld?.completedSeasons ?? []).flatMap((season) => season.completedMatches.map((completion) => ({ seasonNumber: season.seasonNumber, completion }))),
          ...state.completedMatches.map((completion) => ({ seasonNumber: persistentWorld?.currentSeasonNumber ?? 1, completion })),
        ],
        table: state.projection.table,
        appliedMatches: state.projection.appliedMatches,
        seasonPlayers: state.projection.players,
        opponentRatings: (displayWorld.teams.find((team) => team.teamId === opponentId)?.squadIds ?? []).flatMap((id) => {
          const player = playersById.get(id);
          if (!player) return [];
          const strengths = playerStrengths(player, "T20");
          return [{ playerId: id, batting: strengths.batting, bowling: strengths.bowling }];
        }),
        objective: objective ? { targetPosition: objective.targetPosition, phrase: seasonObjectivePhrase(objective.kind) } : null,
        teamName: (teamId) => service.teamName(teamId),
      })
    : null;
  // E9: the season finale, shown once per browser when the last fixture is complete.
  const finaleKey = seasonFinaleSeenKey(service.getSaveId() ?? "", state.seasonId);
  const [finaleClosed, setFinaleClosed] = useState<readonly string[]>([]);
  const [finaleReplay, setFinaleReplay] = useState<string | null>(null);
  const [, setAwardsTick] = useState(0);
  const finaleOpen = state.phase === "COMPLETE" && (finaleReplay === finaleKey || (!finaleClosed.includes(finaleKey) && !readFinaleSeen(finaleKey)));
  // LC_SEASON_REVIEW_V1: worked out from the recorded season only while the finale is open; never saved.
  let seasonReview: SeasonReview | null = null;
  if (finaleOpen) {
    try {
      const seasonNumber = persistentWorld?.currentSeasonNumber ?? 1;
      const lifecycle = service.getLifecycleState();
      const rollover = lifecycle?.transitions.find((transition) => transition.toSeasonNumber === seasonNumber) ?? null;
      const economy = service.getEconomyState();
      seasonReview = projectSeasonReview({
        seasonNumber,
        completedMatches: state.completedMatches,
        appliedMatches: state.projection.appliedMatches,
        teamIds: state.projection.table.map((row) => row.teamId),
        priorSeasons: (persistentWorld?.completedSeasons ?? []).map((season) => ({ seasonNumber: season.seasonNumber, completedMatches: season.completedMatches })),
        focusTeamId: controlledTeam ?? null,
        teamName: (teamId) => service.teamName(teamId),
        playerName: (playerId) => service.playerName(playerId),
        lastRollover: rollover,
        ahead: persistentWorld
          ? {
              contracts: economy?.contracts ?? [],
              academy: (lifecycle?.youthAcademy ?? []).map((prospect) => ({
                playerId: prospect.prospectId,
                teamId: prospect.teamId,
                generatedInSeasonNumber: prospect.generatedInSeasonNumber,
                promotedInSeasonNumber: prospect.promotedInSeasonNumber,
                queuedForPromotion: prospect.queuedForPromotion,
              })),
            }
          : null,
      });
    } catch {
      // The review is presentation only: if it cannot be built, the finale shows the table, verdict and awards as before.
      seasonReview = null;
    }
  }
  const reportKey = previous ? matchReportSeenKey(service.getSaveId() ?? "", state.seasonId, previous.fixtureId) : "";
  // Dismissals made in this session are remembered here as well, so the report closes even when storage is unavailable.
  const [closedReports, setClosedReports] = useState<readonly string[]>([]);
  const [reopened, setReopened] = useState<string | null>(null);
  const reportOpen = !!previous && (reopened === reportKey || (!closedReports.includes(reportKey) && !readReportSeen(reportKey)));
  const selectionNote = backed && backedXI?.playerIds.includes(backed) ? (
    <p>
      Your selection: <strong>{service.playerName(backed)}</strong>.{" "}
      {backedBat?.ballsFaced
        ? `${backedBat.runs} from ${backedBat.ballsFaced} balls.`
        : "Did not face a ball."}{" "}
      {backedBowl && backedBowl.legalBalls > 0
        ? `${backedBowl.wickets}/${backedBowl.runsConceded} with the ball.`
        : ""}
    </p>
  ) : null;
  const reportPanel = report ? (
    <MatchReportPanel
      report={report}
      open={reportOpen}
      onClose={() => { writeReportSeen(reportKey); setClosedReports((keys) => [...keys, reportKey]); setReopened(null); }}
      onOpen={() => setReopened(reportKey)}
      teamName={(teamId) => service.teamName(teamId)}
      playerName={(playerId) => service.playerName(playerId)}
    >
      {selectionNote}
      {openAnalysis && previous && (
        <button type="button" data-testid="match-report-analysis" disabled={busy} onClick={() => void openAnalysis(previous.fixtureId)}>
          Post-match analysis
        </button>
      )}
    </MatchReportPanel>
  ) : null;
  // CP07: the front page reads the table, the club's applied results and the squad the screen already projects.
  const standing = controlledTeam ? clubStanding(state.projection.table, controlledTeam) : null;
  const formGuide = controlledTeam ? clubFormGuide(state.projection.appliedMatches, controlledTeam) : [];
  const teamColours = (teamId: string) => displayWorld.teams.find((team) => team.teamId === teamId)?.colours ?? [];
  const squadCondition = service.squadView();
  const contractSeason = persistentWorld?.currentSeasonNumber ?? null;
  const strip = squadStrip(
    (squadCondition?.players ?? []).flatMap((condition): SquadStripPlayer[] => {
      const player = playersById.get(condition.playerId);
      if (!player) return [];
      const form = playerForm(state.completedMatches, player.playerId);
      const contract = contractSeason !== null ? service.playerContract(player.playerId) : null;
      return [{
        playerId: player.playerId,
        rating: overallRating(player, "T20"),
        unavailable: condition.availability === "UNAVAILABLE",
        unavailableReason: condition.availabilityReason,
        fatigueBp: condition.fatigueBp,
        formTrend: form.trend,
        formText: form.text,
        formDiscipline: form.discipline,
        milestones: playerMilestones(careerTotals.get(player.playerId) ?? { runs: 0, wickets: 0, matches: 0 }).map((milestone) => milestone.text),
        contractEnding: !!contract && contract.expiresAfterSeasonNumber === contractSeason,
        style: playingStyle({ playerId: player.playerId, role: player.role, bowlingStyle: player.bowlingStyle, skills: player.skills.T20 }).primary.label,
      }];
    }),
    completedManaged.length,
  );
  const squadSize = squadCondition?.players.length ?? 0;
  const actionsLocked = busy || inspectionOnly || service.isReadOnly();
  const leadArt = state.phase !== "COMPLETE" && nextFixture ? groundArtBackground(service.groundName(nextFixture.groundId), LEAD_ART_WASH) : undefined;
  const reportInSide = !reportOpen;
  return (
    <section aria-labelledby="home-heading" className="clubhouse">
      <h2 id="home-heading">Clubhouse</h2>
      <div className="dashboard-grid clubhouse-front">
        {finaleOpen && (
          <SeasonFinale
            seasonLabel={`SEASON ${persistentWorld?.currentSeasonNumber ?? 1}`}
            table={state.projection.table}
            focusTeamId={controlledTeam ?? null}
            objective={objective}
            objectiveStatus={objectiveStatus}
            awards={service.getSeasonAwards(persistentWorld?.currentSeasonNumber ?? 1)}
            requestAwards={() => void service.syncAwardsLedger().then(() => setAwardsTick((tick) => tick + 1)).catch(() => undefined)}
            review={seasonReview}
            teamName={(teamId) => service.teamName(teamId)}
            playerName={(playerId) => service.playerName(playerId)}
            onDone={() => { writeFinaleSeen(finaleKey); setFinaleClosed((keys) => [...keys, finaleKey]); setFinaleReplay(null); }}
          />
        )}
        {reportOpen && reportPanel}
        <article className="career-panel clubhouse-lead" data-testid="clubhouse-lead" data-art={leadArt ? "true" : undefined} aria-labelledby="clubhouse-lead-heading">
          <div className="clubhouse-lead-copy">
          {state.phase === "COMPLETE" ? (
            <>
              <p className="eyebrow clubhouse-kicker">Season over</p>
              <h3 id="clubhouse-lead-heading" className="clubhouse-headline">Season complete</h3>
              {!finaleOpen && (
                <button type="button" data-testid="season-finale-replay" onClick={() => setFinaleReplay(finaleKey)}>
                  See the season finale again
                </button>
              )}
              <p>
                Champion:{" "}
                <strong>
                  {service.teamName(state.projection.table[0]?.teamId)}
                </strong>
              </p>
              {persistentWorld ? (
                <div className="action-row" style={{ marginTop: "10px" }}>
                  <button
                    type="button"
                    className="primary"
                    data-testid="rollover-next-season-btn"
                    disabled={busy || inspectionOnly || service.isReadOnly()}
                    onClick={() => void action(closeSeason)}
                  >
                    Close season &amp; advance to Season{" "}
                    {persistentWorld.currentSeasonNumber + 1} (
                    {persistentWorld.currentCalendarYear + 1})
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: "10px" }}>
                  <p>
                    This V0.1 single-season save remains frozen as completed.
                    You can start a new multi-season copy from this exact
                    outcome without altering the original slot.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    data-testid="copy-to-persistent-world-btn"
                    disabled={busy || inspectionOnly || service.isReadOnly()}
                    onClick={() => void action(copyToPersistentWorld)}
                  >
                    Copy into multi-season world (Season 2)
                  </button>
                  </div>
                )}
            </>
          ) : nextFixture ? (
            <>
              <p className="fixture-round clubhouse-kicker">Next match · Round {nextFixture.roundNumber} · T20</p>
              <h3 id="clubhouse-lead-heading" className="fixture-opponents clubhouse-headline">
                {[nextFixture.homeTeamId, nextFixture.awayTeamId].map((id, index) => (
                  <span key={id} className="clubhouse-side-name">
                    <span className="clubhouse-versus">{index === 1 ? "v" : ""}</span>
                    <TeamCrest teamId={id} name={service.teamName(id)} colours={teamColours(id)} size={40} decorative />
                    <span className="clubhouse-team-name">{service.teamName(id)}</span>
                  </span>
                ))}
              </h3>
              <p className="fixture-venue clubhouse-dateline">{formatGameDate(nextFixture.matchDayDate)} · {service.groundName(nextFixture.groundId)}</p>
              {state.careerState.currentDate < nextFixture.matchDayDate ? (
                <div className="action-row clubhouse-actions">
                  <button
                    className="primary"
                    disabled={actionsLocked}
                    onClick={() =>
                      action(async () => {
                        await service.simulateToNextUserFixture();
                      })
                    }
                  >
                    Advance to match day
                  </button>
                </div>
              ) : (
                <div className="action-row clubhouse-actions">
                  <button
                    disabled={actionsLocked}
                    onClick={() => action(simulateMatch)}
                  >
                    Simulate match
                  </button>
                  <button
                    disabled={actionsLocked}
                    className="primary"
                    onClick={() => void playMatch()}
                  >
                    Play match
                  </button>
                </div>
              )}
              {pendingMatch && (
                <p role="status" data-testid="pending-career-match">
                  A match for round{" "}
                  {pendingMatch.round ?? nextFixture.roundNumber} is already in
                  progress. Play match resumes it.
                </p>
              )}
              {/* The context sits below the match action so the action stays in view at 150% text scale. */}
              {preview && (
                <div className="fixture-preview clubhouse-context" data-testid="fixture-preview">
                  <p className="fixture-meaning" data-testid="fixture-meaning">
                    {preview.rivalry && <span className="rival-mark" data-testid="fixture-rival" title={preview.rivalry.reason}>Rival</span>}
                    {preview.meaning}
                  </p>
                  <dl>
                    <div>
                      <dt>{service.teamName(preview.opponentTeamId)}</dt>
                      <dd>
                        {preview.opponentPosition !== null && state.projection.table.some((row) => row.played > 0) ? `${ordinal(preview.opponentPosition)} on the table` : "Yet to play"}
                        {preview.opponentForm.length > 0 && <> · Form <span aria-label={`Recent results, oldest first: ${preview.opponentForm.join(" ")}`}>{preview.opponentForm.join(" ")}</span></>}
                      </dd>
                    </div>
                    <div data-testid="fixture-head-to-head">
                      <dt>Head to head</dt>
                      <dd>
                        {preview.headToHead.played === 0
                          ? "First meeting on record."
                          : `Played ${preview.headToHead.played}: won ${preview.headToHead.won}, lost ${preview.headToHead.lost}${preview.headToHead.other ? `, other ${preview.headToHead.other}` : ""}. ${preview.headToHead.lastMeeting ?? ""}`}
                        {preview.rivalry && <> {preview.rivalry.reason}</>}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
              {call && (
                <section className="selection-call" aria-label="Selection call">
                  <p className="eyebrow">
                    SELECTION ROOM · ROUND {nextFixture.roundNumber}
                  </p>
                  <h3>
                    Who takes the{" "}
                    {call.incumbent.role.toLowerCase().replaceAll("_", " ")}{" "}
                    spot?
                  </h3>
                  <div className="selection-options">
                    {[call.incumbent, call.reserve].map((player, index) => {
                      const deal = service.playerContract(player.playerId);
                      const figures = call.bowled?.legalBalls
                        ? `Took ${call.bowled.wickets}/${call.bowled.runsConceded} last match.`
                        : call.batted.ballsFaced
                          ? `Scored ${call.batted.runs} from ${call.batted.ballsFaced} last match.`
                          : "Selected last match. Did not face a ball.";
                      return (
                        <div key={player.playerId}>
                          <strong>{player.name}</strong>
                          {" "}
                          <span className="style-tag" data-testid={`selection-style-${player.playerId}`} title="Playing style, from T20 ratings">
                            {playingStyle({ playerId: player.playerId, role: player.role, bowlingStyle: player.bowlingStyle, skills: player.skills.T20 }).primary.label}
                          </span>
                          <p>
                            {index === 0
                              ? figures
                              : call.reserveMatches
                                ? `${call.reserveMatches} appearance${call.reserveMatches === 1 ? "" : "s"} this season.`
                                : "A first appearance this season is on offer."}
                          </p>
                          <small>
                            Age {service.playerAge(player.birthDate)}
                            {deal && ` · ${deal.annualWageK}k per season`}
                          </small>
                          {(() => {
                            // LC_PLAYER_IDENTITY_V2: reasons from styles, ratings and recorded form. Inferences are labelled.
                            const other = index === 0 ? call.reserve : call.incumbent;
                            const asAdvice = (p: typeof player) => ({ playerId: p.playerId, name: p.name, role: p.playerId === call.keeperId ? "KEEPER" : p.role, bowlingStyle: p.bowlingStyle, skills: p.skills.T20 });
                            const form = playerForm(state.completedMatches, player.playerId);
                            const reasons = selectionAdvice({
                              option: asAdvice(player),
                              other: asAdvice(other),
                              restOfXi: call.xi.filter((p) => p.playerId !== call.incumbent.playerId && p.playerId !== call.reserve.playerId).map(asAdvice),
                              form: form.entries.length > 0 ? form : null,
                            });
                            if (reasons.length === 0) return null;
                            return (
                              <ul className="selection-advice" data-testid={`selection-advice-${player.playerId}`}>
                                {reasons.map((reason) => (
                                  <li key={reason.id} data-kind={reason.kind}>
                                    <b>{reason.kind === "SUGGESTION" ? "Suggestion" : reason.kind === "RATING" ? "Rating" : "Record"}</b> {reason.text}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                          <button
                            disabled={
                              busy || inspectionOnly || service.isReadOnly()
                            }
                            onClick={() =>
                              void playMatch({
                                fixtureId: call.fixtureId,
                                playerId: player.playerId,
                              })
                            }
                          >
                            {index ? "Bring in" : "Retain"} {player.name} &amp;
                            play
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <small className="selection-advice-note" data-testid="selection-advice-note">{SELECTION_ADVICE_NOTE}</small>
                  {budget && (
                    <small>
                      Club wages committed · {budget.committedWagesK}k of{" "}
                      {budget.annualWageBudgetK}k
                    </small>
                  )}
                </section>
              )}
            </>
          ) : (
            <>
              <p className="eyebrow clubhouse-kicker">Fixtures</p>
              <h3 id="clubhouse-lead-heading" className="clubhouse-headline">No remaining managed fixture.</h3>
            </>
          )}
          </div>
          {leadArt && <div className="clubhouse-lead-art" aria-hidden="true" style={leadArt} />}
        </article>
        <div className="clubhouse-rail">
          {reportInSide && reportPanel}
          <article className="career-panel clubhouse-standing" data-testid="clubhouse-standing" aria-labelledby="clubhouse-standing-heading">
            <p className="eyebrow" id="clubhouse-standing-heading">The table</p>
            {standing?.kind === "TABLE" ? (
              <>
                <p className="clubhouse-position" data-testid="clubhouse-position">
                  <span className="big-stat">#{standing.rank}</span>
                  <span className="clubhouse-position-of">of {standing.teams}</span>
                  <span className="clubhouse-position-gap">
                    {standing.rank === 1 ? "Top of the table" : standing.pointsOffTop === 0 ? "Level on points with the top" : `${standing.pointsOffTop} ${standing.pointsOffTop === 1 ? "point" : "points"} off top`}
                  </span>
                </p>
                <p className="clubhouse-record">
                  P{standing.played} · {standing.wins}W · {standing.losses}L · {standing.ties}T · {standing.noResults}NR · <strong>{standing.points} pts</strong> · NRR {standing.nrr ?? "not yet"}
                </p>
                {formGuide.length > 0 && (
                  <div className="clubhouse-form" data-testid="clubhouse-form">
                    <span className="clubhouse-form-label" id="clubhouse-form-label">Form</span>
                    <ol aria-labelledby="clubhouse-form-label" className="clubhouse-form-guide">
                      {formGuide.map((entry) => {
                        const label = `Round ${entry.roundNumber}, ${entry.home ? "home to" : "away to"} ${service.teamName(entry.opponentTeamId)}: ${FORM_OUTCOME_WORD[entry.outcome]}`;
                        return (
                          <li key={entry.fixtureId} data-outcome={entry.outcome} title={label} aria-label={label}>
                            <span aria-hidden="true">{entry.outcome}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <small>Oldest first</small>
                  </div>
                )}
              </>
            ) : standing?.kind === "NOT_STARTED" ? (
              <>
                <p className="clubhouse-not-started" data-testid="clubhouse-season-not-started">Season not started</p>
                <p className="clubhouse-record">{standing.roundsToPlay} rounds to play. The table and form guide open after your first match.</p>
              </>
            ) : null}
            <p className="clubhouse-progress">{completedManaged.length}/14 managed-team fixtures complete.</p>
            {persistentWorld && (
              <p className="clubhouse-progress" data-testid="persistent-world-progress">
                Season {persistentWorld.currentSeasonNumber} (
                {persistentWorld.currentCalendarYear}) ·{" "}
                {persistentWorld.completedSeasons.length} completed{" "}
                {persistentWorld.completedSeasons.length === 1
                  ? "season"
                  : "seasons"}
              </p>
            )}
          </article>
          {objective && objectiveStatus && (
            <article className="career-panel board-card" data-testid="board-card" data-status={objectiveStatus.kind}>
              <p className="eyebrow">THE BOARD · SEASON OBJECTIVE</p>
              <h3 data-testid="board-objective">{objective.label}</h3>
              <p>
                <strong data-testid="board-status">{objectiveStatus.label}</strong> · {objectiveStatus.sentence}
              </p>
              <small>{objective.reason}</small>
            </article>
          )}
        </div>
        {squadSize > 0 && controlledTeam && (
          <section className="career-panel clubhouse-squad" data-testid="clubhouse-squad" aria-labelledby="clubhouse-squad-heading">
            <div className="clubhouse-section-head">
              <h3 id="clubhouse-squad-heading">{strip.developments ? "Squad news" : "Leading players"}</h3>
              <p data-testid="clubhouse-squad-summary">
                {strip.unavailable === 0 ? `All ${squadSize} players available` : `${strip.unavailable} of ${squadSize} unavailable`}
                {strip.tired !== null && <> · {strip.tired === 0 ? "nobody tired" : `${strip.tired} tired`}</>}
                {strip.contractsEnding > 0 && <> · {strip.contractsEnding} {strip.contractsEnding === 1 ? "contract ends" : "contracts end"} this season</>}
              </p>
            </div>
            {!strip.developments && <p className="clubhouse-squad-quiet">No form, fitness or milestone news yet, so these are the highest-rated players in the squad.</p>}
            <ul className="clubhouse-faces">
              {strip.faces.map((face) => {
                const player = playersById.get(face.playerId);
                if (!player) return null;
                return (
                  <li key={face.playerId} data-note={face.notes[0]?.kind}>
                    <PlayerPortrait playerId={player.playerId} role={player.role} kit={teamColours(controlledTeam)} size={52} />
                    <div>
                      {openPlayer ? (
                        <button
                          type="button"
                          className="player-link"
                          id={`player-link-HOME-${player.playerId}`}
                          aria-label={`View ${player.name}`}
                          onClick={() => openPlayer(player.playerId)}
                        >
                          {player.name}
                        </button>
                      ) : (
                        <strong>{player.name}</strong>
                      )}
                      {face.notes.slice(0, 2).map((note) => (
                        <small key={note.kind + note.text} data-kind={note.kind}>{note.text}</small>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {state.phase !== "COMPLETE" && nextFixture && (
          <section className="career-panel clubhouse-prep" aria-labelledby="clubhouse-prep-heading">
            <div className="clubhouse-section-head">
              <h3 id="clubhouse-prep-heading">Match preparation</h3>
              {preview && (preview.dangerBatter || preview.dangerBowler) && (
                <p data-testid="fixture-danger">
                  <span className="clubhouse-label">Players to watch</span>{" "}
                  {preview.dangerBatter && <>{service.playerName(preview.dangerBatter.playerId)}, {preview.dangerBatter.text}. </>}
                  {preview.dangerBowler && <>{service.playerName(preview.dangerBowler.playerId)}, {preview.dangerBowler.text}.</>}
                </p>
              )}
            </div>
            <PitchInspection
              ground={displayWorld.grounds.find(
                (ground) => ground.groundId === nextFixture.groundId,
              )}
              format="T20"
            />
            {showTacticalBriefings &&
              (() => {
                const briefing = service.fixtureBriefing(
                  nextFixture.fixtureId,
                );
                return briefing ? (
                  <PreMatchBriefingPanel
                    briefing={briefing}
                    focusTeamId={controlledTeam}
                  />
                ) : null;
              })()}
          </section>
        )}
      </div>
    </section>
  );
}

type ActiveState = NonNullable<
  ReturnType<CareerApplicationService["getState"]>
>;
type PersistentWorld = ReturnType<
  CareerApplicationService["getPersistentState"]
>;

export type HomeScreenProps = {
  service: CareerApplicationService;
  state: ActiveState;
  persistentWorld: PersistentWorld;
  busy: boolean;
  inspectionOnly: boolean;
  action: (work: () => Promise<void>) => Promise<void>;
  nextFixture: ReturnType<CareerApplicationService["nextManagedFixture"]>;
  pendingMatch: { round: number | null } | null;
  playMatch: (pick?: {fixtureId:string;playerId:string}) => Promise<void>;
  /** Simulates the managed fixture and settles any pending match. */
  simulateMatch: () => Promise<void>;
  /** Closes the season and rolls over, then resets the replay and statistics scope. */
  closeSeason: () => Promise<void>;
  /** Copies a completed single season into a multi-season world, then resets the replay and statistics scope. */
  copyToPersistentWorld: () => Promise<void>;
  displayWorld: ReturnType<CareerApplicationService["getWorld"]>;
  showTacticalBriefings: boolean;
  controlledTeam: string | null;
  /** The club's table row. Kept for callers; the Clubhouse reads the whole table through clubStanding. */
  tableRow: ActiveState["projection"]["table"][number] | null;
  completedManaged: ActiveState["completedMatches"];
  /** Opens the post-match analysis of a completed fixture from its stored record (LC_POST_MATCH_ANALYSIS_ARCHIVE_V1). */
  openAnalysis?: (fixtureId: string) => Promise<void>;
  /** Opens a player's page from the squad strip; Back returns to the Clubhouse. */
  openPlayer?: (playerId: string) => void;
};
