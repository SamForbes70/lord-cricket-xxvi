import { TeamCrest } from "../world/TeamCrest.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { PreMatchBriefingPanel } from "../match/TacticalBriefingPanels.js";
import { percentageBp } from "./format.js";
import { CareerApplicationService } from "./service.js";

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
  return (
    <section aria-labelledby="home-heading">
      <h2 id="home-heading">Home</h2>
      <div className="dashboard-grid">
        <article className="career-panel emphasis fixture-lead" data-quay={nextFixture?.groundId === "ground-01"}>
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
  playMatch: () => Promise<void>;
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
