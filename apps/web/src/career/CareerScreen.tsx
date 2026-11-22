import { formatGameDate } from "./format.js";
import { AboutDetails } from "../AboutDetails.js";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CareerStoryCard } from "@lcxxvi/contracts";
import { CareerStoriesPanel } from "./CareerStoriesPanel.js";
import {
  CareerApplicationService,
} from "./service.js";


/** The career Career screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
export function CareerScreen(props: CareerScreenProps) {
  const {
    service,
    state,
    persistentWorld,
    busy,
    controlledTeam,
    completionByFixture,
    currentRound,
    historySeasonView,
    setHistorySeasonView,
    inspectedCompletedSeason,
    latestEconomyTransition,
    latestTransition,
    lifecycleState,
    openReplay,
    replayViewerSection,
    tableRow,
    careerStories,
  } = props;
  return (
        <section aria-labelledby="career-heading">
          <h2 id="career-heading">Career</h2>
          <div className="career-summary-grid">
            <div className="career-panel">
              <h3>Season status</h3>
              <p>
                {persistentWorld
                  ? `Season ${persistentWorld.currentSeasonNumber} (${persistentWorld.currentCalendarYear}) · ${state.phase}`
                  : state.phase}
              </p>
              <p>{formatGameDate(state.careerState.currentDate)}</p>
              <p>Round {currentRound} of 14</p>
              {persistentWorld && (
                <small>
                  {persistentWorld.completedSeasons.length} completed{" "}
                  {persistentWorld.completedSeasons.length === 1 ? "season" : "seasons"}
                  <AboutDetails summary="About this world">
                    World <code>{persistentWorld.worldIdentity.worldId}</code>
                  </AboutDetails>
                </small>
              )}
            </div>
            <div className="career-panel">
              <h3>Managed record</h3>
              <p>
                {tableRow?.wins ?? 0} wins · {tableRow?.losses ?? 0} losses · {tableRow?.ties ?? 0}{" "}
                ties
              </p>
              <p>{tableRow?.points ?? 0} points (active season)</p>
              {persistentWorld && (() => {
                const allTime = persistentWorld.careerProjection.teamHistory.find(
                  (row) => row.teamId === controlledTeam,
                );
                if (!allTime) return null;
                return (
                  <p data-testid="managed-all-time-summary">
                    All-time: {allTime.titles}{" "}
                    {allTime.titles === 1 ? "title" : "titles"} · {allTime.wins}W · {allTime.losses}L
                    · {allTime.ties}T ({allTime.played} played)
                  </p>
                );
              })()}
            </div>
          </div>
          {replayViewerSection}
          {latestTransition && (
            <section
              className="career-panel"
              aria-labelledby="lifecycle-transition-heading"
              data-testid="offseason-lifecycle-report"
              style={{ marginTop: "18px", marginBottom: "18px" }}
            >
              <h3 id="lifecycle-transition-heading">
                Off-season lifecycle report · Season {latestTransition.fromSeasonNumber} to Season{" "}
                {latestTransition.toSeasonNumber} ({latestTransition.calendarYear})
              </h3>
              <p>
                Off-season changes: players age, training takes effect, some retire and young players
                join.
                <AboutDetails summary="About the player model">
                  Fictional lifecycle parameters <code>{lifecycleState?.model.modelVersion}</code>.
                </AboutDetails>
              </p>
              <p>
                <strong>{latestTransition.agedPlayerCount}</strong> aged ·{" "}
                <strong>{latestTransition.developedPlayers.length}</strong> developed ·{" "}
                <strong>{latestTransition.retiredPlayerIds.length}</strong> retired ·{" "}
                <strong>{latestTransition.promotedYouthIds.length}</strong> youth promoted ·{" "}
                <strong>{latestTransition.generatedYouthIds.length}</strong> new academy prospects
              </p>
              {latestTransition.retiredPlayerIds.length > 0 && (
                <p>
                  Retirements:{" "}
                  {latestTransition.retiredPlayerIds
                    .map((id) => service.playerName(id))
                    .join(", ")}
                </p>
              )}
            </section>
          )}
          {latestEconomyTransition && (
            <section
              className="career-panel"
              aria-labelledby="economy-transition-heading"
              data-testid="offseason-economy-report"
              style={{ marginTop: "18px", marginBottom: "18px" }}
            >
              <h3 id="economy-transition-heading">
                Off-season contracts &amp; budget report · Season{" "}
                {latestEconomyTransition.fromSeasonNumber} to Season{" "}
                {latestEconomyTransition.toSeasonNumber} ({latestEconomyTransition.calendarYear})
              </h3>
              <p>
                <strong>{latestEconomyTransition.expiredToFreeAgencyIds.length}</strong> contracts
                expired to free agency ·{" "}
                <strong>{latestEconomyTransition.youthContractsSignedIds.length}</strong> youth
                rookie contracts signed ·{" "}
                <strong>{latestEconomyTransition.aiOffseasonFreeAgentSigningsIds.length}</strong>{" "}
                off-season AI signings ·{" "}
                <strong>{latestEconomyTransition.minimumTopupSignedIds.length}</strong> minimum-squad
                fill signings
              </p>
            </section>
          )}
          {persistentWorld && persistentWorld.completedSeasons.length > 0 && (
            <section
              className="career-panel"
              aria-labelledby="season-history-heading"
              data-testid="completed-seasons-history"
              style={{ marginTop: "18px", marginBottom: "22px" }}
            >
              <h3 id="season-history-heading">Season history &amp; roll of honour</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Champion</th>
                      <th>Runner-up</th>
                      <th>Managed finish</th>
                      <th>Leading runs</th>
                      <th>Leading wickets</th>
                      <th>Season awards</th>
                      <th>Archive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistentWorld.completedSeasons.map((record) => {
                      const managedRow = record.table.find((r) => r.teamId === controlledTeam);
                      const topRuns = record.leaders.runs[0] ?? null;
                      const topWkts = record.leaders.wickets[0] ?? null;
                      const isInspecting = historySeasonView === record.seasonNumber;
                      return (
                        <tr key={record.seasonId}>
                          <td>
                            Season {record.seasonNumber} · {record.calendarYear}
                            <small>
                              {formatGameDate(record.startDate)} to {formatGameDate(record.endDate)}
                            </small>
                          </td>
                          <td>
                            <strong>{service.teamName(record.championTeamId)}</strong>
                          </td>
                          <td>{service.teamName(record.runnerUpTeamId)}</td>
                          <td>
                            {managedRow
                              ? `#${managedRow.rank} (${managedRow.wins}W-${managedRow.losses}L, ${managedRow.points} pts)`
                              : "–"}
                          </td>
                          <td>
                            {topRuns
                              ? `${service.playerName(topRuns.playerId)} (${topRuns.value})`
                              : "–"}
                          </td>
                          <td>
                            {topWkts
                              ? `${service.playerName(topWkts.playerId)} (${topWkts.value})`
                              : "–"}
                          </td>
                          <td data-testid={`season-awards-cell-${record.seasonNumber}`}>
                            {(() => {
                              const summary = service.getSeasonAwards(record.seasonNumber);
                              if (!summary) {
                                return <span aria-label="Season awards pending">Pending</span>;
                              }
                              const awarded = summary.awards.filter(
                                (award) => award.status === "AWARDED" && award.winnerPlayerId,
                              );
                              return (
                                <small className="season-awards-list">
                                  {awarded.map((award, index) => (
                                    <span key={award.category}>
                                      {index > 0 && " · "}
                                      <strong>{service.playerName(award.winnerPlayerId!)}</strong>{" "}
                                      ({award.label})
                                    </span>
                                  ))}
                                </small>
                              );
                            })()}
                          </td>
                          <td>
                            <button
                              type="button"
                              aria-pressed={isInspecting}
                              onClick={() =>
                                setHistorySeasonView(isInspecting ? null : record.seasonNumber)
                              }
                            >
                              {isInspecting ? "Hide archive" : `Inspect Season ${record.seasonNumber}`}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {inspectedCompletedSeason && (
                <div data-testid={`archived-season-detail-${inspectedCompletedSeason.seasonNumber}`}>
                  <h4>
                    Archived Season {inspectedCompletedSeason.seasonNumber} ({
                      inspectedCompletedSeason.calendarYear
                    }) · Managed fixtures &amp; replay
                  </h4>
                  <p>
                    Sealed record SHA-256:{" "}
                    <code>{inspectedCompletedSeason.recordSha256.slice(0, 16)}…</code> · Final state
                    SHA-256:{" "}
                    <code>{inspectedCompletedSeason.finalSeasonStateSha256.slice(0, 16)}…</code>
                  </p>
                  <div className="table-wrap">
                    <table className="round-table">
                      <thead>
                        <tr>
                          <th>Rnd</th>
                          <th>Date</th>
                          <th>Fixture</th>
                          <th>Result</th>
                          <th>Replay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectedCompletedSeason.completedMatches
                          .filter((m) =>
                            [m.homeTeamId, m.awayTeamId].includes(controlledTeam ?? ""),
                          )
                          .map((completion) => {
                            const replayBtnId = `replay-history-${completion.fixtureId}`;
                            return (
                              <tr key={completion.fixtureId}>
                                <td>{completion.roundNumber}</td>
                                <td>{formatGameDate(completion.matchDayDate)}</td>
                                <td>
                                  {service.teamName(completion.homeTeamId)} v{" "}
                                  {service.teamName(completion.awayTeamId)}
                                </td>
                                <td>{service.resultText(completion)}</td>
                                <td>
                                  <button
                                    id={replayBtnId}
                                    type="button"
                                    className="replay-btn"
                                    disabled={busy}
                                    onClick={() => void openReplay(completion.fixtureId, replayBtnId)}
                                  >
                                    View replay
                                  </button>
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
          <h3>Managed-team results (active season)</h3>
          <div className="table-wrap">
            <table className="round-table">
              <thead>
                <tr>
                  <th>Rnd</th>
                  <th>Date</th>
                  <th>Fixture</th>
                  <th>Result</th>
                  <th>Replay</th>
                </tr>
              </thead>
              <tbody>
                {state.schedule.fixtures
                  .filter((fixture) =>
                    [fixture.homeTeamId, fixture.awayTeamId].includes(controlledTeam!),
                  )
                  .map((fixture) => {
                    const completion = completionByFixture.get(fixture.fixtureId);
                    const replayBtnId = `replay-career-${fixture.fixtureId}`;
                    return (
                      <tr key={fixture.fixtureId}>
                        <td>{fixture.roundNumber}</td>
                        <td>{formatGameDate(fixture.matchDayDate)}</td>
                        <td>
                          {service.teamName(fixture.homeTeamId)} v{" "}
                          {service.teamName(fixture.awayTeamId)}
                        </td>
                        <td>{completion ? service.resultText(completion) : "Scheduled"}</td>
                        <td>
                          {completion ? (
                            <button
                              id={replayBtnId}
                              type="button"
                              className="replay-btn"
                              disabled={busy}
                              aria-label={`View replay for Round ${fixture.roundNumber} ${service.teamName(fixture.homeTeamId)} v ${service.teamName(fixture.awayTeamId)}`}
                              onClick={() => void openReplay(fixture.fixtureId, replayBtnId)}
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
          <CareerStoriesPanel
            stories={careerStories}
            title="Career Stories & Club Digest"
            testId="career-stories"
            withControls
            busy={busy}
            onOpenReplay={(fixtureId, triggerId) => void openReplay(fixtureId, triggerId)}
          />
        </section>
  );
}

type ActiveState = NonNullable<ReturnType<CareerApplicationService["getState"]>>;
type PersistentWorld = ReturnType<CareerApplicationService["getPersistentState"]>;

export type CareerScreenProps = {
  service: CareerApplicationService;
  state: ActiveState;
  persistentWorld: PersistentWorld;
  busy: boolean;
  controlledTeam: string | null;
  completionByFixture: Map<string, ActiveState["completedMatches"][number]>;
  currentRound: number;
  historySeasonView: number | null;
  setHistorySeasonView: Dispatch<SetStateAction<number | null>>;
  inspectedCompletedSeason: NonNullable<PersistentWorld>["completedSeasons"][number] | null;
  latestEconomyTransition: ReturnType<CareerApplicationService["latestEconomyTransition"]>;
  latestTransition: ReturnType<CareerApplicationService["latestLifecycleTransition"]>;
  lifecycleState: ReturnType<CareerApplicationService["getLifecycleState"]>;
  openReplay: (fixtureId: string, triggerId: string) => Promise<void>;
  replayViewerSection: ReactNode;
  tableRow: ActiveState["projection"]["table"][number] | null;
  /** Stage 11 story cards, oldest first. */
  careerStories: readonly CareerStoryCard[];
};
