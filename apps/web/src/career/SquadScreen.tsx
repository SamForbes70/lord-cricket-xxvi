import { AboutDetails } from "../AboutDetails.js";
import { academyFocusOptions, directives, percentageBp } from "./format.js";
import type {
  AcademyTrainingFocus,
  TrainingDirective,
} from "@lcxxvi/contracts";
import {
  CareerApplicationService,
} from "./service.js";
import { PlayerPortrait, RatingBadge, RoleChip } from "../world/PlayerPortrait.js";
import { overallRating, playerStrengths } from "../world/player-visuals.js";
import { useMemo } from "react";
import { isBowlingCapable } from "@lcxxvi/data";
import { playerForm, playerMilestones, playingStyle, squadPlayerTags } from "@lcxxvi/projections";
import { TRAINING_PRESETS, matchingPreset, planTrainingPreset, type TrainingPresetPlayer } from "./training-presets.js";

/** Display labels for the stored youth intake tier. The tier only sets a starting-skill bonus (+0, +2 or +5); see generateYouthProspect. */
const INTAKE_GRADE_LABEL: Record<"ACADEMY_GRADUATE" | "FIRST_TEAM_PROSPECT" | "HIGH_CEILING_PROSPECT", string> = {
  ACADEMY_GRADUATE: "Standard intake (+0)",
  FIRST_TEAM_PROSPECT: "Good intake (+2)",
  HIGH_CEILING_PROSPECT: "Top intake (+5)",
};

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
  // E6: what each player is known for (from skills), recent form (from this season's scorecards) and
  // career milestones in reach (from recorded career totals). Derived here; nothing is saved.
  const squadIds = (service.squadView()?.players ?? []).map((condition) => condition.playerId);
  const identityTags = squadPlayerTags(
    squadIds.flatMap((playerId) => {
      const player = displayWorld.players.find((candidate) => candidate.playerId === playerId);
      return player ? [{ playerId, role: player.role, bowlingCapable: isBowlingCapable(player), skills: player.skills.T20 }] : [];
    }),
  );
  // Career totals are rebuilt from every completed match, so they are computed once per saved state.
  const careerTotals = useMemo(() => {
    const records = service.historicalStatistics({})?.players ?? [];
    return new Map(records.map((record) => [record.playerId, { runs: record.runs, wickets: record.bowlingWickets, matches: record.matches }]));
  }, [service, state]);
  const trendMark = { UP: "\u25B2", LEVEL: "\u25B6", DOWN: "\u25BC" } as const;
  const trendWord = { UP: "Form rising", LEVEL: "Form steady", DOWN: "Form falling" } as const;
  const presetPlayers: TrainingPresetPlayer[] = (service.squadView()?.players ?? []).flatMap((condition) => {
    const player = displayWorld.players.find((candidate) => candidate.playerId === condition.playerId);
    if (!player) return [];
    const strengths = playerStrengths(player, "T20");
    return [{
      playerId: condition.playerId, role: player.role, bowlingCapable: isBowlingCapable(player),
      battingStrength: strengths.batting, bowlingStrength: strengths.bowling, fatigueBp: condition.fatigueBp, directive: condition.directive,
    }];
  });
  const activePreset = matchingPreset(presetPlayers);
  const trainingLocked = busy || inspectionOnly || service.isReadOnly() || state.phase === "COMPLETE";
  return (
        <section aria-labelledby="squad-heading">
          <h2 id="squad-heading">Squad</h2>
          <p>
            {lifecycleState
              ? "Daily training directives affect temporary readiness, daily fatigue recovery, and accumulated season exposure used for off-season fictional skill progression."
              : "Training changes affect temporary readiness and daily recovery only."}
          </p>
          <div className="training-presets" role="group" aria-labelledby="training-presets-heading" data-testid="training-presets">
            <h3 id="training-presets-heading">Squad training</h3>
            <p>Set everyone at once, then change any player in the table below.</p>
            <div className="training-preset-options">
              {TRAINING_PRESETS.map((preset) => {
                const plan = planTrainingPreset(preset.id, presetPlayers);
                return (
                  <div key={preset.id} data-active={activePreset === preset.id}>
                    <button
                      type="button"
                      data-testid={`training-preset-${preset.id}`}
                      aria-pressed={activePreset === preset.id}
                      disabled={trainingLocked || plan.changes.length === 0}
                      onClick={() =>
                        void action(async () => {
                          for (const change of plan.changes) await service.setTraining(change.playerId, change.directive);
                        })
                      }
                    >
                      {preset.label}
                    </button>
                    <small>{preset.description} {plan.summary}</small>
                  </div>
                );
              })}
            </div>
            <p data-testid="training-preset-current">
              {activePreset ? `Current plan: ${TRAINING_PRESETS.find((preset) => preset.id === activePreset)!.label}.` : "Current plan: your own mix."}
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  {lifecycleState && <th>Age</th>}
                  <th>Role</th>
                  <th>Form</th>
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
                  const kit =
                    displayWorld.teams.find((team) => team.squadIds.includes(player.playerId))?.colours ??
                    displayWorld.teams.find((team) => team.teamId === controlledTeam)?.colours ??
                    [];
                  return (
                    <tr key={condition.playerId}>
                      <td className="player-cell">
                        <div className="player-cell-inner">
                        <PlayerPortrait playerId={player.playerId} role={player.role} kit={kit} size={46} />
                        <span className="player-cell-name">
                          <button
                            type="button"
                            className="player-link"
                            id={`player-link-SQUAD-${player.playerId}`}
                            aria-label={`View ${player.name}`}
                            onClick={() => openPlayer(player.playerId, "SQUAD")}
                          >
                            {player.name}
                          </button>
                          {(() => {
                            // LC_PLAYER_IDENTITY_V1: the playing style read from this player's T20 ratings.
                            const style = playingStyle({ playerId: player.playerId, role: player.role, bowlingStyle: player.bowlingStyle, skills: player.skills.T20 }).primary;
                            return <span className="style-tag" data-testid={`player-style-${player.playerId}`} title="Playing style, from T20 ratings">{style.label}</span>;
                          })()}
                          <small data-testid={`player-tags-${player.playerId}`}>
                            {(identityTags[player.playerId] ?? []).map((tag) => (
                              <span key={tag.id} className="identity-tag" title={`${tag.label}: ${tag.value}`}>{tag.label}</span>
                            ))}
                            {lastNetDelta !== 0
                              ? ` Off-season ${lastNetDelta > 0 ? `+${lastNetDelta}` : lastNetDelta}`
                              : ""}
                          </small>
                          {playerMilestones(careerTotals.get(player.playerId) ?? { runs: 0, wickets: 0, matches: 0 }).map((milestone) => (
                            <small key={milestone.kind} className="identity-milestone" data-testid={`player-milestone-${player.playerId}`}>{milestone.text}</small>
                          ))}
                        </span>
                        <RatingBadge rating={overallRating(player, "T20")} label="T20" />
                        </div>
                      </td>
                      {lifecycleState && <td>{age ?? "–"}</td>}
                      <td><RoleChip role={player.role} /></td>
                      <td data-testid={`player-form-${player.playerId}`}>
                        {(() => {
                          const form = playerForm(state.completedMatches, player.playerId);
                          if (form.entries.length === 0) return <small>No innings or spell yet</small>;
                          return (
                            <>
                              {form.trend && <span className="identity-trend" data-trend={form.trend} role="img" aria-label={trendWord[form.trend]}>{trendMark[form.trend]}</span>}{" "}
                              <small>{form.text}</small>
                            </>
                          );
                        })()}
                      </td>
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
                Set each prospect's training focus, queue them for promotion at the end of the season,
                or promote them now, before Round 1.
                <AboutDetails summary="About the player model">
                  Each prospect has an intake grade, set when they join the academy (
                  <code>{lifecycleState.model.modelVersion}</code>). The grade adds 0, 2 or 5 to their
                  starting skills only. It does not change how they develop afterwards.
                </AboutDetails>
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
                        <th>Intake grade</th>
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
                            <td>{INTAKE_GRADE_LABEL[prospect.fictionalCeilingTier]}</td>
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
