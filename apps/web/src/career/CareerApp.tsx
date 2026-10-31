import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TrainingDirective } from "@lcxxvi/contracts";
import {
  CareerApplicationService,
  careerWorld,
  type CareerUserMatchResult,
} from "./service.js";
import { PlayerPage, type PlayerFormat } from "./PlayerPage.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { WorldEditor } from "../world/WorldEditor.js";
import type { NewGameWorldCopy } from "../world/new-game-world.js";
import "./career.css";

const OWNER_KEY = "lcxxvi-career-writer-owner";
const LAUNCH_KEY = "lcxxvi-career-match-launch";
const RESULT_KEY = "lcxxvi-career-match-result";
let owner = sessionStorage.getItem(OWNER_KEY);
if (!owner) {
  owner = `career-tab-${crypto.randomUUID()}`;
  sessionStorage.setItem(OWNER_KEY, owner);
}
const service = new CareerApplicationService(owner);

type Screen = "HOME" | "CAREER" | "SQUAD" | "FIXTURES" | "STATISTICS" | "SETTINGS" | "PLAYER";
const directives: TrainingDirective[] = ["REST", "BATTING_PRACTICE", "BOWLING_PRACTICE", "FIELDING_PRACTICE"];

function metric(value: number | null, divisor = 100): string {
  return value === null ? "–" : (value / divisor).toFixed(2);
}

function percentageBp(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

export function CareerApp() {
  const [, redraw] = useState(0);
  const [screen, setScreen] = useState<Screen>("HOME");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [stagedWorld, setStagedWorld] = useState<NewGameWorldCopy | null>(null);
  const [editingWorld, setEditingWorld] = useState(false);
  const [restoreEditorFocus, setRestoreEditorFocus] = useState(false);
  const editWorldButton = useRef<HTMLButtonElement>(null);
  const [playerOrigin, setPlayerOrigin] = useState<"SQUAD" | "STATISTICS">("SQUAD");
  const [restorePlayerFocus, setRestorePlayerFocus] = useState<string | null>(null);
  const [playerFormat, setPlayerFormat] = useState<PlayerFormat>(() => {
    const stored = localStorage.getItem("lcxxvi-player-format");
    return stored === "ODI" || stored === "RED_BALL" ? stored : "T20";
  });
  function openPlayer(id: string, origin: "SQUAD" | "STATISTICS") {
    setPlayerId(id); setPlayerOrigin(origin); setScreen("PLAYER");
  }
  function changePlayerFormat(value: PlayerFormat) {
    setPlayerFormat(value); localStorage.setItem("lcxxvi-player-format", value);
  }
  const [copyName, setCopyName] = useState("");
  const [busy, setBusy] = useState(true);
  const [uiError, setUiError] = useState("");
  const [savedCareers, setSavedCareers] = useState<Awaited<ReturnType<typeof service.listCareers>>>([]);
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem("lcxxvi-career-scale");
    return saved && ["90", "100", "115", "125", "150"].includes(saved) ? saved : "100";
  });
  const [density, setDensity] = useState(() => localStorage.getItem("lcxxvi-career-density") ?? "comfortable");
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("lcxxvi-career-motion") === "reduced");
  const state = service.getState();

  useEffect(() => service.subscribe(() => redraw((value) => value + 1)), []);
  useEffect(() => {
    if (restoreEditorFocus && !editingWorld) {
      editWorldButton.current?.focus();
      setRestoreEditorFocus(false);
    }
  }, [editingWorld, restoreEditorFocus]);
  useEffect(() => {
    if (restorePlayerFocus && screen === playerOrigin) {
      document.getElementById(`player-link-${playerOrigin}-${restorePlayerFocus}`)?.focus();
      setRestorePlayerFocus(null);
    }
  }, [screen, playerOrigin, restorePlayerFocus]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await service.boot();
        const pending = sessionStorage.getItem(RESULT_KEY);
        if (pending) {
          const parsed = JSON.parse(pending) as CareerUserMatchResult;
          await service.completeUserMatch(parsed);
          sessionStorage.removeItem(RESULT_KEY);
          sessionStorage.removeItem(LAUNCH_KEY);
        }
        if (alive) setSavedCareers(await service.listCareers());
      } catch (error) {
        if (alive) setUiError(error instanceof Error ? error.message : "Career startup failed.");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("lcxxvi-career-scale", scale);
    localStorage.setItem("lcxxvi-career-density", density);
    localStorage.setItem("lcxxvi-career-motion", reducedMotion ? "reduced" : "full");
  }, [scale, density, reducedMotion]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setUiError("");
    try {
      await work();
      setSavedCareers(await service.listCareers());
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createCareer(teamId: string) {
    await action(async () => {
      await service.createCareer(teamId, stagedWorld);
      setStagedWorld(null);
      setScreen("HOME");
    });
  }

  async function playMatch() {
    await action(async () => {
      const launch = await service.prepareUserMatch();
      sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(launch));
      window.location.hash = "#exhibition";
    });
  }

  async function exportCareer() {
    await action(async () => {
      const bytes = await service.exportCareer();
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lord-cricket-career-${state?.seasonId ?? "season"}.lcxxvi`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  async function importCareer(file: File | null) {
    if (!file) return;
    await action(async () => {
      await service.importCareer(new Uint8Array(await file.arrayBuffer()));
      setScreen("HOME");
    });
  }

  const controlledTeam = state?.controlledTeamId ?? null;
  const displayWorld = state ? service.getWorld() : stagedWorld?.world ?? careerWorld;
  const nextFixture = service.nextManagedFixture();
  const completionByFixture = useMemo(
    () => new Map(state?.completedMatches.map((completion) => [completion.fixtureId, completion]) ?? []),
    [state],
  );
  const team = displayWorld.teams.find((candidate) => candidate.teamId === controlledTeam) ?? null;
  const tableRow = state?.projection.table.find((row) => row.teamId === controlledTeam) ?? null;

  if (busy && !state && savedCareers.length === 0) {
    return <main className="career-shell"><p>Loading Lord Cricket XXVI…</p></main>;
  }

  if (!state) {
    return (
      <main className={`career-shell density-${density}`} style={{ fontSize: `${Number(scale) / 100}rem` }}>
        <header className="career-masthead">
          <div><p className="eyebrow">LORD CRICKET XXVI</p><h1>Start a <span>Career</span></h1></div>
          <a className="button-link" href="#exhibition" onClick={() => sessionStorage.removeItem(LAUNCH_KEY)}>Exhibition matches</a>
          <a className="button-link" href="#roster-career">Imported roster career</a>
        </header>
        <section className="career-disclosure" aria-label="Product status">
          <strong>Playable alpha.</strong> Fictional eight-team dataset · SYNTHETIC_ALPHA model · one T20 season · no transfers, contracts, finances, international management or verified DLS.
        </section>
        {(uiError || service.getError()) && <p role="alert" tabIndex={-1} className="career-error">{uiError || service.getError()}</p>}
        {savedCareers.length > 0 && (
          <section className="career-panel">
            <h2>Continue career</h2>
            <div className="save-list">
              {savedCareers.map((save) => (
                <button key={save.saveId} disabled={busy} onClick={() => action(async () => { await service.loadCareer(save.saveId); setScreen("HOME"); })}>
                  {save.title} · {save.completedFixtures}/56 · {save.phase}
                  <small>{save.currentDate} · revision {save.revision}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        <section>
          <h2>New career</h2>
          <p>Choose the team you will manage for the fixed 14-round, 56-match season.</p>
          {editingWorld ? <WorldEditor base={careerWorld} initial={stagedWorld} onClose={() => { setEditingWorld(false); setRestoreEditorFocus(true); }} onStage={copy => { setStagedWorld(copy); setEditingWorld(false); setRestoreEditorFocus(true); }} /> : <div className="action-row">
            <button ref={editWorldButton} type="button" onClick={() => setEditingWorld(true)}>Edit names and colours</button>
            {stagedWorld && <button type="button" onClick={() => setStagedWorld(null)}>Use original world</button>}
          </div>}
          {stagedWorld && <p role="status">Edited world ready for a new career. Existing careers remain unchanged.</p>}
          <div className="team-picker">
            {displayWorld.teams.map((candidate) => (
              <button key={candidate.teamId} className="team-card" disabled={busy || editingWorld} onClick={() => createCareer(candidate.teamId)}>
                <strong>{candidate.name}</strong>
                <span>{displayWorld.grounds.find(ground => ground.groundId === candidate.teamId.replace("team", "ground"))?.name}</span>
                <span className="team-colours" aria-hidden="true">{candidate.colours.map((colour, index) => <i key={index} style={{ backgroundColor: colour }} />)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="career-panel import-panel">
          <h2>Import portable career</h2>
          <label>Choose .lcxxvi archive<input type="file" accept=".lcxxvi,application/zip" onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)} /></label>
        </section>
      </main>
    );
  }

  const completedManaged = state.completedMatches.filter((completion) => [completion.homeTeamId, completion.awayTeamId].includes(controlledTeam!));
  const currentRound = nextFixture?.roundNumber ?? 14;
  const status = service.getStatus();

  return (
    <main className={`career-shell density-${density} ${reducedMotion ? "reduced-motion" : ""}`} style={{ fontSize: `${Number(scale) / 100}rem` }}>
      <header className="career-masthead">
        <div>
          <p className="eyebrow">LORD CRICKET XXVI · MANAGEMENT</p>
          <h1>{team?.name ?? "Career"}</h1>
          {team && <div className="team-colours" aria-hidden="true">{team.colours.map((colour, index) => <i key={index} style={{ backgroundColor: colour }} />)}</div>}
          <p>{state.phase === "COMPLETE" ? "Season complete" : `Round ${currentRound} · ${state.careerState.currentDate}`}</p>
        </div>
        <div className="save-badge" data-status={status.toLowerCase()}>
          <strong>{status}</strong>
          <small>{state.completedMatches.length}/56 fixtures · rev {state.revision}</small>
        </div>
      </header>

      <nav className="career-nav" aria-label="Career navigation">
        {(["HOME", "CAREER", "SQUAD", "FIXTURES", "STATISTICS", "SETTINGS"] as Screen[]).map((item) => (
          <button key={item} aria-current={screen === item ? "page" : undefined} onClick={() => setScreen(item)}>{item[0] + item.slice(1).toLowerCase()}</button>
        ))}
        <a href="#exhibition" onClick={() => sessionStorage.removeItem(LAUNCH_KEY)}>Exhibition</a>
        <button disabled={busy} onClick={() => void action(async () => { await service.leaveCareer(); setScreen("HOME"); })}>Choose career</button>
      </nav>

      <section className="career-disclosure compact" aria-label="Model disclosure">
        Fictional data · SYNTHETIC_ALPHA · one-season career · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI.
      </section>
      <section className="career-panel" aria-label="Manual career copy">
        <label>Copy name <input value={copyName} maxLength={120} onChange={event => setCopyName(event.currentTarget.value)} /></label>
        <button disabled={busy || service.isReadOnly() || !copyName.trim()} onClick={() => void action(async () => { await service.createManualCopy(copyName); setCopyName(""); })}>Save career copy</button>
      </section>
      {(uiError || service.getError()) && <p role="alert" tabIndex={-1} className="career-error">{uiError || service.getError()}</p>}
      {service.isReadOnly() && <p className="career-warning">This save is read-only because another tab owns its writer lease.</p>}
      {service.wasRecovered() && <p className="career-warning">Recovered from the newest valid checkpoint. The damaged source save was preserved.</p>}

      {screen === "HOME" && (
        <section aria-labelledby="home-heading">
          <h2 id="home-heading">Home</h2>
          <div className="dashboard-grid">
            <article className="career-panel emphasis">
              <h3>Next required action</h3>
              {state.phase === "COMPLETE" ? (
                <>
                  <p className="big-stat">Season complete</p>
                  <p>Champion: <strong>{service.teamName(state.projection.table[0]?.teamId)}</strong></p>
                </>
              ) : nextFixture ? (
                <>
                  <p className="big-stat">Round {nextFixture.roundNumber}</p>
                  <p><strong>{service.teamName(nextFixture.homeTeamId)}</strong> v <strong>{service.teamName(nextFixture.awayTeamId)}</strong></p>
                  <p>{nextFixture.matchDayDate} · {service.groundName(nextFixture.groundId)}</p>
                  {state.careerState.currentDate < nextFixture.matchDayDate ? (
                    <button className="primary" disabled={busy || service.isReadOnly()} onClick={() => action(async () => { await service.simulateToNextUserFixture(); })}>Advance to match day</button>
                  ) : (
                    <div className="action-row">
                      <button className="primary" disabled={busy || service.isReadOnly()} onClick={() => action(async () => { await service.simulateManagedFixture(); })}>Simulate match</button>
                      <button disabled={busy || service.isReadOnly()} onClick={() => void playMatch()}>Play match</button>
                    </div>
                  )}
                  <PitchInspection ground={displayWorld.grounds.find(ground => ground.groundId === nextFixture.groundId)} format="T20" />
                </>
              ) : <p>No remaining managed fixture.</p>}
            </article>
            <article className="career-panel">
              <h3>League position</h3>
              <p className="big-stat">{tableRow ? `#${tableRow.rank}` : "–"}</p>
              {tableRow && <p>{tableRow.wins}W · {tableRow.losses}L · {tableRow.ties}T · {tableRow.noResults}NR · {tableRow.points} pts · NRR {tableRow.nrrX1000 === null ? "–" : (tableRow.nrrX1000 / 1000).toFixed(3)}</p>}
            </article>
            <article className="career-panel">
              <h3>Condition</h3>
              {(() => {
                const squad = service.squadView();
                const avg = squad ? Math.round(squad.players.reduce((sum, player) => sum + player.fatigueBp, 0) / squad.players.length) : 0;
                const unavailable = squad?.players.filter((player) => player.availability === "UNAVAILABLE").length ?? 0;
                return <><p className="big-stat">{percentageBp(avg)} fatigue</p><p>{unavailable} unavailable · {squad?.players.filter((p) => p.directive !== "REST").length ?? 0} in practice</p></>;
              })()}
            </article>
            <article className="career-panel">
              <h3>Progress</h3>
              <p className="big-stat">{state.completedMatches.length}/56</p>
              <p>{completedManaged.length}/14 managed-team fixtures complete.</p>
            </article>
          </div>
        </section>
      )}

      {screen === "CAREER" && (
        <section aria-labelledby="career-heading">
          <h2 id="career-heading">Career</h2>
          <div className="career-summary-grid">
            <div className="career-panel"><h3>Season status</h3><p>{state.phase}</p><p>Date {state.careerState.currentDate}</p><p>Round {currentRound} of 14</p></div>
            <div className="career-panel"><h3>Managed record</h3><p>{tableRow?.wins ?? 0} wins · {tableRow?.losses ?? 0} losses · {tableRow?.ties ?? 0} ties</p><p>{tableRow?.points ?? 0} points</p></div>
          </div>
          <h3>Managed-team results</h3>
          <div className="table-wrap"><table><thead><tr><th>Rnd</th><th>Date</th><th>Fixture</th><th>Result</th></tr></thead><tbody>{state.schedule.fixtures.filter((fixture) => [fixture.homeTeamId, fixture.awayTeamId].includes(controlledTeam!)).map((fixture) => {
            const completion = completionByFixture.get(fixture.fixtureId);
            return <tr key={fixture.fixtureId}><td>{fixture.roundNumber}</td><td>{fixture.matchDayDate}</td><td>{service.teamName(fixture.homeTeamId)} v {service.teamName(fixture.awayTeamId)}</td><td>{completion ? service.resultText(completion) : "Scheduled"}</td></tr>;
          })}</tbody></table></div>
        </section>
      )}

      {screen === "SQUAD" && (
        <section aria-labelledby="squad-heading">
          <h2 id="squad-heading">Squad</h2>
          <p>Training changes affect temporary readiness and daily recovery only. There is no permanent attribute growth in V0.1.</p>
          <div className="table-wrap"><table><thead><tr><th>Player</th><th>Role</th><th>Availability</th><th>Fatigue</th><th>Bat</th><th>Bowl</th><th>Field</th><th>Training</th></tr></thead><tbody>{service.squadView()?.players.map((condition) => {
            const player = displayWorld.players.find((candidate) => candidate.playerId === condition.playerId)!;
            return <tr key={condition.playerId}><td><button type="button" className="player-link" id={`player-link-SQUAD-${player.playerId}`} aria-label={`View ${player.name}`} onClick={() => openPlayer(player.playerId, "SQUAD")}>{player.name}</button><small>{player.playerId}</small></td><td>{player.role}</td><td>{condition.availability}{condition.availabilityReason ? <small>{condition.availabilityReason}</small> : null}</td><td>{percentageBp(condition.fatigueBp)}</td><td>{condition.battingReadiness > 0 ? "+" : ""}{condition.battingReadiness}</td><td>{condition.bowlingReadiness > 0 ? "+" : ""}{condition.bowlingReadiness}</td><td>{condition.fieldingReadiness > 0 ? "+" : ""}{condition.fieldingReadiness}</td><td><label className="sr-label" htmlFor={`training-${condition.playerId}`}>Training for {player.name}</label><select id={`training-${condition.playerId}`} disabled={busy || service.isReadOnly() || state.phase === "COMPLETE"} value={condition.directive} onChange={(event) => void action(async () => { await service.setTraining(condition.playerId, event.currentTarget.value as TrainingDirective); })}>{directives.map((directive) => <option key={directive} value={directive}>{directive.replaceAll("_", " ")}</option>)}</select></td></tr>;
          })}</tbody></table></div>
        </section>
      )}

      {screen === "FIXTURES" && (
        <section aria-labelledby="fixtures-heading">
          <h2 id="fixtures-heading">Fixtures</h2>
          {state.schedule.rounds.map((round) => (
            <section className="round-block" key={round.roundNumber} aria-labelledby={`round-${round.roundNumber}`}>
              <h3 id={`round-${round.roundNumber}`}>Round {round.roundNumber} · {round.matchDayDate}</h3>
              <div className="table-wrap"><table><thead><tr><th>Home</th><th>Away</th><th>Ground</th><th>Status</th><th>Result</th></tr></thead><tbody>{state.schedule.fixtures.filter((fixture) => fixture.roundNumber === round.roundNumber).map((fixture) => {
                const completion = completionByFixture.get(fixture.fixtureId);
                const managed = [fixture.homeTeamId, fixture.awayTeamId].includes(controlledTeam!);
                return <tr key={fixture.fixtureId} className={managed ? "managed-fixture" : ""}><td>{service.teamName(fixture.homeTeamId)}</td><td>{service.teamName(fixture.awayTeamId)}</td><td>{service.groundName(fixture.groundId)}</td><td>{completion ? "Completed" : "Scheduled"}{managed ? <small>Managed fixture</small> : null}</td><td>{completion ? service.resultText(completion) : "–"}</td></tr>;
              })}</tbody></table></div>
            </section>
          ))}
        </section>
      )}

      {screen === "STATISTICS" && (
        <section aria-labelledby="statistics-heading">
          <h2 id="statistics-heading">Statistics</h2>
          <h3>League table</h3>
          <div className="table-wrap"><table><thead><tr><th>Pos</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NR</th><th>Pts</th><th>NRR</th></tr></thead><tbody>{state.projection.table.map((row) => <tr key={row.teamId} className={row.teamId === controlledTeam ? "managed-fixture" : ""}><td>{row.rank}</td><td>{service.teamName(row.teamId)}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td><td>{row.noResults}</td><td>{row.points}</td><td>{row.nrrX1000 === null ? "–" : (row.nrrX1000 / 1000).toFixed(3)}</td></tr>)}</tbody></table></div>
          <h3>Player leaders</h3>
          <div className="stats-grid">
            <div className="career-panel"><h4>Runs</h4><ol>{state.projection.leaders.runs.map((entry) => <li key={entry.playerId}><span>{service.playerName(entry.playerId)}</span><strong>{entry.value}</strong></li>)}</ol></div>
            <div className="career-panel"><h4>Wickets</h4><ol>{state.projection.leaders.wickets.map((entry) => <li key={entry.playerId}><span>{service.playerName(entry.playerId)}</span><strong>{entry.value}</strong></li>)}</ol></div>
          </div>
          <h3>Full player statistics</h3>
          <div className="table-wrap"><table><thead><tr><th>Player</th><th>Team</th><th>M</th><th>Runs</th><th>Avg</th><th>SR</th><th>Wkts</th><th>Bowl Avg</th><th>Econ</th><th>Bowl SR</th></tr></thead><tbody>{state.projection.players.map((player) => <tr key={player.playerId}><td><button type="button" className="player-link" id={`player-link-STATISTICS-${player.playerId}`} aria-label={`View ${service.playerName(player.playerId)}`} onClick={() => openPlayer(player.playerId, "STATISTICS")}>{service.playerName(player.playerId)}</button></td><td>{service.teamName(player.teamId)}</td><td>{player.matches}</td><td>{player.runs}</td><td>{metric(player.battingAverageX100)}</td><td>{metric(player.strikeRateX100)}</td><td>{player.bowlingWickets}</td><td>{metric(player.bowlingAverageX100)}</td><td>{metric(player.economyX100)}</td><td>{metric(player.bowlingStrikeRateX100)}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {screen === "PLAYER" && (() => {
        const player = displayWorld.players.find(candidate => candidate.playerId === playerId);
        return player ? <PlayerPage player={player} condition={service.playerCondition(player.playerId)}
          stats={state.projection.players.find(candidate => candidate.playerId === player.playerId) ?? null}
          format={playerFormat} onFormat={changePlayerFormat} onBack={() => { setRestorePlayerFocus(player.playerId); setScreen(playerOrigin); }}
          backLabel={playerOrigin === "SQUAD" ? "Back to squad" : "Back to statistics"} /> : null;
      })()}

      {screen === "SETTINGS" && (
        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading">Settings</h2>
          <div className="settings-grid">
            <label>Text scale<select value={scale} onChange={(event) => setScale(event.currentTarget.value)}><option value="90">90%</option><option value="100">100%</option><option value="115">115%</option><option value="125">125%</option><option value="150">150%</option></select></label>
            <label>Layout density<select value={density} onChange={(event) => setDensity(event.currentTarget.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
            <label className="check-label"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.currentTarget.checked)} /> Reduced motion</label>
          </div>
          <div className="career-panel settings-actions">
            <h3>Career file</h3>
            <button disabled={busy} onClick={() => void exportCareer()}>Export .lcxxvi</button>
            <label>Import validated .lcxxvi archive<input type="file" accept=".lcxxvi,application/zip" onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)} /></label>
          </div>
        </section>
      )}
    </main>
  );
}
