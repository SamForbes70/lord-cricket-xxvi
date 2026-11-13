import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  SeasonCheckpointInspection,
  T20SeasonMatchCompletion,
  TrainingDirective,
} from "@lcxxvi/contracts";
import {
  CareerApplicationService,
  careerWorld,
  type CareerReplayOutcome,
  type CareerUserMatchResult,
} from "./service.js";
import { PlayerPage, type PlayerFormat } from "./PlayerPage.js";
import { managedBindings, recordManagedLaunch, settleManagedMatches } from "./managed-match.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { WorldEditor } from "../world/WorldEditor.js";
import type { NewGameWorldCopy } from "../world/new-game-world.js";
import { offlineUpdateCoordinator } from "../offline-update.js";
import "./career.css";

const OWNER_KEY = "lcxxvi-career-writer-owner";
const LAUNCH_KEY = "lcxxvi-career-match-launch";
const RESULT_KEY = "lcxxvi-career-match-result";
let owner = sessionStorage.getItem(OWNER_KEY);
if (!owner) {
  owner = `career-tab-${crypto.randomUUID()}`;
  sessionStorage.setItem(OWNER_KEY, owner);
}
const service = new CareerApplicationService(owner, undefined, async (from, to) => {
  try { await managedBindings.rekeyCareer(from, to); } catch { /* the pending match is then reported, not applied */ }
});
function roundOf(launch: unknown): number | null {
  const round = (launch as { roundNumber?: unknown } | null)?.roundNumber;
  return typeof round === "number" ? round : null;
}
/** Applies completed pending matches and retires bindings for fixtures completed another way. */
async function settleStandard() {
  const saveId = service.getSaveId();
  if (!saveId || service.isReadOnly()) return null;
  return settleManagedMatches({
    careerSaveId: saveId,
    careerKind: "STANDARD",
    isFixtureCompleted: (fixtureId) => service.getState()?.completedMatches.some((match) => match.fixtureId === fixtureId) ?? false,
    apply: async ({ result }) => {
      if (!result.careerResult) throw new Error("The completed match produced no career result.");
      await service.completeUserMatch(result.careerResult, result.t20Session);
    },
  });
}
function clearLaunchCache() {
  try { sessionStorage.removeItem(RESULT_KEY); sessionStorage.removeItem(LAUNCH_KEY); } catch { /* storage unavailable */ }
}

type Screen = "HOME" | "CAREER" | "SQUAD" | "FIXTURES" | "STATISTICS" | "SETTINGS" | "PLAYER";
const directives: TrainingDirective[] = ["REST", "BATTING_PRACTICE", "BOWLING_PRACTICE", "FIELDING_PRACTICE"];

function metric(value: number | null, divisor = 100): string {
  return value === null ? "–" : (value / divisor).toFixed(2);
}

function percentageBp(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function ErrorBanner({ rawError }: { rawError: string }) {
  const desc = service.describeError(rawError);
  const isStructured = desc.code !== "SEASON_PERSISTENCE_ERROR";
  return (
    <div role="alert" tabIndex={-1} className="career-error">
      <strong>{isStructured ? desc.summary : rawError}</strong>
      <p>{desc.guidance}</p>
      {isStructured && <small>Diagnostic code: <code>{desc.code}</code></small>}
    </div>
  );
}

export function CareerApp({ inspectionOnly = false }: { inspectionOnly?: boolean } = {}) {
  const [, redraw] = useState(0);
  const [screen, setScreen] = useState<Screen>("HOME");
  const [pendingMatch, setPendingMatch] = useState<{ round: number | null } | null>(null);
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
  useEffect(() => {
    offlineUpdateCoordinator.setBusySource("career", busy);
    return () => offlineUpdateCoordinator.setBusySource("career", false);
  }, [busy]);
  const [savedCareers, setSavedCareers] = useState<Awaited<ReturnType<typeof service.listCareers>>>([]);
  const [checkpointView, setCheckpointView] = useState<SeasonCheckpointInspection | null>(null);
  const [recoveryTitle, setRecoveryTitle] = useState("");
  const [checkpointTriggerId, setCheckpointTriggerId] = useState<string | null>(null);
  const checkpointPanelRef = useRef<HTMLElement>(null);
  const [activeReplay, setActiveReplay] = useState<{
    fixtureId: string;
    completion: T20SeasonMatchCompletion;
    outcome: CareerReplayOutcome;
  } | null>(null);
  const [replayInningsTab, setReplayInningsTab] = useState(0);
  const [replayTriggerId, setReplayTriggerId] = useState<string | null>(null);
  const replayPanelRef = useRef<HTMLElement>(null);
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
    if (checkpointView) checkpointPanelRef.current?.focus();
  }, [checkpointView]);
  useEffect(() => {
    if (activeReplay) replayPanelRef.current?.focus();
  }, [activeReplay]);
  useEffect(() => {
    let alive = true;
    /** Settles durable matches, then the legacy in-session handoff. Safe to repeat. */
    async function afterBoot(): Promise<void> {
      if (inspectionOnly) return;
      // Durable path first: any pending match for this career whose checkpoint is complete is applied
      // from the saved match and its binding, whether or not the original tab is still around.
      const settled = await settleStandard();
      if (settled) {
        if (settled.applied.length) clearLaunchCache();
        if (alive) setUiError(settled.errors.join(" "));
        if (alive) setPendingMatch(settled.pending.length ? { round: roundOf(settled.pending[0]!.launch) } : null);
      }
      // Legacy in-session handoff, kept for launches started before bindings existed. An identical
      // completion is a no-op, so this cannot apply a result twice after the durable path ran.
      let pending: string | null = null;
      try { pending = sessionStorage.getItem(RESULT_KEY); } catch { /* storage unavailable */ }
      if (pending && !service.isReadOnly()) {
        const parsed = JSON.parse(pending) as CareerUserMatchResult;
        await service.completeUserMatch(parsed);
        clearLaunchCache();
        try {
          const saveId = service.getSaveId();
          const { bindings } = saveId ? await managedBindings.pendingForCareer(saveId) : { bindings: [] };
          const matchGameId = bindings.find((b) => b.fixtureId === parsed.fixtureId)?.matchGameId ?? `career-match-${parsed.fixtureId}`;
          await managedBindings.resolve(matchGameId, "APPLIED", "RESULT_APPLIED");
        } catch { /* no binding for legacy launches */ }
      }
    }
    const releaseWriter = () => { void service.releaseWriter(); };
    window.addEventListener("pagehide", releaseWriter);
    void (async () => {
      try {
        if (inspectionOnly) await service.inspectActiveCareer();
        else await service.boot();
        await afterBoot();
        if (alive) { setSavedCareers(await service.listCareers()); setBusy(false); }
        // A career reopened right after its tab closed sees the old tab's lease for up to 12 s. Retry for
        // a bounded time so a legitimate reopen becomes writable on its own; a live second tab is never taken over.
        for (let attempt = 0; alive && !inspectionOnly && service.isReadOnly() && attempt < 6; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          if (!alive) break;
          await service.boot();
          if (!service.isReadOnly()) {
            await afterBoot();
            if (alive) setSavedCareers(await service.listCareers());
          }
        }
      } catch (error) {
        if (alive) setUiError(error instanceof Error ? error.message : "Career startup failed.");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
      window.removeEventListener("pagehide", releaseWriter);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("lcxxvi-career-scale", scale);
    localStorage.setItem("lcxxvi-career-density", density);
    localStorage.setItem("lcxxvi-career-motion", reducedMotion ? "reduced" : "full");
  }, [scale, density, reducedMotion]);

  async function action(work: () => Promise<void>) {
    if (inspectionOnly) { setUiError("Return to the active match before changing the career."); return; }
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
      setActiveReplay(null);
      setCheckpointView(null);
      setScreen("HOME");
    });
  }

  async function playMatch() {
    await action(async () => {
      const prepared = await service.prepareUserMatch();
      // Persist the link before launching so it survives a closed tab or browser.
      const launch = await recordManagedLaunch(prepared);
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
      setActiveReplay(null);
      setCheckpointView(null);
      setScreen("HOME");
    });
  }

  async function openCheckpointInspector(saveId: string, triggerId: string) {
    setBusy(true);
    setUiError("");
    try {
      const inspection = await service.inspectCareerCheckpoints(saveId);
      setCheckpointTriggerId(triggerId);
      setRecoveryTitle(`${inspection.title} (Recovered)`);
      setCheckpointView(inspection);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Checkpoint inspection failed.");
    } finally {
      setBusy(false);
    }
  }

  function closeCheckpointInspector() {
    const triggerId = checkpointTriggerId;
    setCheckpointView(null);
    setCheckpointTriggerId(null);
    if (triggerId) setTimeout(() => document.getElementById(triggerId)?.focus(), 0);
  }

  async function recoverGeneration(saveId: string, generation: number) {
    await action(async () => {
      await service.recoverCareerFromGeneration(saveId, generation, recoveryTitle);
      setCheckpointView(null);
      setCheckpointTriggerId(null);
      setActiveReplay(null);
      setScreen("HOME");
    });
  }

  async function openReplay(fixtureId: string, triggerId: string) {
    const completion = completionByFixture.get(fixtureId);
    if (!completion) return;
    setBusy(true);
    setUiError("");
    try {
      const outcome = await service.replayFixtureArchive(fixtureId);
      setReplayTriggerId(triggerId);
      setReplayInningsTab(0);
      setActiveReplay({ fixtureId, completion, outcome });
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Replay loading failed.");
    } finally {
      setBusy(false);
    }
  }

  function closeReplay() {
    const triggerId = replayTriggerId;
    setActiveReplay(null);
    setReplayTriggerId(null);
    if (triggerId) setTimeout(() => document.getElementById(triggerId)?.focus(), 0);
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
  const activeError = uiError || service.getError();

  const checkpointInspectorSection = checkpointView && (
    <section
      ref={checkpointPanelRef}
      tabIndex={-1}
      className="career-panel checkpoint-inspector"
      role="region"
      aria-labelledby="checkpoint-inspector-heading"
      data-testid="checkpoint-inspector"
    >
      <div className="section-bar">
        <h3 id="checkpoint-inspector-heading">Checkpoint recovery · {checkpointView.title}</h3>
        <button type="button" onClick={closeCheckpointInspector}>Close checkpoint inspector</button>
      </div>
      <p>
        Corrupted checkpoints and damaged original saves are retained untouched. Choosing a verified generation below creates a new recovered career copy.
      </p>
      {checkpointView.corruptedGenerations.length > 0 ? (
        <p role="status" className="career-warning">
          Corrupted checkpoint generations detected and isolated: {checkpointView.corruptedGenerations.map((g) => `G${g}`).join(", ")}.
        </p>
      ) : (
        <p role="status">All stored checkpoint generations passed SHA-256 and schema verification.</p>
      )}
      {checkpointView.validGenerations.length === 0 ? (
        <p role="status" className="career-error">
          No verified checkpoint generation remains on this slot. The damaged save is preserved; load an earlier manual copy or import a validated .lcxxvi archive.
        </p>
      ) : (
        <>
          <label className="recovery-title-field">
            Recovered copy title{" "}
            <input
              value={recoveryTitle}
              maxLength={120}
              onChange={(event) => setRecoveryTitle(event.currentTarget.value)}
            />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gen</th>
                  <th>Revision</th>
                  <th>Fixtures</th>
                  <th>Career date</th>
                  <th>Saved at</th>
                  <th>State SHA-256</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {checkpointView.validGenerations.map((gen) => (
                  <tr key={gen.generation}>
                    <td>G{gen.generation}{gen.checkpointSerial === checkpointView.currentSerial ? <small>Newest</small> : <small>Older</small>}</td>
                    <td>{gen.revision}</td>
                    <td>{gen.completedFixtures}/56 · {gen.phase}</td>
                    <td>{gen.currentDate}</td>
                    <td>{gen.createdAt}</td>
                    <td><code>{gen.stateSha256.slice(0, 12)}…</code></td>
                    <td>
                      <button
                        type="button"
                        disabled={busy || inspectionOnly}
                        onClick={() => void recoverGeneration(checkpointView.saveId, gen.generation)}
                      >
                        Recover generation {gen.generation}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );

  const replayViewerSection = activeReplay && (
    <section
      ref={replayPanelRef}
      tabIndex={-1}
      className="career-panel replay-viewer"
      role="region"
      aria-labelledby="replay-viewer-heading"
      data-testid="career-replay-viewer"
    >
      <div className="section-bar">
        <h3 id="replay-viewer-heading">
          Archived match replay · Round {activeReplay.completion.roundNumber} · {service.teamName(activeReplay.completion.homeTeamId)} v {service.teamName(activeReplay.completion.awayTeamId)}
        </h3>
        <button type="button" onClick={closeReplay}>Close replay</button>
      </div>
      <p>
        <strong>{service.resultText(activeReplay.completion)}</strong> · {activeReplay.completion.matchDayDate} · Source: {activeReplay.completion.source}
      </p>
      <div className="career-summary-grid">
        {activeReplay.completion.scorecard.innings.map((inn, innIdx) => (
          <div key={innIdx} className="career-panel">
            <h4>Innings {innIdx + 1} · {service.teamName(inn.battingTeamId)}</h4>
            <p className="big-stat">{inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)})</p>
            <small>Scorecard SHA-256: <code>{activeReplay.completion.scorecardSha256.slice(0, 16)}…</code></small>
          </div>
        ))}
      </div>
      {activeReplay.outcome.status === "UNAVAILABLE" && (
        <p role="status" className="career-warning">
          Ball-by-ball replay unavailable: this fixture was completed before event archives were recorded (legacy v1 career). Its verified scorecard is preserved above without recomputing or inventing new historical deliveries.
        </p>
      )}
      {activeReplay.outcome.status === "DAMAGED" && (
        <p role="status" className="career-error">
          {activeReplay.outcome.message}
        </p>
      )}
      {activeReplay.outcome.status === "READY" && (() => {
        const { replay, archive } = activeReplay.outcome;
        const inningsDeliveries = replay.deliveries.filter((d) => d.inningsIndex === replayInningsTab);
        return (
          <div>
            <p className="replay-meta" data-testid="replay-archive-meta">
              Archive <code>{archive.archiveVersion}</code> · {replay.eventCount} events · {replay.deliveries.length} deliveries · Final event hash <code>{replay.finalEventHash.slice(0, 16)}…</code> · {archive.byteLength.toLocaleString()} bytes
            </p>
            <div className="action-row" role="group" aria-label="Replay innings selection">
              {[0, 1].map((idx) => {
                const inn = replay.scorecard.innings[idx];
                if (!inn) return null;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-pressed={replayInningsTab === idx}
                    onClick={() => setReplayInningsTab(idx)}
                  >
                    Innings {idx + 1}: {service.teamName(inn.battingTeamId)} ({inn.runs}/{inn.wickets})
                  </button>
                );
              })}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Ball</th>
                    <th>Striker</th>
                    <th>Bowler</th>
                    <th>Runs</th>
                    <th>Wicket</th>
                  </tr>
                </thead>
                <tbody>
                  {inningsDeliveries.map((d) => (
                    <tr key={d.sequence}>
                      <td>{d.sequence}</td>
                      <td>{d.over}.{d.ballInOver}</td>
                      <td>{service.playerName(d.strikerId)}</td>
                      <td>{service.playerName(d.bowlerId)}</td>
                      <td>{d.totalRuns}</td>
                      <td>{d.wicketKind ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </section>
  );

  if (busy && !state && savedCareers.length === 0) {
    return <main className="career-shell"><p>Loading Lord Cricket XXVI…</p></main>;
  }

  if (!state) {
    return (
      <main className={`career-shell density-${density}`} style={{ fontSize: `${Number(scale) / 100}rem` }}>
        {inspectionOnly && <p role="status">Career inspection only. Return to the active match before changing the career.</p>}
        <header className="career-masthead">
          <div><p className="eyebrow">LORD CRICKET XXVI</p><h1>Start a <span>Career</span></h1></div>
          <a className="button-link" href="#exhibition" onClick={() => { if (!inspectionOnly) sessionStorage.removeItem(LAUNCH_KEY); }}>{inspectionOnly ? "Return to match" : "Exhibition matches"}</a>
          <a className="button-link" href="#roster-career">Imported roster career</a>
        </header>
        <section className="career-disclosure" aria-label="Product status">
          <strong>Playable alpha.</strong> Fictional eight-team dataset · SYNTHETIC_ALPHA model · one T20 season · no transfers, contracts, finances, international management or verified DLS.
        </section>
        {activeError && <ErrorBanner rawError={activeError} />}
        {checkpointInspectorSection}
        {savedCareers.length > 0 && (
          <section className="career-panel">
            <h2>Continue career</h2>
            <div className="save-list">
              {savedCareers.map((save) => {
                const inspectBtnId = `inspect-checkpoints-${save.saveId}`;
                return (
                  <div key={save.saveId} className="save-slot-row" role="group" aria-label={save.title}>
                    <button
                      className="save-continue-btn"
                      disabled={busy || inspectionOnly}
                      onClick={() => action(async () => {
                        try {
                          await service.loadCareer(save.saveId);
                          setCheckpointView(null);
                          setScreen("HOME");
                        } catch (err) {
                          try {
                            const inspection = await service.inspectCareerCheckpoints(save.saveId);
                            setCheckpointTriggerId(inspectBtnId);
                            setRecoveryTitle(`${inspection.title} (Recovered)`);
                            setCheckpointView(inspection);
                          } catch { /* ignore secondary inspection error */ }
                          throw err;
                        }
                      })}
                    >
                      {save.title} · {save.completedFixtures}/56 · {save.phase}
                      <small>{save.currentDate} · revision {save.revision}</small>
                    </button>
                    <button
                      id={inspectBtnId}
                      type="button"
                      className="save-inspect-btn"
                      disabled={busy || inspectionOnly}
                      onClick={() => void openCheckpointInspector(save.saveId, inspectBtnId)}
                    >
                      Checkpoints
                    </button>
                  </div>
                );
              })}
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
              <button key={candidate.teamId} className="team-card" disabled={busy || inspectionOnly || editingWorld} onClick={() => createCareer(candidate.teamId)}>
                <strong>{candidate.name}</strong>
                <span>{displayWorld.grounds.find(ground => ground.groundId === candidate.teamId.replace("team", "ground"))?.name}</span>
                <span className="team-colours" aria-hidden="true">{candidate.colours.map((colour, index) => <i key={index} style={{ backgroundColor: colour }} />)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="career-panel import-panel">
          <h2>Import portable career</h2>
          <label>Choose .lcxxvi archive<input type="file" accept=".lcxxvi,application/zip" disabled={inspectionOnly} onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)} /></label>
        </section>
      </main>
    );
  }

  const completedManaged = state.completedMatches.filter((completion) => [completion.homeTeamId, completion.awayTeamId].includes(controlledTeam!));
  const currentRound = nextFixture?.roundNumber ?? 14;
  const status = service.getStatus();
  const currentSaveId = service.getSaveId();

  return (
    <main className={`career-shell density-${density} ${reducedMotion ? "reduced-motion" : ""}`} style={{ fontSize: `${Number(scale) / 100}rem` }}>
      {inspectionOnly && <p role="status">Career inspection only. Return to the active match before changing the career.</p>}
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
          <button key={item} aria-current={screen === item ? "page" : undefined} onClick={() => { setActiveReplay(null); setScreen(item); }}>{item[0] + item.slice(1).toLowerCase()}</button>
        ))}
        <a href="#exhibition" onClick={() => { if (!inspectionOnly) sessionStorage.removeItem(LAUNCH_KEY); }}>{inspectionOnly ? "Return to match" : "Exhibition"}</a>
        <button disabled={busy || inspectionOnly} onClick={() => void action(async () => { await service.leaveCareer(); setActiveReplay(null); setCheckpointView(null); setScreen("HOME"); })}>Choose career</button>
      </nav>

      <section className="career-disclosure compact" aria-label="Model disclosure">
        Fictional data · SYNTHETIC_ALPHA · one-season career · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI.
      </section>
      <section className="career-panel" aria-label="Manual career copy">
        <label>Copy name <input value={copyName} maxLength={120} onChange={event => setCopyName(event.currentTarget.value)} /></label>
        <button disabled={busy || service.isReadOnly() || !copyName.trim()} onClick={() => void action(async () => { await service.createManualCopy(copyName); setCopyName(""); })}>Save career copy</button>
      </section>
      {activeError && <ErrorBanner rawError={activeError} />}
      {service.isReadOnly() && <p className="career-warning">This save is read-only because another tab owns its writer lease.</p>}
      {service.wasRecovered() && <p className="career-warning">Recovered from a verified checkpoint into a new career copy. The damaged source save was preserved untouched.</p>}

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
                  {state.careerState.currentDate < nextFixture.matchDayDate ? (
                    <button className="primary" disabled={busy || inspectionOnly || service.isReadOnly()} onClick={() => action(async () => { await service.simulateToNextUserFixture(); })}>Advance to match day</button>
                  ) : (
                    <div className="action-row">
                      <button className="primary" disabled={busy || inspectionOnly || service.isReadOnly()} onClick={() => action(async () => { await service.simulateManagedFixture(); await settleStandard(); setPendingMatch(null); })}>Simulate match</button>
                      <button disabled={busy || inspectionOnly || service.isReadOnly()} onClick={() => void playMatch()}>Play match</button>
                    </div>
                  )}
                  {pendingMatch && <p role="status" data-testid="pending-career-match">A match for round {pendingMatch.round ?? nextFixture.roundNumber} is already in progress. Play match resumes it.</p>}
                  <p className="big-stat">Round {nextFixture.roundNumber}</p>
                  <p><strong>{service.teamName(nextFixture.homeTeamId)}</strong> v <strong>{service.teamName(nextFixture.awayTeamId)}</strong></p>
                  <p>{nextFixture.matchDayDate} · {service.groundName(nextFixture.groundId)}</p>
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
          {replayViewerSection}
          <h3>Managed-team results</h3>
          <div className="table-wrap"><table><thead><tr><th>Rnd</th><th>Date</th><th>Fixture</th><th>Result</th><th>Replay</th></tr></thead><tbody>{state.schedule.fixtures.filter((fixture) => [fixture.homeTeamId, fixture.awayTeamId].includes(controlledTeam!)).map((fixture) => {
            const completion = completionByFixture.get(fixture.fixtureId);
            const replayBtnId = `replay-career-${fixture.fixtureId}`;
            return (
              <tr key={fixture.fixtureId}>
                <td>{fixture.roundNumber}</td>
                <td>{fixture.matchDayDate}</td>
                <td>{service.teamName(fixture.homeTeamId)} v {service.teamName(fixture.awayTeamId)}</td>
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
                  ) : "–"}
                </td>
              </tr>
            );
          })}</tbody></table></div>
        </section>
      )}

      {screen === "SQUAD" && (
        <section aria-labelledby="squad-heading">
          <h2 id="squad-heading">Squad</h2>
          <p>Training changes affect temporary readiness and daily recovery only. There is no permanent attribute growth in V0.1.</p>
          <div className="table-wrap"><table><thead><tr><th>Player</th><th>Role</th><th>Availability</th><th>Fatigue</th><th>Bat</th><th>Bowl</th><th>Field</th><th>Training</th></tr></thead><tbody>{service.squadView()?.players.map((condition) => {
            const player = displayWorld.players.find((candidate) => candidate.playerId === condition.playerId)!;
            return <tr key={condition.playerId}><td><button type="button" className="player-link" id={`player-link-SQUAD-${player.playerId}`} aria-label={`View ${player.name}`} onClick={() => openPlayer(player.playerId, "SQUAD")}>{player.name}</button><small>{player.playerId}</small></td><td>{player.role}</td><td>{condition.availability}{condition.availabilityReason ? <small>{condition.availabilityReason}</small> : null}</td><td>{percentageBp(condition.fatigueBp)}</td><td>{condition.battingReadiness > 0 ? "+" : ""}{condition.battingReadiness}</td><td>{condition.bowlingReadiness > 0 ? "+" : ""}{condition.bowlingReadiness}</td><td>{condition.fieldingReadiness > 0 ? "+" : ""}{condition.fieldingReadiness}</td><td><label className="sr-label" htmlFor={`training-${condition.playerId}`}>Training for {player.name}</label><select id={`training-${condition.playerId}`} disabled={busy || inspectionOnly || service.isReadOnly() || state.phase === "COMPLETE"} value={condition.directive} onChange={(event) => void action(async () => { await service.setTraining(condition.playerId, event.currentTarget.value as TrainingDirective); })}>{directives.map((directive) => <option key={directive} value={directive}>{directive.replaceAll("_", " ")}</option>)}</select></td></tr>;
          })}</tbody></table></div>
        </section>
      )}

      {screen === "FIXTURES" && (
        <section aria-labelledby="fixtures-heading">
          <h2 id="fixtures-heading">Fixtures</h2>
          {replayViewerSection}
          {state.schedule.rounds.map((round) => (
            <section className="round-block" key={round.roundNumber} aria-labelledby={`round-${round.roundNumber}`}>
              <h3 id={`round-${round.roundNumber}`}>Round {round.roundNumber} · {round.matchDayDate}</h3>
              <div className="table-wrap"><table><thead><tr><th>Home</th><th>Away</th><th>Ground</th><th>Status</th><th>Result</th><th>Replay</th></tr></thead><tbody>{state.schedule.fixtures.filter((fixture) => fixture.roundNumber === round.roundNumber).map((fixture) => {
                const completion = completionByFixture.get(fixture.fixtureId);
                const managed = [fixture.homeTeamId, fixture.awayTeamId].includes(controlledTeam!);
                const replayBtnId = `replay-fixtures-${fixture.fixtureId}`;
                return (
                  <tr key={fixture.fixtureId} className={managed ? "managed-fixture" : ""}>
                    <td>{service.teamName(fixture.homeTeamId)}</td>
                    <td>{service.teamName(fixture.awayTeamId)}</td>
                    <td>{service.groundName(fixture.groundId)}</td>
                    <td>{completion ? "Completed" : "Scheduled"}{managed ? <small>Managed fixture</small> : null}</td>
                    <td>{completion ? service.resultText(completion) : "–"}</td>
                    <td>
                      {completion ? (
                        <button
                          id={replayBtnId}
                          type="button"
                          className="replay-btn"
                          disabled={busy}
                          aria-label={`View replay for ${service.teamName(fixture.homeTeamId)} v ${service.teamName(fixture.awayTeamId)}`}
                          onClick={() => void openReplay(fixture.fixtureId, replayBtnId)}
                        >
                          View replay
                        </button>
                      ) : "–"}
                    </td>
                  </tr>
                );
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
            <h3>Career file &amp; recovery</h3>
            <div className="action-row">
              <button disabled={busy || inspectionOnly} onClick={() => void exportCareer()}>Export .lcxxvi</button>
              {currentSaveId && (
                <button
                  id="settings-inspect-checkpoints"
                  type="button"
                  disabled={busy || inspectionOnly}
                  onClick={() => void openCheckpointInspector(currentSaveId, "settings-inspect-checkpoints")}
                >
                  Inspect checkpoints
                </button>
              )}
            </div>
            <label className="file-import-label">Import validated .lcxxvi archive<input type="file" accept=".lcxxvi,application/zip" disabled={inspectionOnly} onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)} /></label>
          </div>
          {checkpointInspectorSection}
        </section>
      )}
    </main>
  );
}
