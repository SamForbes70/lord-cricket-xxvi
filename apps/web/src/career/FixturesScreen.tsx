import { formatGameDate } from "./format.js";
import { TeamCrest } from "../world/TeamCrest.js";
import type { ReactNode } from "react";
import { PreMatchBriefingPanel } from "../match/TacticalBriefingPanels.js";
import { CareerApplicationService } from "./service.js";
import { NoValue } from "../NoValue.js";

/** The career Fixtures screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
export function FixturesScreen(props: FixturesScreenProps) {
  const {
    service,
    state,
    busy,
    nextFixture,
    showTacticalBriefings,
    controlledTeam,
    completionByFixture,
    openReplay,
    replayViewerSection,
  } = props;
  return (
    <section aria-labelledby="fixtures-heading">
      <h2 id="fixtures-heading">Fixtures</h2>
      {replayViewerSection}
      {nextFixture &&
        showTacticalBriefings &&
        (() => {
          const briefing = service.fixtureBriefing(nextFixture.fixtureId);
          return briefing ? (
            <div style={{ marginBottom: "14px" }}>
              <PreMatchBriefingPanel
                briefing={briefing}
                focusTeamId={controlledTeam}
              />
            </div>
          ) : null;
        })()}
      {state.schedule.rounds.map((round) => (
        <section
          className="round-block"
          key={round.roundNumber}
          aria-labelledby={`round-${round.roundNumber}`}
        >
          <h3 id={`round-${round.roundNumber}`}>
            Round {round.roundNumber} · {formatGameDate(round.matchDayDate)}
          </h3>
          <div className="table-wrap">
            <table className="fixtures-table">
              <thead>
                <tr>
                  <th>Home</th>
                  <th>Away</th>
                  <th>Ground</th>
                  <th>Status</th>
                  <th>Result</th>
                  <th>Replay and analysis</th>
                </tr>
              </thead>
              <tbody>
                {state.schedule.fixtures
                  .filter(
                    (fixture) => fixture.roundNumber === round.roundNumber,
                  )
                  .map((fixture) => {
                    const completion = completionByFixture.get(
                      fixture.fixtureId,
                    );
                    const managed = [
                      fixture.homeTeamId,
                      fixture.awayTeamId,
                    ].includes(controlledTeam!);
                    const replayBtnId = `replay-fixtures-${fixture.fixtureId}`;
                    return (
                      <tr
                        key={fixture.fixtureId}
                        className={managed ? "managed-fixture" : ""}
                      >
                        {[fixture.homeTeamId, fixture.awayTeamId].map(id => (
                          <td key={id}><TeamCrest teamId={id} name={service.teamName(id)} colours={service.getWorld().teams.find(t => t.teamId === id)?.colours ?? []} size={20} decorative />{service.teamName(id)}</td>
                        ))}
                        <td>{service.groundName(fixture.groundId)}</td>
                        <td>
                          {completion ? "Completed" : "Scheduled"}
                          {managed ? <small>Managed fixture</small> : null}
                        </td>
                        <td>
                          {completion ? service.resultText(completion) : <NoValue />}
                        </td>
                        <td>
                          {completion ? (
                            <button
                              id={replayBtnId}
                              type="button"
                              className="replay-btn"
                              disabled={busy}
                              aria-label={`View replay for ${service.teamName(fixture.homeTeamId)} v ${service.teamName(fixture.awayTeamId)}`}
                              onClick={() =>
                                void openReplay(fixture.fixtureId, replayBtnId)
                              }
                            >
                              View replay
                            </button>
                          ) : null}
                          {completion ? (
                            <button
                              id={`analysis-fixtures-${fixture.fixtureId}`}
                              type="button"
                              className="replay-btn"
                              data-testid="fixture-post-match-analysis"
                              disabled={busy}
                              aria-label={`Post-match analysis for ${service.teamName(fixture.homeTeamId)} v ${service.teamName(fixture.awayTeamId)}`}
                              onClick={() =>
                                void openReplay(fixture.fixtureId, `analysis-fixtures-${fixture.fixtureId}`, "ANALYSIS")
                              }
                            >
                              Post-match analysis
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
      ))}
    </section>
  );
}

type ActiveState = NonNullable<
  ReturnType<CareerApplicationService["getState"]>
>;

export type FixturesScreenProps = {
  service: CareerApplicationService;
  state: ActiveState;
  busy: boolean;
  nextFixture: ReturnType<CareerApplicationService["nextManagedFixture"]>;
  showTacticalBriefings: boolean;
  controlledTeam: string | null;
  completionByFixture: Map<string, ActiveState["completedMatches"][number]>;
  openReplay: (fixtureId: string, triggerId: string, focus?: "ANALYSIS") => Promise<void>;
  replayViewerSection: ReactNode;
};
