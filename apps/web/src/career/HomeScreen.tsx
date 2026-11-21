import { TeamCrest } from "../world/TeamCrest.js";
import { ART_WASH, groundArtBackground } from "../world/ground-art.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { PreMatchBriefingPanel } from "../match/TacticalBriefingPanels.js";
import { useState } from "react";
import { buildMatchReport, computeMatchAwardFromCompletion } from "@lcxxvi/projections";
import { percentageBp } from "./format.js";
import { MatchReportPanel, matchReportSeenKey, readReportSeen, writeReportSeen } from "./MatchReportPanel.js";
import { CareerApplicationService } from "./service.js";

export const selectionNoteKey = (
  save: string,
  season: string,
  fixture: string,
) => JSON.stringify(["lcxxvi-selection-focus", save, season, fixture]);

/** The career Home screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
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
    tableRow,
    completedManaged,
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
    </MatchReportPanel>
  ) : null;
  return (
    <section aria-labelledby="home-heading">
      <h2 id="home-heading">Home</h2>
      <div className="dashboard-grid">
        {reportOpen && reportPanel}
        <article className="career-panel emphasis fixture-lead" data-quay={nextFixture?.groundId === "ground-01"} data-art={nextFixture ? "true" : undefined} style={nextFixture ? groundArtBackground(service.groundName(nextFixture.groundId), ART_WASH.fixture) : undefined}>
          <h3>Next required action</h3>
          {state.phase === "COMPLETE" ? (
            <>
              <p className="big-stat">Season complete</p>
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
              <p className="fixture-round">Round {nextFixture.roundNumber} · T20</p>
              <p className="fixture-opponents">
                {[nextFixture.homeTeamId, nextFixture.awayTeamId].map((id, index) => (
                  <span key={id}>{index === 1 && <small>v </small>}
                    <TeamCrest teamId={id} name={service.teamName(id)} colours={displayWorld.teams.find(t => t.teamId === id)?.colours ?? []} size={34} decorative />
                    {service.teamName(id)}
                  </span>
                ))}
              </p>
              <p className="fixture-venue">{nextFixture.matchDayDate} · {service.groundName(nextFixture.groundId)}</p>
              {state.careerState.currentDate < nextFixture.matchDayDate ? (
                <button
                  className="primary"
                  disabled={busy || inspectionOnly || service.isReadOnly()}
                  onClick={() =>
                    action(async () => {
                      await service.simulateToNextUserFixture();
                    })
                  }
                >
                  Advance to match day
                </button>
              ) : (
                <div className="action-row">
                  <button
                    disabled={busy || inspectionOnly || service.isReadOnly()}
                    onClick={() => action(simulateMatch)}
                  >
                    Simulate match
                  </button>
                  <button
                    disabled={busy || inspectionOnly || service.isReadOnly()}
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
                  {budget && (
                    <small>
                      Club wages committed · {budget.committedWagesK}k of{" "}
                      {budget.annualWageBudgetK}k
                    </small>
                  )}
                </section>
              )}
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
            </>
          ) : (
            <p>No remaining managed fixture.</p>
          )}
        </article>
        {!reportOpen && reportPanel}
        <article className="career-panel">
          <h3>League position</h3>
          <p className="big-stat">{tableRow ? `#${tableRow.rank}` : "–"}</p>
          {tableRow && (
            <p>
              {tableRow.wins}W · {tableRow.losses}L · {tableRow.ties}T ·{" "}
              {tableRow.noResults}NR · {tableRow.points} pts · NRR{" "}
              {tableRow.nrrX1000 === null
                ? "–"
                : (tableRow.nrrX1000 / 1000).toFixed(3)}
            </p>
          )}
        </article>
        <article className="career-panel">
          <h3>Condition</h3>
          {(() => {
            const squad = service.squadView();
            const avg = squad
              ? Math.round(
                  squad.players.reduce(
                    (sum, player) => sum + player.fatigueBp,
                    0,
                  ) / squad.players.length,
                )
              : 0;
            const unavailable =
              squad?.players.filter(
                (player) => player.availability === "UNAVAILABLE",
              ).length ?? 0;
            return (
              <>
                <p className="big-stat">{percentageBp(avg)} fatigue</p>
                <p>
                  {unavailable} unavailable ·{" "}
                  {squad?.players.filter((p) => p.directive !== "REST")
                    .length ?? 0}{" "}
                  in practice
                </p>
              </>
            );
          })()}
        </article>
        <article className="career-panel">
          <h3>Progress</h3>
          <p className="big-stat">{state.completedMatches.length}/56</p>
          <p>{completedManaged.length}/14 managed-team fixtures complete.</p>
          {persistentWorld && (
            <p data-testid="persistent-world-progress">
              Season {persistentWorld.currentSeasonNumber} (
              {persistentWorld.currentCalendarYear}) ·{" "}
              {persistentWorld.completedSeasons.length} completed{" "}
              {persistentWorld.completedSeasons.length === 1
                ? "season"
                : "seasons"}
            </p>
          )}
        </article>
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
  tableRow: ActiveState["projection"]["table"][number] | null;
  completedManaged: ActiveState["completedMatches"];
};
