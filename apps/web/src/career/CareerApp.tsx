import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AcademyTrainingFocus,
  SeasonCheckpointInspection,
  T20SeasonMatchCompletion,
  TrainingDirective,
} from "@lcxxvi/contracts";
import { MAX_ACTIVE_TEAM_SQUAD_SIZE, MIN_ACTIVE_TEAM_SQUAD_SIZE } from "@lcxxvi/contracts";
import {
  CareerApplicationService,
  careerWorld,
  type CareerReplayOutcome,
  type CareerUserMatchResult,
} from "./service.js";
import {
  PlayerPage,
  type PlayerFormat,
  type PlayerSeasonBreakdownRow,
} from "./PlayerPage.js";
import {
  managedBindings,
  recordManagedLaunch,
  settleManagedMatches,
} from "./managed-match.js";
import { PitchInspection } from "../match/PitchInspection.js";
import { PreMatchBriefingPanel } from "../match/TacticalBriefingPanels.js";
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
  try {
    await managedBindings.rekeyCareer(from, to);
  } catch {
    /* the pending match is then reported, not applied */
  }
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
    isFixtureCompleted: (fixtureId) => Boolean(service.findCompletionByFixtureId(fixtureId)),
    apply: async ({ result }) => {
      if (!result.careerResult) {
        throw new Error("The completed match produced no career result.");
      }
      await service.completeUserMatch(result.careerResult, result.t20Session);
    },
  });
}

function clearLaunchCache() {
  try {
    sessionStorage.removeItem(RESULT_KEY);
    sessionStorage.removeItem(LAUNCH_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Screen =
  | "HOME"
  | "CAREER"
  | "SQUAD"
  | "CONTRACTS"
  | "FIXTURES"
  | "STATISTICS"
  | "SETTINGS"
  | "PLAYER";
type StatsScope = "ACTIVE" | "ALL_TIME" | number;

const directives: TrainingDirective[] = [
  "REST",
  "BATTING_PRACTICE",
  "BOWLING_PRACTICE",
  "FIELDING_PRACTICE",
];

const academyFocusOptions: AcademyTrainingFocus[] = [
  "BALANCED",
  "BATTING_PRACTICE",
  "BOWLING_PRACTICE",
  "FIELDING_PRACTICE",
];

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
      {isStructured && (
        <small>
          Diagnostic code: <code>{desc.code}</code>
        </small>
      )}
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
  const [playerOrigin, setPlayerOrigin] = useState<"SQUAD" | "STATISTICS" | "CONTRACTS">("SQUAD");
  const [restorePlayerFocus, setRestorePlayerFocus] = useState<string | null>(null);
  const [playerFormat, setPlayerFormat] = useState<PlayerFormat>(() => {
    const stored = localStorage.getItem("lcxxvi-player-format");
    return stored === "ODI" || stored === "RED_BALL" ? stored : "T20";
  });
  const [statsScope, setStatsScope] = useState<StatsScope>("ACTIVE");
  const [historySeasonView, setHistorySeasonView] = useState<number | null>(null);
  const [freeAgentRoleFilter, setFreeAgentRoleFilter] = useState<string>("ALL");
  const [ledgerScope, setLedgerScope] = useState<"MANAGED" | "ALL">("MANAGED");
  const [offerDrafts, setOfferDrafts] = useState<
    Record<string, { wageK: string; termSeasons: string }>
  >({});

  function openPlayer(id: string, origin: "SQUAD" | "STATISTICS" | "CONTRACTS") {
    setPlayerId(id);
    setPlayerOrigin(origin);
    setScreen("PLAYER");
  }
  function getOfferDraft(id: string, defaultWageK: number, defaultTerm: number) {
    return (
      offerDrafts[id] ?? {
        wageK: String(defaultWageK),
        termSeasons: String(defaultTerm),
      }
    );
  }
  function updateOfferDraft(
    id: string,
    defaultWageK: number,
    defaultTerm: number,
    patch: Partial<{ wageK: string; termSeasons: string }>,
  ) {
    setOfferDrafts((prev) => {
      const cur = prev[id] ?? { wageK: String(defaultWageK), termSeasons: String(defaultTerm) };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }
  function changePlayerFormat(value: PlayerFormat) {
    setPlayerFormat(value);
    localStorage.setItem("lcxxvi-player-format", value);
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
  const [showTacticalBriefings, setShowTacticalBriefings] = useState(
    () => localStorage.getItem("lcxxvi-tactical-briefings") !== "hidden",
  );
  const state = service.getState();
  const persistentWorld = service.getPersistentState();
  const lifecycleState = service.getLifecycleState();
  const economyState = service.getEconomyState();
  const latestTransition = service.latestLifecycleTransition();
  const latestEconomyTransition = service.latestEconomyTransition();
  const managedBudget = service.managedClubBudget();

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
    async function afterBoot(): Promise<void> {
      if (inspectionOnly) return;
      const settled = await settleStandard();
      if (settled) {
        if (settled.applied.length) clearLaunchCache();
        if (alive) setUiError(settled.errors.join(" "));
        if (alive) {
          setPendingMatch(
            settled.pending.length ? { round: roundOf(settled.pending[0]!.launch) } : null,
          );
        }
      }
      let pending: string | null = null;
      try {
        pending = sessionStorage.getItem(RESULT_KEY);
      } catch {
        /* storage unavailable */
      }
      if (pending && !service.isReadOnly()) {
        const parsed = JSON.parse(pending) as CareerUserMatchResult;
        await service.completeUserMatch(parsed);
        clearLaunchCache();
        try {
          const saveId = service.getSaveId();
          const { bindings } = saveId
            ? await managedBindings.pendingForCareer(saveId)
            : { bindings: [] };
          const matchGameId =
            bindings.find((b) => b.fixtureId === parsed.fixtureId)?.matchGameId ??
            `career-match-${parsed.fixtureId}`;
          await managedBindings.resolve(matchGameId, "APPLIED", "RESULT_APPLIED");
        } catch {
          /* no binding for legacy launches */
        }
      }
    }
    const releaseWriter = () => {
      void service.releaseWriter();
    };
    window.addEventListener("pagehide", releaseWriter);
    void (async () => {
      try {
        if (inspectionOnly) await service.inspectActiveCareer();
        else await service.boot();
        await afterBoot();
        if (alive) {
          setSavedCareers(await service.listCareers());
          setBusy(false);
        }
        for (
          let attempt = 0;
          alive && !inspectionOnly && service.isReadOnly() && attempt < 6;
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          if (!alive) break;
          await service.boot();
          if (!service.isReadOnly()) {
            await afterBoot();
            if (alive) setSavedCareers(await service.listCareers());
          }
        }
      } catch (error) {
        if (alive) {
          setUiError(error instanceof Error ? error.message : "Career startup failed.");
        }
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
    localStorage.setItem("lcxxvi-tactical-briefings", showTacticalBriefings ? "shown" : "hidden");
  }, [scale, density, reducedMotion, showTacticalBriefings]);

  async function action(work: () => Promise<void>) {
    if (inspectionOnly) {
      setUiError("Return to the active match before changing the career.");
      return;
    }
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
      setStatsScope("ACTIVE");
      setHistorySeasonView(null);
      setScreen("HOME");
    });
  }

  async function playMatch() {
    await action(async () => {
      const prepared = await service.prepareUserMatch();
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
      a.download = persistentWorld
        ? `lord-cricket-world-${persistentWorld.worldIdentity.worldId}-s${persistentWorld.currentSeasonNumber}.lcxxvi`
        : `lord-cricket-career-${state?.seasonId ?? "season"}.lcxxvi`;
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
      setStatsScope("ACTIVE");
      setHistorySeasonView(null);
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
      setStatsScope("ACTIVE");
      setHistorySeasonView(null);
      setScreen("HOME");
    });
  }

  async function openReplay(fixtureId: string, triggerId: string) {
    const completion = service.findCompletionByFixtureId(fixtureId);
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
        <button type="button" onClick={closeCheckpointInspector}>
          Close checkpoint inspector
        </button>
      </div>
      <p>
        Corrupted checkpoints and damaged original saves are retained untouched. Choosing a verified
        generation below creates a new recovered career copy.
      </p>
      {checkpointView.corruptedGenerations.length > 0 ? (
        <p role="status" className="career-warning">
          Corrupted checkpoint generations detected and isolated:{" "}
          {checkpointView.corruptedGenerations.map((g) => `G${g}`).join(", ")}.
        </p>
      ) : (
        <p role="status">All stored checkpoint generations passed SHA-256 and schema verification.</p>
      )}
      {checkpointView.validGenerations.length === 0 ? (
        <p role="status" className="career-error">
          No verified checkpoint generation remains on this slot. The damaged save is preserved;
          load an earlier manual copy or import a validated .lcxxvi archive.
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
                    <td>
                      G{gen.generation}
                      {gen.checkpointSerial === checkpointView.currentSerial ? (
                        <small>Newest</small>
                      ) : (
                        <small>Older</small>
                      )}
                    </td>
                    <td>{gen.revision}</td>
                    <td>
                      {gen.completedFixtures}/56 · {gen.phase}
                    </td>
                    <td>{gen.currentDate}</td>
                    <td>{gen.createdAt}</td>
                    <td>
                      <code>{gen.stateSha256.slice(0, 12)}…</code>
                    </td>
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
          Archived match replay · Round {activeReplay.completion.roundNumber} ·{" "}
          {service.teamName(activeReplay.completion.homeTeamId)} v{" "}
          {service.teamName(activeReplay.completion.awayTeamId)}
        </h3>
        <button type="button" onClick={closeReplay}>
          Close replay
        </button>
      </div>
      <p>
        <strong>{service.resultText(activeReplay.completion)}</strong> ·{" "}
        {activeReplay.completion.matchDayDate} · Source: {activeReplay.completion.source}
      </p>
      <div className="career-summary-grid">
        {activeReplay.completion.scorecard.innings.map((inn, innIdx) => (
          <div key={innIdx} className="career-panel">
            <h4>
              Innings {innIdx + 1} · {service.teamName(inn.battingTeamId)}
            </h4>
            <p className="big-stat">
              {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)})
            </p>
            <small>
              Scorecard SHA-256: <code>{activeReplay.completion.scorecardSha256.slice(0, 16)}…</code>
            </small>
          </div>
        ))}
      </div>
      {activeReplay.outcome.status === "UNAVAILABLE" && (
        <p role="status" className="career-warning">
          Ball-by-ball replay unavailable: this fixture was completed before event archives were
          recorded (legacy v1 career). Its verified scorecard is preserved above without
          recomputing or inventing new historical deliveries.
        </p>
      )}
      {activeReplay.outcome.status === "DAMAGED" && (
        <p role="status" className="career-error">
          {activeReplay.outcome.message}
        </p>
      )}
      {activeReplay.outcome.status === "READY" &&
        (() => {
          const { replay, archive } = activeReplay.outcome;
          const inningsDeliveries = replay.deliveries.filter(
            (d) => d.inningsIndex === replayInningsTab,
          );
          return (
            <div>
              <p className="replay-meta" data-testid="replay-archive-meta">
                Archive <code>{archive.archiveVersion}</code> · {replay.eventCount} events ·{" "}
                {replay.deliveries.length} deliveries · Final event hash{" "}
                <code>{replay.finalEventHash.slice(0, 16)}…</code>
                {"byteLength" in archive ? ` · ${archive.byteLength.toLocaleString()} bytes` : ""}
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
                      Innings {idx + 1}: {service.teamName(inn.battingTeamId)} ({inn.runs}/
                      {inn.wickets})
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
                        <td>
                          {d.over}.{d.ballInOver}
                        </td>
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
    return (
      <main className="career-shell">
        <p>Loading Lord Cricket XXVI…</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main
        className={`career-shell density-${density}`}
        style={{ fontSize: `${Number(scale) / 100}rem` }}
      >
        {inspectionOnly && (
          <p role="status">
            Career inspection only. Return to the active match before changing the career.
          </p>
        )}
        <header className="career-masthead">
          <div>
            <p className="eyebrow">LORD CRICKET XXVI</p>
            <h1>
              Start a <span>Career</span>
            </h1>
          </div>
          <a
            className="button-link"
            href="#exhibition"
            onClick={() => {
              if (!inspectionOnly) sessionStorage.removeItem(LAUNCH_KEY);
            }}
          >
            {inspectionOnly ? "Return to match" : "Exhibition matches"}
          </a>
          <a className="button-link" href="#roster-career">
            Imported roster career
          </a>
        </header>
        <section className="career-disclosure" aria-label="Product status">
          <strong>Playable alpha.</strong> Fictional eight-team dataset · SYNTHETIC_ALPHA model ·
          persistent multi-season T20 world with fictional player lifecycle &amp; youth pathway · no
          transfers, contracts, finances, international management or verified DLS.
        </section>
        {activeError && <ErrorBanner rawError={activeError} />}
        {checkpointInspectorSection}
        {savedCareers.length > 0 && (
          <section className="career-panel">
            <h2>Continue career</h2>
            <div className="save-list">
              {savedCareers.map((save) => {
                const inspectBtnId = `inspect-checkpoints-${save.saveId}`;
                const modeLabel =
                  save.careerMode === "PERSISTENT_WORLD"
                    ? `Season ${save.currentSeasonNumber} (${save.currentCalendarYear}) · ${save.completedSeasonCount} closed`
                    : "Single-season V0.1 save";
                return (
                  <div
                    key={save.saveId}
                    className="save-slot-row"
                    role="group"
                    aria-label={save.title}
                  >
                    <button
                      className="save-continue-btn"
                      disabled={busy || inspectionOnly}
                      onClick={() =>
                        action(async () => {
                          try {
                            await service.loadCareer(save.saveId);
                            setCheckpointView(null);
                            setStatsScope("ACTIVE");
                            setHistorySeasonView(null);
                            setScreen("HOME");
                          } catch (err) {
                            try {
                              const inspection = await service.inspectCareerCheckpoints(save.saveId);
                              setCheckpointTriggerId(inspectBtnId);
                              setRecoveryTitle(`${inspection.title} (Recovered)`);
                              setCheckpointView(inspection);
                            } catch {
                              /* ignore secondary inspection error */
                            }
                            throw err;
                          }
                        })
                      }
                    >
                      {save.title} · {save.completedFixtures}/56 · {save.phase}
                      <small>
                        {modeLabel} · {save.currentDate} · revision {save.revision}
                      </small>
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
          <p>
            Choose the team you will manage across consecutive 14-round, 56-match T20 seasons in a
            persistent world.
          </p>
          {editingWorld ? (
            <WorldEditor
              base={careerWorld}
              initial={stagedWorld}
              onClose={() => {
                setEditingWorld(false);
                setRestoreEditorFocus(true);
              }}
              onStage={(copy) => {
                setStagedWorld(copy);
                setEditingWorld(false);
                setRestoreEditorFocus(true);
              }}
            />
          ) : (
            <div className="action-row">
              <button
                ref={editWorldButton}
                type="button"
                onClick={() => setEditingWorld(true)}
              >
                Edit names and colours
              </button>
              {stagedWorld && (
                <button type="button" onClick={() => setStagedWorld(null)}>
                  Use original world
                </button>
              )}
            </div>
          )}
          {stagedWorld && (
            <p role="status">
              Edited world ready for a new career. Existing careers remain unchanged.
            </p>
          )}
          <div className="team-picker">
            {displayWorld.teams.map((candidate) => (
              <button
                key={candidate.teamId}
                className="team-card"
                disabled={busy || inspectionOnly || editingWorld}
                onClick={() => createCareer(candidate.teamId)}
              >
                <strong>{candidate.name}</strong>
                <span>
                  {
                    displayWorld.grounds.find(
                      (ground) => ground.groundId === candidate.teamId.replace("team", "ground"),
                    )?.name
                  }
                </span>
                <span className="team-colours" aria-hidden="true">
                  {candidate.colours.map((colour, index) => (
                    <i key={index} style={{ backgroundColor: colour }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="career-panel import-panel">
          <h2>Import portable career</h2>
          <label>
            Choose .lcxxvi archive
            <input
              type="file"
              accept=".lcxxvi,application/zip"
              disabled={inspectionOnly}
              onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        </section>
      </main>
    );
  }

  const completedManaged = state.completedMatches.filter((completion) =>
    [completion.homeTeamId, completion.awayTeamId].includes(controlledTeam!),
  );
  const currentRound = nextFixture?.roundNumber ?? 14;
  const status = service.getStatus();
  const currentSaveId = service.getSaveId();
  const activeRevision = persistentWorld ? persistentWorld.revision : state.revision;
  const inspectedCompletedSeason =
    persistentWorld && historySeasonView !== null
      ? persistentWorld.completedSeasons.find((s) => s.seasonNumber === historySeasonView) ?? null
      : null;

  return (
    <main
      className={`career-shell density-${density} ${reducedMotion ? "reduced-motion" : ""}`}
      style={{ fontSize: `${Number(scale) / 100}rem` }}
    >
      {inspectionOnly && (
        <p role="status">
          Career inspection only. Return to the active match before changing the career.
        </p>
      )}
      <header className="career-masthead">
        <div>
          <p className="eyebrow">LORD CRICKET XXVI · MANAGEMENT</p>
          <h1>{team?.name ?? "Career"}</h1>
          {team && (
            <div className="team-colours" aria-hidden="true">
              {team.colours.map((colour, index) => (
                <i key={index} style={{ backgroundColor: colour }} />
              ))}
            </div>
          )}
          <p data-testid="career-masthead-subtitle">
            {persistentWorld
              ? `Season ${persistentWorld.currentSeasonNumber} (${persistentWorld.currentCalendarYear}) · `
              : "Single-season V0.1 · "}
            {state.phase === "COMPLETE"
              ? "Season complete"
              : `Round ${currentRound} · ${state.careerState.currentDate}`}
          </p>
        </div>
        <div className="save-badge" data-status={status.toLowerCase()}>
          <strong>{status}</strong>
          <small>
            {state.completedMatches.length}/56 fixtures · rev {activeRevision}
          </small>
        </div>
      </header>

      <nav className="career-nav" aria-label="Career navigation">
        {([
          "HOME",
          "CAREER",
          "SQUAD",
          ...(persistentWorld ? (["CONTRACTS"] as Screen[]) : []),
          "FIXTURES",
          "STATISTICS",
          "SETTINGS",
        ] as Screen[]).map(
          (item) => (
            <button
              key={item}
              aria-current={screen === item ? "page" : undefined}
              onClick={() => {
                setActiveReplay(null);
                setScreen(item);
              }}
            >
              {item[0] + item.slice(1).toLowerCase()}
            </button>
          ),
        )}
        <a
          href="#exhibition"
          onClick={() => {
            if (!inspectionOnly) sessionStorage.removeItem(LAUNCH_KEY);
          }}
        >
          {inspectionOnly ? "Return to match" : "Exhibition"}
        </a>
        <button
          disabled={busy || inspectionOnly}
          onClick={() =>
            void action(async () => {
              await service.leaveCareer();
              setActiveReplay(null);
              setCheckpointView(null);
              setScreen("HOME");
            })
          }
        >
          Choose career
        </button>
      </nav>

      <section className="career-disclosure compact" aria-label="Model disclosure">
        {persistentWorld
          ? economyState && lifecycleState
            ? `Fictional data · SYNTHETIC_ALPHA · persistent world V3 (${persistentWorld.completedSeasons.length} completed seasons) · fictional lifecycle (${lifecycleState.model.modelVersion}) · fictional domestic contracts & budgets (${economyState.model.modelVersion}, symmetrical AI caps) · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI.`
            : lifecycleState
              ? `Fictional data · SYNTHETIC_ALPHA · persistent world V2 (${persistentWorld.completedSeasons.length} completed seasons) · fictional player lifecycle (${lifecycleState.model.modelVersion}) · contracts and finances deferred in V2 · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI.`
              : `Fictional data · SYNTHETIC_ALPHA · Stage 2 V1 persistent world (${persistentWorld.completedSeasons.length} completed seasons) · permanent ageing and contracts deferred in V1 · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI.`
          : "Fictional data · SYNTHETIC_ALPHA · legacy V0.1 single-season career · DLS disabled · fixture autopilot is deterministic baseline completion, not tactical AI."}
      </section>
      {persistentWorld && !economyState && (
        <section className="career-panel" aria-label="Player lifecycle upgrade">
          <p>
            {lifecycleState ? (
              <>
                This save uses Stage 3 <code>LC_PERSISTENT_WORLD_V2_LIFECYCLE</code> (no domestic
                contracts or free-agent market). You can create a Stage 4{" "}
                <code>LC_PERSISTENT_WORLD_V3_ECONOMY</code> copy in a new slot while keeping this V2
                save untouched.
              </>
            ) : (
              <>
                This save uses Stage 2 <code>LC_PERSISTENT_WORLD_V1</code>. You can create a Stage 3
                lifecycle copy or a Stage 4 contracts &amp; economy copy in a new slot while keeping
                this V1 save untouched.
              </>
            )}
          </p>
          <div className="action-row">
            {!lifecycleState && (
              <button
                type="button"
                data-testid="upgrade-v1-to-lifecycle-btn"
                disabled={busy || inspectionOnly || service.isReadOnly()}
                onClick={() =>
                  void action(async () => {
                    await service.upgradeStage2V1ToStage3V2();
                    setActiveReplay(null);
                    setStatsScope("ACTIVE");
                  })
                }
              >
                Create V2 player lifecycle copy
              </button>
            )}
            <button
              type="button"
              data-testid="upgrade-to-stage4-economy-btn"
              disabled={busy || inspectionOnly || service.isReadOnly()}
              onClick={() =>
                void action(async () => {
                  await service.upgradeToStage4EconomyV3();
                  setActiveReplay(null);
                  setStatsScope("ACTIVE");
                })
              }
            >
              Create V3 contracts &amp; economy copy
            </button>
          </div>
        </section>
      )}
      <section className="career-panel" aria-label="Manual career copy">
        <label>
          Copy name{" "}
          <input
            value={copyName}
            maxLength={120}
            onChange={(event) => setCopyName(event.currentTarget.value)}
          />
        </label>
        <button
          disabled={busy || service.isReadOnly() || !copyName.trim()}
          onClick={() =>
            void action(async () => {
              await service.createManualCopy(copyName);
              setCopyName("");
            })
          }
        >
          Save career copy
        </button>
      </section>
      {activeError && <ErrorBanner rawError={activeError} />}
      {service.isReadOnly() && (
        <p className="career-warning">
          This save is read-only because another tab owns its writer lease.
        </p>
      )}
      {service.wasRecovered() && (
        <p className="career-warning">
          Recovered from a verified checkpoint into a new career copy. The damaged source save was
          preserved untouched.
        </p>
      )}

      {screen === "HOME" && (
        <section aria-labelledby="home-heading">
          <h2 id="home-heading">Home</h2>
          <div className="dashboard-grid">
            <article className="career-panel emphasis">
              <h3>Next required action</h3>
              {state.phase === "COMPLETE" ? (
                <>
                  <p className="big-stat">Season complete</p>
                  <p>
                    Champion: <strong>{service.teamName(state.projection.table[0]?.teamId)}</strong>
                  </p>
                  {persistentWorld ? (
                    <div className="action-row" style={{ marginTop: "10px" }}>
                      <button
                        type="button"
                        className="primary"
                        data-testid="rollover-next-season-btn"
                        disabled={busy || inspectionOnly || service.isReadOnly()}
                        onClick={() =>
                          void action(async () => {
                            const closingId = state.seasonId;
                            await service.closeSeasonAndAdvance(closingId);
                            setActiveReplay(null);
                            setStatsScope("ACTIVE");
                          })
                        }
                      >
                        Close season &amp; advance to Season{" "}
                        {persistentWorld.currentSeasonNumber + 1} ({
                          persistentWorld.currentCalendarYear + 1
                        })
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: "10px" }}>
                      <p>
                        This V0.1 single-season save remains frozen as completed. You can start a
                        new multi-season copy from this exact outcome without altering the original
                        slot.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        data-testid="copy-to-persistent-world-btn"
                        disabled={busy || inspectionOnly || service.isReadOnly()}
                        onClick={() =>
                          void action(async () => {
                            await service.copySingleSeasonToPersistentWorld();
                            setActiveReplay(null);
                            setStatsScope("ACTIVE");
                          })
                        }
                      >
                        Copy into multi-season world (Season 2)
                      </button>
                    </div>
                  )}
                </>
              ) : nextFixture ? (
                <>
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
                        className="primary"
                        disabled={busy || inspectionOnly || service.isReadOnly()}
                        onClick={() =>
                          action(async () => {
                            await service.simulateManagedFixture();
                            await settleStandard();
                            setPendingMatch(null);
                          })
                        }
                      >
                        Simulate match
                      </button>
                      <button
                        disabled={busy || inspectionOnly || service.isReadOnly()}
                        onClick={() => void playMatch()}
                      >
                        Play match
                      </button>
                    </div>
                  )}
                  {pendingMatch && (
                    <p role="status" data-testid="pending-career-match">
                      A match for round {pendingMatch.round ?? nextFixture.roundNumber} is already
                      in progress. Play match resumes it.
                    </p>
                  )}
                  <p className="big-stat">Round {nextFixture.roundNumber}</p>
                  <p>
                    <strong>{service.teamName(nextFixture.homeTeamId)}</strong> v{" "}
                    <strong>{service.teamName(nextFixture.awayTeamId)}</strong>
                  </p>
                  <p>
                    {nextFixture.matchDayDate} · {service.groundName(nextFixture.groundId)}
                  </p>
                  <PitchInspection
                    ground={displayWorld.grounds.find(
                      (ground) => ground.groundId === nextFixture.groundId,
                    )}
                    format="T20"
                  />
                  {showTacticalBriefings && (() => {
                    const briefing = service.fixtureBriefing(nextFixture.fixtureId);
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
                  {tableRow.wins}W · {tableRow.losses}L · {tableRow.ties}T · {tableRow.noResults}NR
                  · {tableRow.points} pts · NRR{" "}
                  {tableRow.nrrX1000 === null ? "–" : (tableRow.nrrX1000 / 1000).toFixed(3)}
                </p>
              )}
            </article>
            <article className="career-panel">
              <h3>Condition</h3>
              {(() => {
                const squad = service.squadView();
                const avg = squad
                  ? Math.round(
                      squad.players.reduce((sum, player) => sum + player.fatigueBp, 0) /
                        squad.players.length,
                    )
                  : 0;
                const unavailable =
                  squad?.players.filter((player) => player.availability === "UNAVAILABLE").length ??
                  0;
                return (
                  <>
                    <p className="big-stat">{percentageBp(avg)} fatigue</p>
                    <p>
                      {unavailable} unavailable ·{" "}
                      {squad?.players.filter((p) => p.directive !== "REST").length ?? 0} in practice
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
                  Season {persistentWorld.currentSeasonNumber} ({persistentWorld.currentCalendarYear})
                  · {persistentWorld.completedSeasons.length} completed{" "}
                  {persistentWorld.completedSeasons.length === 1 ? "season" : "seasons"}
                </p>
              )}
            </article>
          </div>
        </section>
      )}

      {screen === "CAREER" && (
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
              <p>Date {state.careerState.currentDate}</p>
              <p>Round {currentRound} of 14</p>
              {persistentWorld && (
                <small>
                  World <code>{persistentWorld.worldIdentity.worldId}</code> ·{" "}
                  {persistentWorld.completedSeasons.length} sealed{" "}
                  {persistentWorld.completedSeasons.length === 1 ? "season" : "seasons"}
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
                Fictional lifecycle parameters (<code>{lifecycleState?.model.modelVersion}</code>) —
                permanent off-season ageing, training progression, retirements, and youth intake.
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
                              {record.startDate} to {record.endDate}
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
                    <table>
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
                                <td>{completion.matchDayDate}</td>
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
            <table>
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
                        <td>{fixture.matchDayDate}</td>
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
        </section>
      )}

      {screen === "SQUAD" && (
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
      )}

      {screen === "FIXTURES" && (
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
                Round {round.roundNumber} · {round.matchDayDate}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Home</th>
                      <th>Away</th>
                      <th>Ground</th>
                      <th>Status</th>
                      <th>Result</th>
                      <th>Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.schedule.fixtures
                      .filter((fixture) => fixture.roundNumber === round.roundNumber)
                      .map((fixture) => {
                        const completion = completionByFixture.get(fixture.fixtureId);
                        const managed = [fixture.homeTeamId, fixture.awayTeamId].includes(
                          controlledTeam!,
                        );
                        const replayBtnId = `replay-fixtures-${fixture.fixtureId}`;
                        return (
                          <tr
                            key={fixture.fixtureId}
                            className={managed ? "managed-fixture" : ""}
                          >
                            <td>{service.teamName(fixture.homeTeamId)}</td>
                            <td>{service.teamName(fixture.awayTeamId)}</td>
                            <td>{service.groundName(fixture.groundId)}</td>
                            <td>
                              {completion ? "Completed" : "Scheduled"}
                              {managed ? <small>Managed fixture</small> : null}
                            </td>
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
            </section>
          ))}
        </section>
      )}

      {screen === "STATISTICS" && (
        <section aria-labelledby="statistics-heading">
          <h2 id="statistics-heading">Statistics</h2>
          {persistentWorld && (
            <div
              className="action-row scope-bar"
              role="group"
              aria-label="Statistics scope"
              data-testid="statistics-scope-bar"
            >
              <button
                type="button"
                aria-pressed={statsScope === "ACTIVE"}
                onClick={() => setStatsScope("ACTIVE")}
              >
                Active Season {persistentWorld.currentSeasonNumber} ({
                  persistentWorld.currentCalendarYear
                })
              </button>
              <button
                type="button"
                aria-pressed={statsScope === "ALL_TIME"}
                onClick={() => setStatsScope("ALL_TIME")}
              >
                All-time career ({persistentWorld.careerProjection.totalMatchesApplied} matches)
              </button>
              {persistentWorld.completedSeasons.map((record) => (
                <button
                  key={record.seasonId}
                  type="button"
                  aria-pressed={statsScope === record.seasonNumber}
                  onClick={() => setStatsScope(record.seasonNumber)}
                >
                  Season {record.seasonNumber} ({record.calendarYear})
                </button>
              ))}
            </div>
          )}

          {persistentWorld && statsScope === "ALL_TIME" ? (
            <div data-testid="all-time-career-statistics">
              <h3>All-time club honours &amp; records</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Closed seasons</th>
                      <th>Titles</th>
                      <th>Runner-up</th>
                      <th>P</th>
                      <th>W</th>
                      <th>L</th>
                      <th>T</th>
                      <th>NR</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...persistentWorld.careerProjection.teamHistory]
                      .sort(
                        (a, b) =>
                          b.titles - a.titles ||
                          b.points - a.points ||
                          b.wins - a.wins ||
                          a.teamId.localeCompare(b.teamId),
                      )
                      .map((row) => (
                        <tr
                          key={row.teamId}
                          className={row.teamId === controlledTeam ? "managed-fixture" : ""}
                        >
                          <td>{service.teamName(row.teamId)}</td>
                          <td>{row.seasonsCompleted}</td>
                          <td>
                            <strong>{row.titles}</strong>
                          </td>
                          <td>{row.runnerUpFinishes}</td>
                          <td>{row.played}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.ties}</td>
                          <td>{row.noResults}</td>
                          <td>{row.points}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <h3>All-time player leaders</h3>
              <div className="stats-grid">
                <div className="career-panel">
                  <h4>Career runs</h4>
                  <ol>
                    {persistentWorld.careerProjection.leaders.runs.map((entry) => (
                      <li key={entry.playerId}>
                        <span>{service.playerName(entry.playerId)}</span>
                        <strong>{entry.value}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="career-panel">
                  <h4>Career wickets</h4>
                  <ol>
                    {persistentWorld.careerProjection.leaders.wickets.map((entry) => (
                      <li key={entry.playerId}>
                        <span>{service.playerName(entry.playerId)}</span>
                        <strong>{entry.value}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <h3>All-time player statistics</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Team</th>
                      <th>Seasons</th>
                      <th>M</th>
                      <th>Runs</th>
                      <th>HS</th>
                      <th>Avg</th>
                      <th>SR</th>
                      <th>Wkts</th>
                      <th>Bowl Avg</th>
                      <th>Econ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistentWorld.careerProjection.players.map((player) => (
                      <tr key={player.playerId}>
                        <td>
                          <button
                            type="button"
                            className="player-link"
                            id={`player-link-STATISTICS-${player.playerId}`}
                            aria-label={`View ${service.playerName(player.playerId)}`}
                            onClick={() => openPlayer(player.playerId, "STATISTICS")}
                          >
                            {service.playerName(player.playerId)}
                          </button>
                        </td>
                        <td>{service.teamName(player.teamId)}</td>
                        <td>{player.seasonsPlayed}</td>
                        <td>{player.matches}</td>
                        <td>{player.runs}</td>
                        <td>
                          {player.battingInnings > 0
                            ? `${player.highScoreRuns}${player.highScoreNotOut ? "*" : ""}`
                            : "–"}
                        </td>
                        <td>{metric(player.battingAverageX100)}</td>
                        <td>{metric(player.strikeRateX100)}</td>
                        <td>{player.bowlingWickets}</td>
                        <td>{metric(player.bowlingAverageX100)}</td>
                        <td>{metric(player.economyX100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            (() => {
              const scopedSeason =
                persistentWorld && typeof statsScope === "number"
                  ? persistentWorld.completedSeasons.find((s) => s.seasonNumber === statsScope) ??
                    null
                  : null;
              const tableRows = scopedSeason ? scopedSeason.table : state.projection.table;
              const leaderSets = scopedSeason ? scopedSeason.leaders : state.projection.leaders;
              const playerRows = scopedSeason ? scopedSeason.players : state.projection.players;
              return (
                <div>
                  <h3>
                    {scopedSeason
                      ? `League table · Season ${scopedSeason.seasonNumber} (${scopedSeason.calendarYear})`
                      : "League table"}
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Team</th>
                          <th>P</th>
                          <th>W</th>
                          <th>L</th>
                          <th>T</th>
                          <th>NR</th>
                          <th>Pts</th>
                          <th>NRR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row) => (
                          <tr
                            key={row.teamId}
                            className={row.teamId === controlledTeam ? "managed-fixture" : ""}
                          >
                            <td>{row.rank}</td>
                            <td>{service.teamName(row.teamId)}</td>
                            <td>{row.played}</td>
                            <td>{row.wins}</td>
                            <td>{row.losses}</td>
                            <td>{row.ties}</td>
                            <td>{row.noResults}</td>
                            <td>{row.points}</td>
                            <td>
                              {row.nrrX1000 === null ? "–" : (row.nrrX1000 / 1000).toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h3>Player leaders</h3>
                  <div className="stats-grid">
                    <div className="career-panel">
                      <h4>Runs</h4>
                      <ol>
                        {leaderSets.runs.map((entry) => (
                          <li key={entry.playerId}>
                            <span>{service.playerName(entry.playerId)}</span>
                            <strong>{entry.value}</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="career-panel">
                      <h4>Wickets</h4>
                      <ol>
                        {leaderSets.wickets.map((entry) => (
                          <li key={entry.playerId}>
                            <span>{service.playerName(entry.playerId)}</span>
                            <strong>{entry.value}</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  <h3>Full player statistics</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Team</th>
                          <th>M</th>
                          <th>Runs</th>
                          <th>Avg</th>
                          <th>SR</th>
                          <th>Wkts</th>
                          <th>Bowl Avg</th>
                          <th>Econ</th>
                          <th>Bowl SR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerRows.map((player) => (
                          <tr key={player.playerId}>
                            <td>
                              <button
                                type="button"
                                className="player-link"
                                id={`player-link-STATISTICS-${player.playerId}`}
                                aria-label={`View ${service.playerName(player.playerId)}`}
                                onClick={() => openPlayer(player.playerId, "STATISTICS")}
                              >
                                {service.playerName(player.playerId)}
                              </button>
                            </td>
                            <td>{service.teamName(player.teamId)}</td>
                            <td>{player.matches}</td>
                            <td>{player.runs}</td>
                            <td>{metric(player.battingAverageX100)}</td>
                            <td>{metric(player.strikeRateX100)}</td>
                            <td>{player.bowlingWickets}</td>
                            <td>{metric(player.bowlingAverageX100)}</td>
                            <td>{metric(player.economyX100)}</td>
                            <td>{metric(player.bowlingStrikeRateX100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}
        </section>
      )}

      {screen === "CONTRACTS" && (
        <section aria-labelledby="contracts-heading" data-testid="contracts-screen">
          <h2 id="contracts-heading">Contracts &amp; Recruitment</h2>
          {!economyState || !persistentWorld ? (
            <div className="career-panel">
              <p>
                Domestic contracts, club wage budgets, and free-agent negotiations require a Stage 4
                (<code>LC_PERSISTENT_WORLD_V3_ECONOMY</code>) persistent world career.
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
                    <table>
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
                  <table>
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
                  <table>
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
                              S{entry.seasonNumber} ({entry.date})
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
      )}

      {screen === "PLAYER" &&
        (() => {
          const freeAgentMatch =
            playerId && economyState
              ? economyState.freeAgents.find((fa) => fa.player.playerId === playerId) ?? null
              : null;
          const resolved = playerId
            ? service.findPlayerIncludingRetired(playerId) ??
              (freeAgentMatch ? { player: freeAgentMatch.player, retired: null } : null)
            : null;
          if (!resolved) return null;
          const { player, retired } = resolved;
          const activeContract = service.playerContract(player.playerId);
          const careerClubs =
            activeContract?.careerTeamIds.map((tid) => service.teamName(tid)) ??
            freeAgentMatch?.careerTeamIds.map((tid) => service.teamName(tid)) ??
            [];
          const careerStats =
            persistentWorld?.careerProjection.players.find(
              (candidate) => candidate.playerId === player.playerId,
            ) ?? null;
          const breakdown: PlayerSeasonBreakdownRow[] = persistentWorld
            ? [
                ...persistentWorld.completedSeasons
                  .map((season): PlayerSeasonBreakdownRow | null => {
                    const row = season.players.find((p) => p.playerId === player.playerId);
                    return row
                      ? {
                          seasonNumber: season.seasonNumber,
                          calendarYear: season.calendarYear,
                          phase: "COMPLETE",
                          stats: row,
                        }
                      : null;
                  })
                  .filter((row): row is PlayerSeasonBreakdownRow => row !== null),
                ...((): PlayerSeasonBreakdownRow[] => {
                  const activeRow = state.projection.players.find(
                    (p) => p.playerId === player.playerId,
                  );
                  if (activeRow) {
                    return [
                      {
                        seasonNumber: persistentWorld.currentSeasonNumber,
                        calendarYear: persistentWorld.currentCalendarYear,
                        phase: state.phase,
                        stats: activeRow,
                      },
                    ];
                  }
                  if (!retired) {
                    const activeTeamId: string =
                      displayWorld.teams.find((t) => t.squadIds.includes(player.playerId))?.teamId ??
                      persistentWorld.controlledTeamId ??
                      "team01";
                    return [
                      {
                        seasonNumber: persistentWorld.currentSeasonNumber,
                        calendarYear: persistentWorld.currentCalendarYear,
                        phase: state.phase,
                        stats: {
                          playerId: player.playerId,
                          teamId: activeTeamId,
                          matches: 0,
                          runs: 0,
                          dismissals: 0,
                          ballsFaced: 0,
                          fours: 0,
                          sixes: 0,
                          battingAverageX100: null,
                          strikeRateX100: null,
                          bowlingRunsConceded: 0,
                          bowlingLegalBalls: 0,
                          bowlingWickets: 0,
                          maidens: 0,
                          bowlingAverageX100: null,
                          economyX100: null,
                          bowlingStrikeRateX100: null,
                        },
                      },
                    ];
                  }
                  return [];
                })(),
              ]
            : [];
          return (
            <PlayerPage
              player={player}
              condition={retired ? null : service.playerCondition(player.playerId)}
              stats={
                state.projection.players.find(
                  (candidate) => candidate.playerId === player.playerId,
                ) ?? null
              }
              careerStats={careerStats}
              seasonBreakdown={breakdown}
              age={service.playerAge(player.birthDate)}
              retiredRecord={retired}
              skillLedgerEntry={service.playerLifecycleLedgerEntry(player.playerId)}
              lastTeamName={retired ? service.teamName(retired.lastTeamId) : null}
              activeContract={activeContract}
              contractTeamName={activeContract ? service.teamName(activeContract.teamId) : null}
              isFreeAgent={Boolean(freeAgentMatch)}
              careerClubNames={careerClubs}
              format={playerFormat}
              onFormat={changePlayerFormat}
              onBack={() => {
                setRestorePlayerFocus(player.playerId);
                setScreen(playerOrigin);
              }}
              backLabel={
                playerOrigin === "SQUAD"
                  ? "Back to squad"
                  : playerOrigin === "CONTRACTS"
                    ? "Back to contracts"
                    : "Back to statistics"
              }
            />
          );
        })()}

      {screen === "SETTINGS" && (
        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading">Settings</h2>
          <div className="settings-grid">
            <label>
              Text scale
              <select value={scale} onChange={(event) => setScale(event.currentTarget.value)}>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="115">115%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </label>
            <label>
              Layout density
              <select value={density} onChange={(event) => setDensity(event.currentTarget.value)}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.currentTarget.checked)}
              />{" "}
              Reduced motion
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showTacticalBriefings}
                onChange={(event) => setShowTacticalBriefings(event.currentTarget.checked)}
              />{" "}
              Show tactical briefings &amp; assistant
            </label>
          </div>
          <div className="career-panel settings-actions">
            <h3>Career file &amp; recovery</h3>
            <div className="action-row">
              <button disabled={busy || inspectionOnly} onClick={() => void exportCareer()}>
                Export .lcxxvi
              </button>
              {currentSaveId && (
                <button
                  id="settings-inspect-checkpoints"
                  type="button"
                  disabled={busy || inspectionOnly}
                  onClick={() =>
                    void openCheckpointInspector(currentSaveId, "settings-inspect-checkpoints")
                  }
                >
                  Inspect checkpoints
                </button>
              )}
            </div>
            <label className="file-import-label">
              Import validated .lcxxvi archive
              <input
                type="file"
                accept=".lcxxvi,application/zip"
                disabled={inspectionOnly}
                onChange={(event) => void importCareer(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
          </div>
          {checkpointInspectorSection}
        </section>
      )}
    </main>
  );
}
