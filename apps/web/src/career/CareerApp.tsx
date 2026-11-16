import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AcademyTrainingFocus,
  AudioPreferences,
  HighlightMotionMode,
  HighlightPacingMode,
  HistoricalBattingPositionBand,
  HistoricalLeaderboardMetric,
  HistoricalPlayerStatusFilter,
  SeasonCheckpointInspection,
  T20SeasonMatchCompletion,
  TrainingDirective,
} from "@lcxxvi/contracts";
import {
  AWARDS_PROVENANCE_NOTICE,
} from "@lcxxvi/contracts";
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
import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  loadStoredAudioPreferences,
  saveStoredAudioPreferences,
} from "../match/audio-manager.js";
import { WorldEditor } from "../world/WorldEditor.js";
import type { NewGameWorldCopy } from "../world/new-game-world.js";
import { offlineUpdateCoordinator } from "../offline-update.js";
import "./career.css";
import { StatisticsScreen } from "./StatisticsScreen.js";
import { ContractsScreen } from "./ContractsScreen.js";

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

/**
 * A career upgrade copies the career into a new slot with a new state format. A match launched from
 * the old slot cannot be applied to it safely, so the upgrade waits until that match is finished or
 * abandoned (audit 16 Nov 2026, Phase 2).
 */
async function refuseUpgradeWhileMatchPending(): Promise<void> {
  const saveId = service.getSaveId();
  if (!saveId) return;
  const { bindings } = await managedBindings.pendingForCareer(saveId);
  if (bindings.length > 0) {
    throw new Error(
      "A career match from this save is still in progress. Finish it and return the result, or abandon it, before creating an upgraded copy.",
    );
  }
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
export type StatsScope = "ACTIVE" | "ALL_TIME" | number;

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
  const [playerOrigin, setPlayerOrigin] = useState<
    "SQUAD" | "STATISTICS" | "CONTRACTS" | "CAREER" | "FIXTURES"
  >("SQUAD");
  const [restorePlayerFocus, setRestorePlayerFocus] = useState<string | null>(null);
  const [playerFormat, setPlayerFormat] = useState<PlayerFormat>(() => {
    const stored = localStorage.getItem("lcxxvi-player-format");
    return stored === "ODI" || stored === "RED_BALL" ? stored : "T20";
  });
  const [statsScope, setStatsScope] = useState<StatsScope>("ACTIVE");
  const [historySeasonView, setHistorySeasonView] = useState<number | null>(null);
  const [historicalOpponent, setHistoricalOpponent] = useState<string>("ALL");
  const [historicalVenue, setHistoricalVenue] = useState<string>("ALL");
  const [historicalBattingPosition, setHistoricalBattingPosition] =
    useState<HistoricalBattingPositionBand>("ALL");
  const [historicalPlayerStatus, setHistoricalPlayerStatus] =
    useState<HistoricalPlayerStatusFilter>("ALL");
  const [historicalLeaderboardMetric, setHistoricalLeaderboardMetric] =
    useState<HistoricalLeaderboardMetric>("RUNS");
  const [careerArchivesVersion, setCareerArchivesVersion] = useState(0);
  const [freeAgentRoleFilter, setFreeAgentRoleFilter] = useState<string>("ALL");
  const [ledgerScope, setLedgerScope] = useState<"MANAGED" | "ALL">("MANAGED");
  const [offerDrafts, setOfferDrafts] = useState<
    Record<string, { wageK: string; termSeasons: string }>
  >({});

  function openPlayer(
    id: string,
    origin: "SQUAD" | "STATISTICS" | "CONTRACTS" | "CAREER" | "FIXTURES",
  ) {
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
  const [awardsSeasonFilter, setAwardsSeasonFilter] = useState<number | "LATEST">("LATEST");
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
  const [highlightPacing, setHighlightPacing] = useState<HighlightPacingMode>(() => {
    const saved = localStorage.getItem("lcxxvi-highlight-pacing");
    return saved === "EVERY_BALL" || saved === "KEY_MOMENT" || saved === "FAST"
      ? saved
      : "KEY_MOMENT";
  });
  const [highlightMotion, setHighlightMotion] = useState<HighlightMotionMode>(() => {
    const saved = localStorage.getItem("lcxxvi-highlight-motion");
    return saved === "AUTO" || saved === "REDUCED" ? saved : "AUTO";
  });
  const [matchCommentary, setMatchCommentary] = useState(() => {
    const saved = localStorage.getItem("lcxxvi-match-commentary");
    if (saved === "standard") return "full";
    return saved && ["full", "detailed", "brief", "off"].includes(saved) ? saved : "full";
  });
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(() => loadStoredAudioPreferences());
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
    if (
      screen !== "CAREER" &&
      screen !== "FIXTURES" &&
      screen !== "STATISTICS" &&
      screen !== "PLAYER"
    ) {
      return;
    }
    let alive = true;
    void service.loadCareerMatchDigests().then(() => {
      if (alive) setCareerArchivesVersion((v) => v + 1);
    });
    void service.syncAwardsLedger().then(() => {
      if (alive) setCareerArchivesVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [screen, state, persistentWorld]);
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
    localStorage.setItem("lcxxvi-highlight-pacing", highlightPacing);
    localStorage.setItem("lcxxvi-highlight-motion", highlightMotion);
    localStorage.setItem("lcxxvi-match-commentary", matchCommentary);
  }, [scale, density, reducedMotion, showTacticalBriefings, highlightPacing, highlightMotion, matchCommentary]);
  useEffect(() => {
    saveStoredAudioPreferences(audioPrefs);
  }, [audioPrefs]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUDIO_PREFERENCES_STORAGE_KEY) {
        setAudioPrefs(loadStoredAudioPreferences());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
  const persistentWorldRef = service.getPersistentState();
  const historicalSeasonScope = useMemo(() => {
    if (typeof statsScope === "number") return statsScope;
    if (statsScope === "ACTIVE" && persistentWorldRef) {
      return "ACTIVE" as const;
    }
    return "ALL" as const;
  }, [statsScope, persistentWorldRef]);
  const historicalProjection = useMemo(() => {
    // Rebuilt from every completed match; only the Statistics screen shows it, so compute it only there.
    if (!state || screen !== "STATISTICS") return null;
    return service.historicalStatistics({
      seasonScope: historicalSeasonScope,
      opponentTeamId: historicalOpponent,
      venueGroundId: historicalVenue,
      battingPositionBand: historicalBattingPosition,
      playerStatus: historicalPlayerStatus,
    });
  }, [
    state,
    screen,
    persistentWorldRef,
    careerArchivesVersion,
    historicalSeasonScope,
    historicalOpponent,
    historicalVenue,
    historicalBattingPosition,
    historicalPlayerStatus,
  ]);
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
      {(() => {
        const matchSeasonNumber =
          persistentWorld?.completedSeasons.find((season) =>
            season.completedMatches.some(
              (match) => match.fixtureId === activeReplay.completion.fixtureId,
            ),
          )?.seasonNumber ??
          persistentWorld?.currentSeasonNumber ??
          1;
        const matchAward = service.getMatchAwardForFixture(
          matchSeasonNumber,
          activeReplay.completion.fixtureId,
        );
        if (!matchAward) return null;
        return (
          <div
            className="match-award-box"
            data-testid="replay-match-award-panel"
            style={{ marginBottom: "14px" }}
          >
            <div className="match-award-head">
              <strong>Player of the Match</strong>
              <span className="award-provenance-tag">
                Game award · {matchAward.awardVersion}
              </span>
            </div>
            {matchAward.status === "AWARDED" && matchAward.winnerPlayerId ? (
              <>
                <p data-testid="replay-match-award-winner">
                  <button
                    type="button"
                    className="player-link"
                    onClick={() =>
                      openPlayer(
                        matchAward.winnerPlayerId!,
                        screen === "SQUAD" ||
                          screen === "CONTRACTS" ||
                          screen === "CAREER" ||
                          screen === "FIXTURES" ||
                          screen === "STATISTICS"
                          ? screen
                          : "STATISTICS",
                      )
                    }
                  >
                    <strong>{service.playerName(matchAward.winnerPlayerId)}</strong>
                  </button>{" "}
                  ({matchAward.winnerTeamId ? service.teamName(matchAward.winnerTeamId) : "–"}
                  {matchAward.fromLosingTeam ? " · losing side" : ""}) ·{" "}
                  {((matchAward.scoreTotalX100 ?? 0) / 100).toFixed(2)} pts
                </p>
                <p className="match-award-explain">{matchAward.explanationText}</p>
                {matchAward.components && (
                  <p className="match-award-breakdown">
                    Bat {(matchAward.components.battingPointsX100 / 100).toFixed(1)} · Bowl{" "}
                    {(matchAward.components.bowlingPointsX100 / 100).toFixed(1)} · Field{" "}
                    {(matchAward.components.fieldingPointsX100 / 100).toFixed(1)} · Result{" "}
                    {(matchAward.components.resultBonusX100 / 100).toFixed(1)} · Fielding source:{" "}
                    {matchAward.fieldingSourceStatus === "ARCHIVE_EVENTS"
                      ? "archive events"
                      : "scorecard fallback"}
                  </p>
                )}
              </>
            ) : (
              <p data-testid="replay-match-award-winner">{matchAward.explanationText}</p>
            )}
            <p className="award-notice">{AWARDS_PROVENANCE_NOTICE}</p>
          </div>
        );
      })()}
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
                    await refuseUpgradeWhileMatchPending();
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
                  await refuseUpgradeWhileMatchPending();
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
        <StatisticsScreen
          service={service}
          state={state}
          persistentWorld={persistentWorld}
          persistentWorldRef={persistentWorldRef}
          busy={busy}
          controlledTeam={controlledTeam}
          statsScope={statsScope}
          setStatsScope={setStatsScope}
          historicalOpponent={historicalOpponent}
          setHistoricalOpponent={setHistoricalOpponent}
          historicalVenue={historicalVenue}
          setHistoricalVenue={setHistoricalVenue}
          historicalBattingPosition={historicalBattingPosition}
          setHistoricalBattingPosition={setHistoricalBattingPosition}
          historicalPlayerStatus={historicalPlayerStatus}
          setHistoricalPlayerStatus={setHistoricalPlayerStatus}
          historicalLeaderboardMetric={historicalLeaderboardMetric}
          setHistoricalLeaderboardMetric={setHistoricalLeaderboardMetric}
          historicalProjection={historicalProjection}
          historicalSeasonScope={historicalSeasonScope}
          awardsSeasonFilter={awardsSeasonFilter}
          setAwardsSeasonFilter={setAwardsSeasonFilter}
          openPlayer={openPlayer}
          openReplay={openReplay}
          replayViewerSection={replayViewerSection}
        />
      )}

      {screen === "CONTRACTS" && (
        <ContractsScreen
          service={service}
          state={state}
          persistentWorld={persistentWorld}
          busy={busy}
          inspectionOnly={inspectionOnly}
          action={action}
          controlledTeam={controlledTeam}
          team={team}
          displayWorld={displayWorld}
          economyState={economyState}
          managedBudget={managedBudget}
          freeAgentRoleFilter={freeAgentRoleFilter}
          setFreeAgentRoleFilter={setFreeAgentRoleFilter}
          ledgerScope={ledgerScope}
          setLedgerScope={setLedgerScope}
          getOfferDraft={getOfferDraft}
          updateOfferDraft={updateOfferDraft}
          openPlayer={openPlayer}
        />
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
          const historicalRecord = service.historicalPlayerRecord(player.playerId);
          return (
            <>
              {replayViewerSection}
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
                historicalRecord={historicalRecord}
                awardsSummary={service.getPlayerAwardsSummary(player.playerId)}
                teamName={(tid) => service.teamName(tid)}
                groundName={(gid) => service.groundName(gid)}
                onOpenReplay={(fixtureId, triggerId) => void openReplay(fixtureId, triggerId)}
                format={playerFormat}
                onFormat={changePlayerFormat}
                onBack={() => {
                  setActiveReplay(null);
                  setRestorePlayerFocus(player.playerId);
                  setScreen(playerOrigin);
                }}
                backLabel={
                  playerOrigin === "SQUAD"
                    ? "Back to squad"
                    : playerOrigin === "CONTRACTS"
                      ? "Back to contracts"
                      : playerOrigin === "CAREER"
                        ? "Back to career"
                        : playerOrigin === "FIXTURES"
                          ? "Back to fixtures"
                          : "Back to statistics"
                }
              />
            </>
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
            <label>
              Highlight pacing
              <select
                aria-label="Highlight pacing"
                value={highlightPacing}
                onChange={(event) =>
                  setHighlightPacing(event.currentTarget.value as HighlightPacingMode)
                }
              >
                <option value="EVERY_BALL">Every ball</option>
                <option value="KEY_MOMENT">Key moments</option>
                <option value="FAST">Fast</option>
              </select>
            </label>
            <label>
              Highlight motion
              <select
                aria-label="Highlight motion"
                value={highlightMotion}
                onChange={(event) =>
                  setHighlightMotion(event.currentTarget.value as HighlightMotionMode)
                }
              >
                <option value="AUTO">System default</option>
                <option value="REDUCED">Reduced motion</option>
              </select>
            </label>
            <label>
              Match commentary
              <select
                aria-label="Match commentary"
                value={matchCommentary}
                onChange={(event) => setMatchCommentary(event.currentTarget.value)}
              >
                <option value="full">Standard</option>
                <option value="detailed">Detailed</option>
                <option value="brief">Brief</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>
              Match sound
              <select
                aria-label="Match sound"
                value={audioPrefs.muted ? "muted" : "on"}
                onChange={(event) => {
                  const muted = event.currentTarget.value === "muted";
                  setAudioPrefs((prev) => ({
                    ...prev,
                    muted,
                  }));
                }}
              >
                <option value="on">On</option>
                <option value="muted">Muted (silent)</option>
              </select>
            </label>
            <label>
              Crowd volume ({audioPrefs.crowdVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Career crowd volume"
                value={audioPrefs.crowdVolume}
                onChange={(event) => {
                  const crowdVolume = Number(event.currentTarget.value);
                  setAudioPrefs((prev) => ({
                    ...prev,
                    crowdVolume,
                  }));
                }}
              />
            </label>
            <label>
              Effects volume ({audioPrefs.effectsVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Career effects volume"
                value={audioPrefs.effectsVolume}
                onChange={(event) => {
                  const effectsVolume = Number(event.currentTarget.value);
                  setAudioPrefs((prev) => ({
                    ...prev,
                    effectsVolume,
                  }));
                }}
              />
            </label>
            <label>
              Commentary narration volume ({audioPrefs.commentaryVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Career commentary narration volume"
                value={audioPrefs.commentaryVolume}
                onChange={(event) => {
                  const commentaryVolume = Number(event.currentTarget.value);
                  setAudioPrefs((prev) => ({
                    ...prev,
                    commentaryVolume,
                  }));
                }}
              />
            </label>
            <label>
              Interface volume ({audioPrefs.interfaceVolume}%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Career interface volume"
                value={audioPrefs.interfaceVolume}
                onChange={(event) => {
                  const interfaceVolume = Number(event.currentTarget.value);
                  setAudioPrefs((prev) => ({
                    ...prev,
                    interfaceVolume,
                  }));
                }}
              />
            </label>
            <label>
              Spoken narration
              <select
                aria-label="Spoken narration"
                value={audioPrefs.narrationEnabled ? "on" : "off"}
                onChange={(event) => {
                  const narrationEnabled = event.currentTarget.value === "on";
                  setAudioPrefs((prev) => ({
                    ...prev,
                    narrationEnabled,
                  }));
                }}
              >
                <option value="off">Off</option>
                <option value="on">On (browser speech)</option>
              </select>
            </label>
            <label>
              Audio captions
              <select
                aria-label="Audio captions"
                value={audioPrefs.captionsEnabled ? "shown" : "hidden"}
                onChange={(event) => {
                  const captionsEnabled = event.currentTarget.value === "shown";
                  setAudioPrefs((prev) => ({
                    ...prev,
                    captionsEnabled,
                  }));
                }}
              >
                <option value="shown">Shown</option>
                <option value="hidden">Hidden</option>
              </select>
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
      {/* Below the screen content, so the next required action stays in the first view at 150% text. */}
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
    </main>
  );
}
