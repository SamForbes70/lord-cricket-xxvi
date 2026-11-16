import { academyFocusOptions, directives, percentageBp } from "./format.js";
import type {
  AcademyTrainingFocus,
  TrainingDirective,
} from "@lcxxvi/contracts";
import {
  CareerApplicationService,
} from "./service.js";


/** The career Squad screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
export function SquadScreen(props: SquadScreenProps) {
  const {
    service,
    state,
    persistentWorld,
    busy,
    inspectionOnly,
    action,
    controlledTeam,
    displayWorld,
    economyState,
    lifecycleState,
    openPlayer,
  } = props;
  return (
        <section aria-labelledby="squad-heading">
          <h2 id="squad-heading">Squad</h2>
          <p>
            {lifecycleState
              ? "Daily training directives affect temporary readiness, daily fatigue recovery, and accumulated season exposure used for off-season fictional skill progression."
              : "Training changes affect temporary readiness and daily recovery only."}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  {lifecycleState && <th>Age</th>}
                  <th>Role</th>
                  {economyState && <th>Contract</th>}
                  <th>Availability</th>
                  <th>Fatigue</th>
                  <th>Bat</th>
                  <th>Bowl</th>
                  <th>Field</th>
                  <th>Training</th>
                </tr>
              </thead>
              <tbody>
                {service.squadView()?.players.map((condition) => {
                  const player = displayWorld.players.find(
                    (candidate) => candidate.playerId === condition.playerId,
                  )!;
                  const age = service.playerAge(player.birthDate);
                  const ledger = service.playerLifecycleLedgerEntry(player.playerId);
                  const contract = service.playerContract(player.playerId);
                  const lastNetDelta =
                    ledger
                      ? ledger.lastSeasonDelta.battingDelta +
                        ledger.lastSeasonDelta.bowlingDelta +
                        ledger.lastSeasonDelta.fieldingDelta
                      : 0;
                  return (
                    <tr key={condition.playerId}>
                      <td>
                        <button
                          type="button"
                          className="player-link"
                          id={`player-link-SQUAD-${player.playerId}`}
                          aria-label={`View ${player.name}`}
                          onClick={() => openPlayer(player.playerId, "SQUAD")}
                        >
                          {player.name}
                        </button>
                        <small>
                          {player.playerId}
                          {lastNetDelta !== 0
                            ? ` · Off-season ${lastNetDelta > 0 ? `+${lastNetDelta}` : lastNetDelta}`
                            : ""}
                        </small>
                      </td>
                      {lifecycleState && <td>{age ?? "–"}</td>}
                      <td>{player.role}</td>
                      {economyState && (
                        <td>
                          {contract ? (
                            <>
                              <strong>${contract.annualWageK}k/yr</strong>
                              <small>
                                Through S{contract.expiresAfterSeasonNumber}
                                {persistentWorld &&
                                contract.expiresAfterSeasonNumber ===
                                  persistentWorld.currentSeasonNumber
                                  ? " · Expiring"
                                  : ""}
                              </small>
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                      )}
                      <td>
                        {condition.availability}
                        {condition.availabilityReason ? (
                          <small>{condition.availabilityReason}</small>
                        ) : null}
                      </td>
                      <td>{percentageBp(condition.fatigueBp)}</td>
                      <td>
                        {condition.battingReadiness > 0 ? "+" : ""}
                        {condition.battingReadiness}
                      </td>
                      <td>
                        {condition.bowlingReadiness > 0 ? "+" : ""}
                        {condition.bowlingReadiness}
                      </td>
                      <td>
                        {condition.fieldingReadiness > 0 ? "+" : ""}
                        {condition.fieldingReadiness}
                      </td>
                      <td>
                        <label className="sr-label" htmlFor={`training-${condition.playerId}`}>
                          Training for {player.name}
                        </label>
                        <select
                          id={`training-${condition.playerId}`}
                          disabled={
                            busy ||
                            inspectionOnly ||
                            service.isReadOnly() ||
                            state.phase === "COMPLETE"
                          }
                          value={condition.directive}
                          onChange={(event) =>
                            void action(async () => {
                              await service.setTraining(
                                condition.playerId,
                                event.currentTarget.value as TrainingDirective,
                              );
                            })
                          }
                        >
                          {directives.map((directive) => (
                            <option key={directive} value={directive}>
                              {directive.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lifecycleState && (
            <section
              className="career-panel"
              aria-labelledby="youth-academy-heading"
              data-testid="youth-academy-panel"
              style={{ marginTop: "18px" }}
            >
              <h3 id="youth-academy-heading">Youth academy pathway</h3>
              <p>
                Academy prospects use fictional ceiling tiers (
                <code>{lifecycleState.model.modelVersion}</code>). Set training focus, queue
                prospects for automatic off-season promotion, or promote directly before Round 1.
              </p>
              {service.managedYouthAcademyProspects().length === 0 ? (
                <p>No active academy prospects remain for {service.teamName(controlledTeam)} this season.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Prospect</th>
                        <th>Age</th>
                        <th>Role</th>
                        <th>Ceiling tier</th>
                        <th>Key T20 skills</th>
                        <th>Academy focus</th>
                        <th>Off-season queue</th>
                        <th>Pre-season</th>
                      </tr>
                    </thead>
                    <tbody>
                      {service.managedYouthAcademyProspects().map((prospect) => {
                        const t20 = prospect.player.skills.T20;
                        const prospectAge = persistentWorld
                          ? Math.max(
                              16,
                              persistentWorld.currentCalendarYear -
                                Number.parseInt(prospect.player.birthDate.slice(0, 4), 10),
                            )
                          : 18;
                        const canPromoteNow =
                          state.phase === "ACTIVE" &&
                          state.completedMatches.length === 0 &&
                          !busy &&
                          !inspectionOnly &&
                          !service.isReadOnly();
                        return (
                          <tr key={prospect.prospectId} data-testid={`youth-row-${prospect.prospectId}`}>
                            <td>
                              <strong>{prospect.player.name}</strong>
                              <small>{prospect.prospectId}</small>
                            </td>
                            <td>{prospectAge}</td>
                            <td>{prospect.player.role.replaceAll("_", " ")}</td>
                            <td>{prospect.fictionalCeilingTier.replaceAll("_", " ")}</td>
                            <td>
                              Tim {t20.timing} · Pow {t20.power} · Ctl {t20.control} · Cat{" "}
                              {t20.catching}
                            </td>
                            <td>
                              <label
                                className="sr-label"
                                htmlFor={`academy-focus-${prospect.prospectId}`}
                              >
                                Academy focus for {prospect.player.name}
                              </label>
                              <select
                                id={`academy-focus-${prospect.prospectId}`}
                                disabled={busy || inspectionOnly || service.isReadOnly()}
                                value={prospect.academyFocus}
                                onChange={(event) =>
                                  void action(async () => {
                                    await service.setYouthProspectFocus(
                                      prospect.prospectId,
                                      event.currentTarget.value as AcademyTrainingFocus,
                                    );
                                  })
                                }
                              >
                                {academyFocusOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <label className="check-label">
                                <input
                                  type="checkbox"
                                  aria-label={`Queue ${prospect.player.name} for off-season promotion`}
                                  disabled={busy || inspectionOnly || service.isReadOnly()}
                                  checked={prospect.queuedForPromotion}
                                  onChange={(event) =>
                                    void action(async () => {
                                      await service.setYouthProspectQueue(
                                        prospect.prospectId,
                                        event.currentTarget.checked,
                                      );
                                    })
                                  }
                                />{" "}
                                Queue
                              </label>
                            </td>
                            <td>
                              <button
                                type="button"
                                disabled={!canPromoteNow}
                                aria-label={`Promote ${prospect.player.name} now`}
                                onClick={() =>
                                  void action(async () => {
                                    await service.promoteYouthProspectNow(prospect.prospectId);
                                  })
                                }
                              >
                                Promote now
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {lifecycleState && lifecycleState.retiredPlayers.length > 0 && (
            <section
              className="career-panel"
              aria-labelledby="retired-alumni-heading"
              data-testid="retired-players-panel"
              style={{ marginTop: "18px" }}
            >
              <h3 id="retired-alumni-heading">Retired alumni directory</h3>
              <p>Retired players keep permanent player pages, skill histories, and career statistics.</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Last club</th>
                      <th>Retired after</th>
                      <th>Age at retirement</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifecycleState.retiredPlayers.map((retired) => (
                      <tr key={retired.playerId}>
                        <td>
                          <button
                            type="button"
                            className="player-link"
                            id={`player-link-SQUAD-${retired.playerId}`}
                            aria-label={`View retired player ${retired.player.name}`}
                            onClick={() => openPlayer(retired.playerId, "SQUAD")}
                          >
                            {retired.player.name}
                          </button>
                          <small>{retired.playerId}</small>
                        </td>
                        <td>{service.teamName(retired.lastTeamId)}</td>
                        <td>
                          Season {retired.retiredAfterSeasonNumber} ({retired.retiredCalendarYear})
                        </td>
                        <td>{retired.ageAtRetirement}</td>
                        <td>{retired.retirementReason.replaceAll("_", " ").toLowerCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
  );
}

export type SquadScreenProps = {
  service: CareerApplicationService;
  state: NonNullable<ReturnType<CareerApplicationService["getState"]>>;
  persistentWorld: ReturnType<CareerApplicationService["getPersistentState"]>;
  busy: boolean;
  inspectionOnly: boolean;
  action: (work: () => Promise<void>) => Promise<void>;
  controlledTeam: string | null;
  displayWorld: ReturnType<CareerApplicationService["getWorld"]>;
  economyState: ReturnType<CareerApplicationService["getEconomyState"]>;
  lifecycleState: ReturnType<CareerApplicationService["getLifecycleState"]>;
  openPlayer: (id: string, origin: "SQUAD" | "STATISTICS" | "CONTRACTS" | "CAREER" | "FIXTURES") => void;
};
