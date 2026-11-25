import { formatGameDate } from "./format.js";
import { AboutDetails } from "../AboutDetails.js";
import type { Dispatch, SetStateAction } from "react";
import {
  MAX_ACTIVE_TEAM_SQUAD_SIZE,
  MIN_ACTIVE_TEAM_SQUAD_SIZE,
} from "@lcxxvi/contracts";
import {
  CareerApplicationService,
} from "./service.js";


/** The career Contracts screen (split out of CareerApp.tsx, audit Phase 5); behaviour unchanged. */
export function ContractsScreen(props: ContractsScreenProps) {
  const {
    service,
    state,
    persistentWorld,
    busy,
    inspectionOnly,
    action,
    controlledTeam,
    team,
    displayWorld,
    economyState,
    managedBudget,
    freeAgentRoleFilter,
    setFreeAgentRoleFilter,
    ledgerScope,
    setLedgerScope,
    getOfferDraft,
    updateOfferDraft,
    openPlayer,
  } = props;
  return (
        <section aria-labelledby="contracts-heading" data-testid="contracts-screen">
          <h2 id="contracts-heading">Contracts &amp; Recruitment</h2>
          {!economyState || !persistentWorld ? (
            <div className="career-panel">
              <p>
                Contracts, wage budgets and free agents need a career with contracts. Start a new career,
                or make a contracts copy of this one from the Career screen.
                <AboutDetails summary="About this save">
                  Requires save format <code>LC_PERSISTENT_WORLD_V3_ECONOMY</code> (Stage 4).
                </AboutDetails>
              </p>
            </div>
          ) : (
            <>
              <div className="dashboard-grid" data-testid="club-budget-summary">
                <article className="career-panel emphasis">
                  <h3>{service.teamName(controlledTeam)} wage budget</h3>
                  <p className="big-stat">
                    ${managedBudget?.availableWageSpaceK ?? 0}k available
                  </p>
                  <p>
                    Committed: <strong>${managedBudget?.committedWagesK ?? 0}k</strong> · Dead cap:{" "}
                    <strong>${managedBudget?.deadCapWagesK ?? 0}k</strong> · Reserved offers:{" "}
                    <strong>${managedBudget?.pendingOfferReservedWagesK ?? 0}k</strong> · Cap:{" "}
                    <strong>${managedBudget?.annualWageBudgetK ?? 2500}k</strong>
                  </p>
                  <p>
                    Squad size: <strong>{team?.squadIds.length ?? 0}</strong> ({
                      MIN_ACTIVE_TEAM_SQUAD_SIZE
                    }–{MAX_ACTIVE_TEAM_SQUAD_SIZE} allowed)
                  </p>
                </article>
                <article className="career-panel" data-testid="negotiation-window-panel">
                  <h3>Pre-season negotiation window</h3>
                  <p className="big-stat">
                    {economyState.negotiationWindow.windowPhase === "OPEN"
                      ? `Open · Round ${economyState.negotiationWindow.currentRound} of ${economyState.negotiationWindow.maxRounds}`
                      : "Closed (match play active)"}
                  </p>
                  <p>
                    {economyState.negotiationWindow.windowPhase === "OPEN"
                      ? "Submit contract renewals or free-agent bids, then advance the negotiation round. AI clubs bid simultaneously under the exact same $2,500k cap and public stats."
                      : "In-season match play has started. Contract offers reopen after season rollover."}
                  </p>
                  {economyState.negotiationWindow.windowPhase === "OPEN" &&
                    state.completedMatches.length === 0 && (
                      <div className="action-row" style={{ marginTop: "8px" }}>
                        <button
                          type="button"
                          className="primary"
                          data-testid="resolve-negotiation-round-btn"
                          disabled={busy || inspectionOnly || service.isReadOnly()}
                          onClick={() =>
                            void action(async () => {
                              await service.resolveNegotiationRound();
                            })
                          }
                        >
                          Resolve negotiation round {economyState.negotiationWindow.currentRound}
                        </button>
                      </div>
                    )}
                </article>
              </div>

              {economyState.negotiationWindow.offers.length > 0 && (
                <section
                  className="career-panel"
                  aria-labelledby="active-offers-heading"
                  data-testid="contract-offers-panel"
                  style={{ marginTop: "18px" }}
                >
                  <h3 id="active-offers-heading">Negotiation offers (Season {persistentWorld.currentSeasonNumber})</h3>
                  <div className="table-wrap">
                    <table className="round-table">
                      <thead>
                        <tr>
                          <th>Rnd</th>
                          <th>Club</th>
                          <th>Player</th>
                          <th>Type</th>
                          <th>Offer</th>
                          <th>Status</th>
                          <th>Notes / Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...economyState.negotiationWindow.offers]
                          .sort((a, b) => {
                            const aManaged = a.offeringTeamId === controlledTeam ? 0 : 1;
                            const bManaged = b.offeringTeamId === controlledTeam ? 0 : 1;
                            if (aManaged !== bManaged) return aManaged - bManaged;
                            return b.roundSubmitted - a.roundSubmitted || a.offerId.localeCompare(b.offerId);
                          })
                          .map((offer) => {
                            const isManagedOffer = offer.offeringTeamId === controlledTeam;
                            const canAct =
                              isManagedOffer &&
                              economyState.negotiationWindow.windowPhase === "OPEN" &&
                              state.completedMatches.length === 0 &&
                              !busy &&
                              !inspectionOnly &&
                              !service.isReadOnly();
                            return (
                              <tr key={offer.offerId} data-testid={`offer-row-${offer.offerId}`}>
                                <td>R{offer.roundSubmitted}</td>
                                <td>{service.teamName(offer.offeringTeamId)}</td>
                                <td>{service.playerName(offer.playerId)}</td>
                                <td>{offer.offerKind.replaceAll("_", " ")}</td>
                                <td>
                                  ${offer.annualWageK}k/yr × {offer.termSeasons}y
                                  {offer.counterAnnualWageK !== null &&
                                    offer.counterTermSeasons !== null && (
                                      <small>
                                        Counter: ${offer.counterAnnualWageK}k/yr ×{" "}
                                        {offer.counterTermSeasons}y
                                      </small>
                                    )}
                                </td>
                                <td>
                                  <strong>{offer.status}</strong>
                                </td>
                                <td>
                                  <small>{offer.rationale}</small>
                                  {canAct &&
                                    (offer.status === "PENDING_ROUND" ||
                                      offer.status === "COUNTERED") && (
                                      <div className="action-row" style={{ marginTop: "4px" }}>
                                        {offer.status === "COUNTERED" && (
                                          <button
                                            type="button"
                                            data-testid={`accept-counter-${offer.offerId}`}
                                            onClick={() =>
                                              void action(async () => {
                                                await service.acceptCounterOffer(offer.offerId);
                                              })
                                            }
                                          >
                                            Accept counter
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          data-testid={`withdraw-offer-${offer.offerId}`}
                                          onClick={() =>
                                            void action(async () => {
                                              await service.withdrawContractOffer(offer.offerId);
                                            })
                                          }
                                        >
                                          Withdraw
                                        </button>
                                      </div>
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

              <section
                className="career-panel"
                aria-labelledby="managed-contracts-heading"
                data-testid="managed-contracts-panel"
                style={{ marginTop: "18px" }}
              >
                <h3 id="managed-contracts-heading">
                  {service.teamName(controlledTeam)} squad contracts
                </h3>
                <p>
                  Players whose deals expire after Season {persistentWorld.currentSeasonNumber} enter
                  free agency at rollover unless renewed during the open negotiation window.
                </p>
                <div className="table-wrap">
                  <table className="contracts-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Age</th>
                        <th>Role</th>
                        <th>Wage</th>
                        <th>Expires</th>
                        <th>Renewal / Release</th>
                      </tr>
                    </thead>
                    <tbody>
                      {economyState.contracts
                        .filter((c) => c.teamId === controlledTeam)
                        .map((contract) => {
                          const player = displayWorld.players.find(
                            (p) => p.playerId === contract.playerId,
                          );
                          if (!player) return null;
                          const age = service.playerAge(player.birthDate);
                          const isExpiring =
                            contract.expiresAfterSeasonNumber <= persistentWorld.currentSeasonNumber;
                          const suggestedWage = Math.min(
                            economyState.model.maxAnnualWageK,
                            Math.max(economyState.model.minAnnualWageK, contract.annualWageK + 10),
                          );
                          const draft = getOfferDraft(contract.playerId, suggestedWage, 2);
                          const windowOpen =
                            economyState.negotiationWindow.windowPhase === "OPEN" &&
                            state.completedMatches.length === 0 &&
                            !busy &&
                            !inspectionOnly &&
                            !service.isReadOnly();
                          const hasActiveOffer = economyState.negotiationWindow.offers.some(
                            (o) =>
                              o.offeringTeamId === controlledTeam &&
                              o.playerId === contract.playerId &&
                              (o.status === "PENDING_ROUND" || o.status === "COUNTERED"),
                          );
                          return (
                            <tr
                              key={contract.contractId}
                              data-testid={`managed-contract-${contract.playerId}`}
                            >
                              <td>
                                <button
                                  type="button"
                                  className="player-link"
                                  id={`player-link-CONTRACTS-${player.playerId}`}
                                  onClick={() => openPlayer(player.playerId, "CONTRACTS")}
                                >
                                  {player.name}
                                </button>
                                <small>{player.playerId}</small>
                              </td>
                              <td>{age ?? "–"}</td>
                              <td>{player.role.replaceAll("_", " ")}</td>
                              <td>${contract.annualWageK}k/yr</td>
                              <td>
                                Season {contract.expiresAfterSeasonNumber}
                                {isExpiring ? <small>Expiring after this season</small> : null}
                              </td>
                              <td>
                                {windowOpen ? (
                                  <div className="contract-inline-controls">
                                    {isExpiring && !hasActiveOffer && (
                                      <>
                                        <label className="sr-label" htmlFor={`renew-wage-${player.playerId}`}>
                                          Renewal wage ($k/yr) for {player.name}
                                        </label>
                                        <input
                                          id={`renew-wage-${player.playerId}`}
                                          type="number"
                                          min={economyState.model.minAnnualWageK}
                                          max={economyState.model.maxAnnualWageK}
                                          step={5}
                                          value={draft.wageK}
                                          onChange={(e) =>
                                            updateOfferDraft(player.playerId, suggestedWage, 2, {
                                              wageK: e.currentTarget.value,
                                            })
                                          }
                                          style={{ width: "78px" }}
                                        />
                                        <label className="sr-label" htmlFor={`renew-term-${player.playerId}`}>
                                          Renewal term for {player.name}
                                        </label>
                                        <select
                                          id={`renew-term-${player.playerId}`}
                                          value={draft.termSeasons}
                                          onChange={(e) =>
                                            updateOfferDraft(player.playerId, suggestedWage, 2, {
                                              termSeasons: e.currentTarget.value,
                                            })
                                          }
                                        >
                                          <option value="1">1 yr</option>
                                          <option value="2">2 yrs</option>
                                          <option value="3">3 yrs</option>
                                        </select>
                                        <button
                                          type="button"
                                          data-testid={`offer-renewal-${player.playerId}`}
                                          onClick={() =>
                                            void action(async () => {
                                              await service.submitContractOffer({
                                                playerId: player.playerId,
                                                offerKind: "RENEWAL",
                                                annualWageK: Number.parseInt(draft.wageK, 10) || suggestedWage,
                                                termSeasons: Number.parseInt(draft.termSeasons, 10) || 2,
                                              });
                                            })
                                          }
                                        >
                                          Offer renewal
                                        </button>
                                      </>
                                    )}
                                    {hasActiveOffer && <small>Renewal offer active</small>}
                                    <button
                                      type="button"
                                      data-testid={`release-player-${player.playerId}`}
                                      onClick={() =>
                                        void action(async () => {
                                          await service.releaseContractedPlayer(player.playerId);
                                        })
                                      }
                                    >
                                      Release ({Math.ceil((contract.annualWageK * economyState.model.releaseBuyoutPercent) / 100)}k buyout)
                                    </button>
                                  </div>
                                ) : (
                                  <small>{isExpiring ? "Expiring" : "Under contract"}</small>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                className="career-panel"
                aria-labelledby="free-agent-heading"
                data-testid="free-agent-market-panel"
                style={{ marginTop: "18px" }}
              >
                <div className="section-bar">
                  <h3 id="free-agent-heading">
                    Domestic free-agent market ({economyState.freeAgents.length})
                  </h3>
                  <label>
                    Filter role{" "}
                    <select
                      aria-label="Filter free agents by role"
                      value={freeAgentRoleFilter}
                      onChange={(e) => setFreeAgentRoleFilter(e.currentTarget.value)}
                    >
                      <option value="ALL">All roles</option>
                      <option value="BATTER">Batter</option>
                      <option value="BOWLER">Bowler</option>
                      <option value="ALL_ROUNDER">All-rounder</option>
                      <option value="WICKETKEEPER">Wicketkeeper</option>
                    </select>
                  </label>
                </div>
                <p>
                  Asking wages reflect public observed skills, age, and recorded statistics — never
                  hidden future ceilings.
                </p>
                <div className="table-wrap">
                  <table className="contracts-table">
                    <thead>
                      <tr>
                        <th>Free agent</th>
                        <th>Age</th>
                        <th>Role</th>
                        <th>Public T20 skills</th>
                        <th>Asking</th>
                        <th>Contract bid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {economyState.freeAgents
                        .filter(
                          (fa) =>
                            freeAgentRoleFilter === "ALL" || fa.player.role === freeAgentRoleFilter,
                        )
                        .map((fa) => {
                          const t20 = fa.player.skills.T20;
                          const faAge = Math.max(
                            16,
                            persistentWorld.currentCalendarYear -
                              Number.parseInt(fa.player.birthDate.slice(0, 4), 10),
                          );
                          const draft = getOfferDraft(
                            fa.player.playerId,
                            fa.askingAnnualWageK,
                            fa.preferredTermSeasons,
                          );
                          const windowOpen =
                            economyState.negotiationWindow.windowPhase === "OPEN" &&
                            state.completedMatches.length === 0 &&
                            !busy &&
                            !inspectionOnly &&
                            !service.isReadOnly();
                          const hasActiveOffer = economyState.negotiationWindow.offers.some(
                            (o) =>
                              o.offeringTeamId === controlledTeam &&
                              o.playerId === fa.player.playerId &&
                              (o.status === "PENDING_ROUND" || o.status === "COUNTERED"),
                          );
                          return (
                            <tr key={fa.player.playerId} data-testid={`fa-row-${fa.player.playerId}`}>
                              <td>
                                <button
                                  type="button"
                                  className="player-link"
                                  id={`player-link-CONTRACTS-${fa.player.playerId}`}
                                  onClick={() => openPlayer(fa.player.playerId, "CONTRACTS")}
                                >
                                  {fa.player.name}
                                </button>
                                <small>
                                  {fa.player.playerId}
                                  {fa.previousTeamId ? ` · Ex-${service.teamName(fa.previousTeamId)}` : " · Unattached"}
                                </small>
                              </td>
                              <td>{faAge}</td>
                              <td>{fa.player.role.replaceAll("_", " ")}</td>
                              <td>
                                Tim {t20.timing} · Pow {t20.power} · Ctl {t20.control} · Keep{" "}
                                {t20.keeping}
                              </td>
                              <td>
                                ${fa.askingAnnualWageK}k/yr × {fa.preferredTermSeasons}y
                              </td>
                              <td>
                                {windowOpen && !hasActiveOffer ? (
                                  <div className="contract-inline-controls">
                                    <label className="sr-label" htmlFor={`fa-wage-${fa.player.playerId}`}>
                                      Offer wage ($k/yr) for {fa.player.name}
                                    </label>
                                    <input
                                      id={`fa-wage-${fa.player.playerId}`}
                                      type="number"
                                      min={economyState.model.minAnnualWageK}
                                      max={economyState.model.maxAnnualWageK}
                                      step={5}
                                      value={draft.wageK}
                                      onChange={(e) =>
                                        updateOfferDraft(
                                          fa.player.playerId,
                                          fa.askingAnnualWageK,
                                          fa.preferredTermSeasons,
                                          { wageK: e.currentTarget.value },
                                        )
                                      }
                                      style={{ width: "78px" }}
                                    />
                                    <label className="sr-label" htmlFor={`fa-term-${fa.player.playerId}`}>
                                      Offer term for {fa.player.name}
                                    </label>
                                    <select
                                      id={`fa-term-${fa.player.playerId}`}
                                      value={draft.termSeasons}
                                      onChange={(e) =>
                                        updateOfferDraft(
                                          fa.player.playerId,
                                          fa.askingAnnualWageK,
                                          fa.preferredTermSeasons,
                                          { termSeasons: e.currentTarget.value },
                                        )
                                      }
                                    >
                                      <option value="1">1 yr</option>
                                      <option value="2">2 yrs</option>
                                      <option value="3">3 yrs</option>
                                    </select>
                                    <button
                                      type="button"
                                      data-testid={`offer-free-agent-${fa.player.playerId}`}
                                      onClick={() =>
                                        void action(async () => {
                                          await service.submitContractOffer({
                                            playerId: fa.player.playerId,
                                            offerKind: "FREE_AGENT",
                                            annualWageK:
                                              Number.parseInt(draft.wageK, 10) || fa.askingAnnualWageK,
                                            termSeasons:
                                              Number.parseInt(draft.termSeasons, 10) ||
                                              fa.preferredTermSeasons,
                                          });
                                        })
                                      }
                                    >
                                      Submit offer
                                    </button>
                                  </div>
                                ) : hasActiveOffer ? (
                                  <small>Active bid submitted</small>
                                ) : (
                                  <small>Window closed</small>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                className="career-panel"
                aria-labelledby="league-budgets-heading"
                data-testid="league-budgets-panel"
                style={{ marginTop: "18px" }}
              >
                <h3 id="league-budgets-heading">League club wage budgets (symmetrical cap)</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Club</th>
                        <th>Squad</th>
                        <th>Committed</th>
                        <th>Dead cap</th>
                        <th>Reserved</th>
                        <th>Available</th>
                        <th>Budget cap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {economyState.clubBudgets.map((b) => (
                        <tr
                          key={b.teamId}
                          className={b.teamId === controlledTeam ? "managed-fixture" : undefined}
                        >
                          <td>
                            <strong>{service.teamName(b.teamId)}</strong>
                          </td>
                          <td>
                            {displayWorld.teams.find((t) => t.teamId === b.teamId)?.squadIds.length ??
                              0}
                          </td>
                          <td>${b.committedWagesK}k</td>
                          <td>${b.deadCapWagesK}k</td>
                          <td>${b.pendingOfferReservedWagesK}k</td>
                          <td>${b.availableWageSpaceK}k</td>
                          <td>${b.annualWageBudgetK}k</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                className="career-panel"
                aria-labelledby="economy-ledger-heading"
                data-testid="economy-ledger-panel"
                style={{ marginTop: "18px" }}
              >
                <div className="section-bar">
                  <h3 id="economy-ledger-heading">Auditable transaction ledger</h3>
                  <div className="action-row" role="group" aria-label="Transaction ledger scope">
                    <button
                      type="button"
                      aria-pressed={ledgerScope === "MANAGED"}
                      onClick={() => setLedgerScope("MANAGED")}
                    >
                      {service.teamName(controlledTeam)} only
                    </button>
                    <button
                      type="button"
                      aria-pressed={ledgerScope === "ALL"}
                      onClick={() => setLedgerScope("ALL")}
                    >
                      All clubs
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Season</th>
                        <th>Type</th>
                        <th>Club</th>
                        <th>Player</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...economyState.ledger]
                        .filter((e) => ledgerScope === "ALL" || e.teamId === controlledTeam)
                        .slice(-40)
                        .reverse()
                        .map((entry) => (
                          <tr key={entry.sequence}>
                            <td>#{entry.sequence}</td>
                            <td>
                              S{entry.seasonNumber} ({formatGameDate(entry.date)})
                            </td>
                            <td>{entry.type.replaceAll("_", " ")}</td>
                            <td>{entry.teamId ? service.teamName(entry.teamId) : "League"}</td>
                            <td>{service.playerName(entry.playerId)}</td>
                            <td>{entry.summary}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </section>
  );
}

export type ContractsScreenProps = {
  service: CareerApplicationService;
  state: NonNullable<ReturnType<CareerApplicationService["getState"]>>;
  persistentWorld: ReturnType<CareerApplicationService["getPersistentState"]>;
  busy: boolean;
  inspectionOnly: boolean;
  action: (work: () => Promise<void>) => Promise<void>;
  controlledTeam: string | null;
  team: ReturnType<CareerApplicationService["getWorld"]>["teams"][number] | null;
  displayWorld: ReturnType<CareerApplicationService["getWorld"]>;
  economyState: ReturnType<CareerApplicationService["getEconomyState"]>;
  managedBudget: ReturnType<CareerApplicationService["managedClubBudget"]>;
  freeAgentRoleFilter: string;
  setFreeAgentRoleFilter: Dispatch<SetStateAction<string>>;
  ledgerScope: "MANAGED" | "ALL";
  setLedgerScope: Dispatch<SetStateAction<"MANAGED" | "ALL">>;
  getOfferDraft: (id: string, defaultWageK: number, defaultTerm: number) => { wageK: string; termSeasons: string };
  updateOfferDraft: (id: string, defaultWageK: number, defaultTerm: number, patch: Partial<{ wageK: string; termSeasons: string }>) => void;
  openPlayer: (id: string, origin: "SQUAD" | "STATISTICS" | "CONTRACTS" | "CAREER" | "FIXTURES") => void;
};
