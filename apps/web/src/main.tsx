import { CloseFinish, boundaryCount, requiredRate, isCloseFinish, passageReport, type Passage } from "./match/CloseFinish.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AWARDS_PROVENANCE_NOTICE, type MatchAwardCandidate } from "@lcxxvi/contracts";
import { AnalyticsPanel } from "./match/AnalyticsPanel.js";
import {
  projectPreMatchBriefing,
  selectCommentaryTextForMode,
} from "@lcxxvi/projections";
import {
  InMatchTacticalAssistantPanel,
  PreMatchBriefingPanel,
} from "./match/TacticalBriefingPanels.js";
import {
  LiveFieldPanel,
  type CommittedSequenceWindow,
} from "./match/LiveFieldPanel.js";
import { AudioControlsPanel } from "./match/AudioControlsPanel.js";
import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  CricketAudioManager,
  loadStoredAudioPreferences,
  saveStoredAudioPreferences,
  type AudioManagerSnapshot,
} from "./match/audio-manager.js";
import { ScorecardExport } from "./match/ScorecardExport.js";
import { createRoot } from "react-dom/client";
import {
  PINS,
  UI_VERSION,
  type Action,
  type Catalog,
  type Selection,
  type View,
  type Request,
  type Response,
  type Verification,
  type PersistenceView,
  type AnalyticsProgress,
  type ScenarioStatus,
  type SuperOverView,
} from "./match/protocol.js";
import { SuperOverPanel } from "./match/SuperOverPanel.js";
import { ScenariosApp, SCENARIO_LAUNCH_KEY } from "./scenario/ScenariosApp.js";
import { TournamentsApp, TOURNAMENT_LAUNCH_KEY, type TournamentLaunch } from "./tournament/TournamentsApp.js";
import { RainApp } from "./rain/RainApp.js";
import { TeamCrest } from "./world/TeamCrest.js";
import "./styles.css";
import "./pavilion.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./floodlit.css";
import { ART_WASH, groundArtBackground } from "./world/ground-art.js";
import { PlayerPortrait } from "./world/PlayerPortrait.js";
import { CareerApp } from "./career/CareerApp.js";
import { RosterCareerApp } from "./career/RosterCareerApp.js";
import { careerWorld, type CareerUserMatchLaunch } from "./career/service.js";
import { PitchInspection } from "./match/PitchInspection.js";
import { WorldEditor } from "./world/WorldEditor.js";
import { offlineUpdateCoordinator } from "./offline-update.js";
import {
  delegationForTeam,
  redBallProfileForTeam,
  type AudioPreferences,
  type DelegationJournal,
  type HighlightMotionMode,
  type HighlightPacingMode,
  type NewGameWorldCopy,
  type RedBallTacticalProfile,
  type StagedRosterPack,
  type WorldPack,
} from "@lcxxvi/contracts";
import { RED_BALL_PROFILE_DESCRIPTIONS } from "@lcxxvi/ai";
import type { DelegationCategory } from "./match/ai-opponent.js";
import { createStagedRosterPack } from "@lcxxvi/simulation";
import { isBowlingCapable, RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";

type Body = Request extends infer R
  ? R extends Request
    ? Omit<R, "version" | "requestId" | "expectedRevision">
    : never
  : never;
const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
/** Commentary entries rendered by default; a red-ball match records thousands. */
const COMMENTARY_WINDOW = 150;

export function MatchApp({ onInspectCareer, onReturnCareer }: { onInspectCareer?: (roster: boolean) => void; onReturnCareer?: (roster: boolean) => void } = {}) {
  const worker = useRef<Worker | null>(null),
    serial = useRef(0),
    inflight = useRef<string | null>(null),
    currentRevision = useRef(0);
  const advanceBatch = useRef<{ scope: "DECISION" | "INNINGS" | "MATCH"; innings: number; remaining: number; cancel: boolean; from: number | null } | null>(null);
  const [batchState, setBatchState] = useState<"idle" | "running" | "stopping">("idle");
  const [batchProgress, setBatchProgress] = useState<{ from: number; to: number } | null>(null);
  const careerLaunch = useRef<CareerUserMatchLaunch | null>((() => {
    try {
      const raw = sessionStorage.getItem("lcxxvi-career-match-launch");
      return raw ? (JSON.parse(raw) as CareerUserMatchLaunch) : null;
    } catch {
      return null;
    }
  })());
  const careerStartIssued = useRef(false);
  /** Stage 12: a scenario chosen on the Scenarios screen, started once the worker has booted. */
  const scenarioLaunch = useRef<string | null>((() => {
    try {
      const id = sessionStorage.getItem(SCENARIO_LAUNCH_KEY);
      sessionStorage.removeItem(SCENARIO_LAUNCH_KEY);
      return id;
    } catch {
      return null;
    }
  })());
  const [scenario, setScenario] = useState<ScenarioStatus | null>(null);
  const [paceOverride, setPaceOverride] = useState<boolean | null>(null);
  const [matchAware, setMatchAware] = useState(() => localStorage.getItem("lcxxvi-captain-challenge") === "match-aware");
  const passage = useRef<Passage | null>(null);
  const [finishReport, setFinishReport] = useState("");
  const [playingPassage, setPlayingPassage] = useState(false);
  function endPassage(report: string) {
    passage.current = null;
    setPlayingPassage(false);
    setFinishReport(report);
  }
  /** Stage 15: the player's tournament fixture chosen on the Tournaments screen, started once the worker has booted. */
  const tournamentLaunch = useRef<TournamentLaunch | null>((() => {
    try {
      const raw = sessionStorage.getItem(TOURNAMENT_LAUNCH_KEY);
      sessionStorage.removeItem(TOURNAMENT_LAUNCH_KEY);
      return raw ? (JSON.parse(raw) as TournamentLaunch) : null;
    } catch {
      return null;
    }
  })());
  const [superOver, setSuperOver] = useState<SuperOverView | null>(null);
  const recoverIssued = useRef(false);
  // Ids for requests that never commit. Commands use ui-(10000 + revision + 1) so that a reloaded page, which
  // restarts from the durable revision, cannot reuse a committed id; borrowing from that range would break it.
  const auxSerial = useRef(800_000_000);
  const auxId = () => `ui-${++auxSerial.current}`;
  const abandonRequest = useRef<string | null>(null);
  const [aiTeamId, setAiTeamId] = useState<string | null>(() => {
    const c = careerLaunch.current;
    if (c?.managedTeamId) return c.homeTeamId === c.managedTeamId ? c.awayTeamId : c.homeTeamId;
    return sessionStorage.getItem("lcxxvi-optional-ai-team");
  });
  const lastAiChecked = useRef<Record<string, string>>({});
  const [delegation, setDelegation] = useState<DelegationJournal>({ version: "LC_DELEGATION_JOURNAL_V1", changes: [] });
  const [delegationTeam, setDelegationTeam] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [view, setView] = useState<View | null>(null);
  const [stagedWorld, setStagedWorld] = useState<NewGameWorldCopy | null>(null);
  const [stagedRoster, setStagedRoster] = useState<StagedRosterPack | null>(null);
  const [editingWorld, setEditingWorld] = useState(false);
  const [restoreWorldFocus, setRestoreWorldFocus] = useState(false);
  const editWorldButton = useRef<HTMLButtonElement>(null);
  const displayCatalog = useMemo(() => {
    if (stagedRoster) {
      const world = stagedRoster.world;
      const byId = new Map(world.players.map(player => [player.playerId, player]));
      return { teams: world.teams.map(team => {
        const players = team.squadIds.map(id => byId.get(id)!);
        const keeper = players.find(player => player.role === "KEEPER")!;
        const bowlers = players.filter(player => player !== keeper && isBowlingCapable(player)).slice(0, 5);
        const xi = [keeper, ...bowlers, ...players.filter(player => player !== keeper && !bowlers.includes(player))].slice(0, 11);
        return { id: team.teamId, name: team.name, players: players.map(player => ({ id: player.playerId, name: player.name, role: player.role, style: player.bowlingStyle, canBowl: isBowlingCapable(player) })),
          suggested: { teamId: team.teamId, playerIds: xi.map(player => player.playerId), captainId: keeper.playerId, keeperId: keeper.playerId } };
      }), grounds: world.grounds.map(ground => ({ id: ground.groundId, name: ground.name })) };
    }
    if (!catalog || !stagedWorld) return catalog;
    const world = stagedWorld.world;
    const players = new Map(world.players.map(player => [player.playerId, player.name]));
    const teams = new Map(world.teams.map(team => [team.teamId, team.name]));
    const grounds = new Map(world.grounds.map(ground => [ground.groundId, ground.name]));
    return {
      teams: catalog.teams.map(team => ({ ...team, name: teams.get(team.id) ?? team.name, players: team.players.map(player => ({ ...player, name: players.get(player.id) ?? player.name })) })),
      grounds: catalog.grounds.map(ground => ({ ...ground, name: grounds.get(ground.id) ?? ground.name })),
    };
  }, [catalog, stagedWorld, stagedRoster]);
  const [busy, setBusy] = useState(true),
    [fatal, setFatal] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    offlineUpdateCoordinator.setBusySource("match", busy || batchState !== "idle");
    return () => offlineUpdateCoordinator.setBusySource("match", false);
  }, [busy, batchState]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const rebuildRequest = useRef<string | null>(null);
  const [analyticsRebuild, setAnalyticsRebuild] = useState<{ state: "IDLE" | "RUNNING" | "STOPPING" | "COMPLETE" | "CANCELLED"; applied: number; total: number }>({ state: "IDLE", applied: 0, total: 0 });
  const [diagnosticSeed, setDiagnosticSeed] = useState(false);
  const [diagnosticPreview, setDiagnosticPreview] = useState<import("./match/diagnostic-export.js").DiagnosticPreview | null>(null);
  const [persistence, setPersistence] = useState<PersistenceView | null>(null);
  const [scale, setScale] = useState(() => {
      const saved = localStorage.getItem("lcxxvi-match-scale");
      return saved && ["100", "115", "125", "150"].includes(saved) ? saved : "100";
    }),
    [showAllCommentary, setShowAllCommentary] = useState(false),
    [commentary, setCommentary] = useState<"full" | "detailed" | "brief" | "off">(() => {
      const saved = localStorage.getItem("lcxxvi-match-commentary");
      if (saved === "standard") return "full";
      return saved === "full" || saved === "detailed" || saved === "brief" || saved === "off"
        ? saved
        : "full";
    }),
    [density, setDensity] = useState(() => {
      const saved = localStorage.getItem("lcxxvi-match-density");
      return saved && ["comfortable", "compact"].includes(saved) ? saved : "comfortable";
    }),
    [briefingsPref, setBriefingsPref] = useState(() => {
      const saved = localStorage.getItem("lcxxvi-tactical-briefings");
      return saved === "hidden" ? "hidden" : "shown";
    }),
    [highlightPacing, setHighlightPacing] = useState<HighlightPacingMode>(() => {
      const saved = localStorage.getItem("lcxxvi-highlight-pacing");
      return saved === "EVERY_BALL" || saved === "KEY_MOMENT" || saved === "FAST"
        ? saved
        : "KEY_MOMENT";
    }),
    [highlightMotion, setHighlightMotion] = useState<HighlightMotionMode>(() => {
      const saved = localStorage.getItem("lcxxvi-highlight-motion");
      return saved === "REDUCED" ? "REDUCED" : "AUTO";
    }),
    [committedWindow, setCommittedWindow] = useState<CommittedSequenceWindow | null>(null),
    [cancelSignal, setCancelSignal] = useState(0);
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(() => loadStoredAudioPreferences());
  const audioManagerRef = useRef<CricketAudioManager | null>(null);
  if (!audioManagerRef.current) {
    audioManagerRef.current = new CricketAudioManager(audioPrefs);
  }
  const [audioSnapshot, setAudioSnapshot] = useState<AudioManagerSnapshot>(() =>
    audioManagerRef.current!.getSnapshot(),
  );
  const audioBootSyncRef = useRef(true);
  const windowTokenRef = useRef(0);
  const decisionRef = useRef<HTMLHeadingElement>(null),
    lastPhase = useRef("");
  useEffect(() => {
    localStorage.setItem("lcxxvi-match-scale", scale);
    localStorage.setItem("lcxxvi-match-commentary", commentary);
    localStorage.setItem("lcxxvi-match-density", density);
    localStorage.setItem("lcxxvi-tactical-briefings", briefingsPref);
    localStorage.setItem("lcxxvi-highlight-pacing", highlightPacing);
    localStorage.setItem("lcxxvi-highlight-motion", highlightMotion);
  }, [scale, commentary, density, briefingsPref, highlightPacing, highlightMotion]);
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;
    const unsubscribe = manager.subscribe(() => {
      setAudioSnapshot(manager.getSnapshot());
    });
    const onVisibility = () => manager.handleVisibilityChange();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUDIO_PREFERENCES_STORAGE_KEY) {
        setAudioPrefs(loadStoredAudioPreferences());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      manager.dispose();
    };
  }, []);
  useEffect(() => {
    saveStoredAudioPreferences(audioPrefs);
    audioManagerRef.current?.setPreferences(audioPrefs);
  }, [audioPrefs]);
  useEffect(() => {
    const manager = audioManagerRef.current;
    if (!manager || !view?.matchId || !view.audioCues) return;
    if (audioBootSyncRef.current) {
      audioBootSyncRef.current = false;
      manager.seedCommittedHistory(view.matchId, view.audioCues);
      return;
    }
    void manager.processCueQueue({
      matchId: view.matchId,
      cues: view.audioCues,
      ...(highlightPacing === "FAST" ? { fastForwardThreshold: 1 } : {}),
    });
  }, [view?.matchId, view?.audioCues, view?.revision, highlightPacing]);
  function send(body: Body) {
    if (inflight.current || fatal) return;
    if (body.type !== "PREVIEW_DIAGNOSTIC" && body.type !== "EXPORT_DIAGNOSTIC") setDiagnosticPreview(null);
    if (["BOOT", "LOAD_SAVE", "IMPORT_SAVE"].includes(body.type)) {
      audioBootSyncRef.current = true;
    }
    if (body.type === "START") {
      audioBootSyncRef.current = false;
      audioManagerRef.current?.unlockFromUserGesture();
    }
    if (["BOOT", "START", "LOAD_SAVE", "IMPORT_SAVE", "DELETE_SAVE", "SCENARIO_START"].includes(body.type)) { endPassage(""); setPaceOverride(null); }
    if (["BOOT", "START", "LOAD_SAVE", "IMPORT_SAVE", "DELETE_SAVE"].includes(body.type)) {
      setBatchProgress(null);
      setCommittedWindow(null);
      setCancelSignal(current => current + 1);
      setAnalyticsRebuild({ state: "IDLE", applied: 0, total: 0 });
      lastAiChecked.current = {};
    }
    const requestId = `ui-${++serial.current}`;
    if (body.type === "REBUILD_ANALYTICS") { rebuildRequest.current = requestId; setAnalyticsRebuild({ state: "RUNNING", applied: 0, total: 0 }); }
    inflight.current = requestId;
    setBusy(true);
    setError("");
    setVerification(null);
    worker.current?.postMessage({
      ...body,
      version: UI_VERSION,
      requestId,
      expectedRevision: currentRevision.current,
    });
  }
  useEffect(() => {
    const ownerKey = "lcxxvi-writer-owner";
    // sessionStorage is scoped to the browsing context and survives reloads.
    // Reading it unconditionally avoids Firefox reporting a reload as a normal
    // navigation and accidentally rotating the writer identity. A separate tab
    // gets its own sessionStorage and therefore its own lease owner.
    let owner = sessionStorage.getItem(ownerKey);
    if (!owner) {
      owner = `tab-${crypto.randomUUID()}`;
      sessionStorage.setItem(ownerKey, owner);
    }
    const w = new Worker(new URL("./match/match.worker.ts", import.meta.url), {
      type: "module",
      name: owner,
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<Response | AnalyticsProgress>) => {
      const r = e.data;
      if (
        r.version !== UI_VERSION ||
        JSON.stringify(r.pins) !== JSON.stringify(PINS)
      ) {
        setFatal(true);
        setBusy(false);
        setError(
          "This page and match worker have different versions. Reload before starting.",
        );
        return;
      }
      if ("type" in r) {
        if (r.type === "ANALYTICS_PROGRESS" && r.requestId === rebuildRequest.current) setAnalyticsRebuild(current => ({ ...current, applied: r.applied, total: r.total }));
        return;
      }
      if (r.requestId !== inflight.current) return;
      inflight.current = null;
      currentRevision.current = r.revision;
      serial.current = Math.max(serial.current, 10000 + r.revision, r.commandIdFloor ?? 0);
      if (r.careerFixture && !careerLaunch.current) {
        // The durable binding restored the career link that sessionStorage lost with the old tab.
        const restored = r.careerFixture as CareerUserMatchLaunch;
        careerLaunch.current = restored;
        careerStartIssued.current = true;
        try { sessionStorage.setItem("lcxxvi-career-match-launch", JSON.stringify(restored)); } catch { /* the durable binding is authoritative */ }
        if (restored.managedTeamId) setAiTeamId(restored.homeTeamId === restored.managedTeamId ? restored.awayTeamId : restored.homeTeamId);
      }
      const batch = advanceBatch.current;
      let batchError = "";
      if (batch) {
        const acknowledged = r.acknowledgement?.commandId === r.requestId && r.acknowledgement.committedRevision === r.revision;
        if (acknowledged && r.acknowledgement) {
          batch.from ??= r.acknowledgement.fromSequence;
          setBatchProgress({ from: batch.from, to: r.acknowledgement.toSequence });
        }
        const continueBatch = !batch.cancel && acknowledged && !r.error && r.view?.phase === "READY" && !r.view.advanceReason &&
          !r.persistence?.readOnly && (batch.scope !== "INNINGS" || r.view.activeIndex === batch.innings) && --batch.remaining > 0;
        if (continueBatch) {
          const requestId = `ui-${++serial.current}`;
          inflight.current = requestId;
          w.postMessage({ version: UI_VERSION, type: "COMMAND", requestId, expectedRevision: r.revision, origin: "HUMAN",
            command: { kind: "ADVANCE", payload: { scope: "OVER" }, commandId: requestId, expectedRevision: r.revision, actorId: "SYSTEM" } });
        } else {
          if (!r.error && !acknowledged) batchError = "Simulation stopped because the last command was not acknowledged.";
          else if (!r.error && batch.remaining <= 0) batchError = "Simulation stopped at its command limit.";
          advanceBatch.current = null;
          setBatchState("idle");
        }
      }
      setBusy(inflight.current !== null);
      setError(r.error ?? batchError);
      if (r.catalog) setCatalog(r.catalog);
      if (
        r.acknowledgement &&
        r.acknowledgement.commandId === r.requestId &&
        r.acknowledgement.committedRevision === r.revision &&
        r.acknowledgement.toSequence >= r.acknowledgement.fromSequence
      ) {
        setCommittedWindow({
          token: ++windowTokenRef.current,
          fromSequence: r.acknowledgement.fromSequence,
          toSequence: r.acknowledgement.toSequence,
        });
      }
      setView(r.view);
      setVerification(r.verification);
      if (r.requestId === rebuildRequest.current) {
        rebuildRequest.current = null;
        setAnalyticsRebuild(r.analyticsRebuild ? { ...r.analyticsRebuild } : { state: "IDLE", applied: 0, total: 0 });
      }
      if (r.persistence) setPersistence(r.persistence);
      if (r.delegation) setDelegation(r.delegation);
      if (r.view && "superOver" in r) setSuperOver(r.superOver ?? null);
      else if (!r.view && !r.error) setSuperOver(null);
      if (r.view && "scenario" in r) {
        const nextScenario = r.scenario ?? null;
        setScenario(nextScenario);
        // The scenario's opponent is always the tactical captain; the player owns their own side.
        if (nextScenario && !careerLaunch.current) setAiTeamId(nextScenario.opponentTeamId);
      } else if (!r.error) setScenario(null);
      if (!careerLaunch.current && tournamentLaunch.current && !r.error && (r.catalog || r.view)) {
        const launch = tournamentLaunch.current;
        tournamentLaunch.current = null;
        recoverIssued.current = true;
        // The player's side is theirs; the tactical captain plays the other.
        const opponent = launch.fixture.homeTeamId === launch.playerTeamId ? launch.fixture.awayTeamId : launch.fixture.homeTeamId;
        setAiTeamId(opponent);
        try { sessionStorage.setItem("lcxxvi-optional-ai-team", opponent); } catch { /* preference only */ }
        const requestId = auxId();
        inflight.current = requestId;
        setBusy(true);
        w.postMessage({ version: UI_VERSION, requestId, expectedRevision: r.revision, type: "TOURNAMENT_START", format: launch.format, runId: launch.runId, runSeed: launch.runSeed, fixture: launch.fixture, ...(launch.roster ? { rosterPack: launch.roster.pack, selections: launch.roster.selections } : {}) });
      } else       if (r.catalog && !r.view && !careerLaunch.current && scenarioLaunch.current && !r.error) {
        const scenarioId = scenarioLaunch.current;
        scenarioLaunch.current = null;
        recoverIssued.current = true;
        const requestId = auxId();
        inflight.current = requestId;
        setBusy(true);
        w.postMessage({ version: UI_VERSION, requestId, expectedRevision: r.revision, type: "SCENARIO_START", scenarioId });
      } else if (r.view && !careerLaunch.current && scenarioLaunch.current && !r.error) {
        // A match is already open in this tab. Replace it with the scenario; the old match stays in Saved games.
        const scenarioId = scenarioLaunch.current;
        scenarioLaunch.current = null;
        const requestId = auxId();
        inflight.current = requestId;
        setBusy(true);
        w.postMessage({ version: UI_VERSION, requestId, expectedRevision: r.revision, type: "SCENARIO_START", scenarioId });
      }
      // These are caches only. The career rebuilds the result from the durable match and binding, so a
      // full or unavailable sessionStorage must not break the message handler.
      try {
        if (r.careerResult) sessionStorage.setItem("lcxxvi-career-match-result", JSON.stringify(r.careerResult));
        if (r.rosterCareerSession) sessionStorage.setItem("lcxxvi-roster-career-match-result", JSON.stringify(r.rosterCareerSession));
      } catch { /* cache write failed */ }
      if (r.catalog && !r.view && careerLaunch.current && !careerStartIssued.current) {
        careerStartIssued.current = true;
        const requestId = `ui-${++serial.current}`;
        inflight.current = requestId;
        setBusy(true);
        w.postMessage({
          version: UI_VERSION,
          requestId,
          expectedRevision: r.revision,
          type: "START",
          format: "T20",
          selections: careerLaunch.current.selections,
          groundId: careerLaunch.current.groundId,
          careerFixture: careerLaunch.current,
          ...(careerLaunch.current.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER" || careerLaunch.current.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V4_LIFECYCLE" ? { rosterPack: careerLaunch.current.rosterPack } : {}),
        });
      }
      if (r.catalog && !r.view && !careerLaunch.current && !recoverIssued.current && !r.error) {
        recoverIssued.current = true;
        const requestId = auxId();
        inflight.current = requestId;
        setBusy(true);
        w.postMessage({ version: UI_VERSION, requestId, expectedRevision: r.revision, type: "RECOVER_MANAGED" });
      }
      if (abandonRequest.current === r.requestId) {
        abandonRequest.current = null;
        if (!r.error) {
          careerLaunch.current = null;
          try { sessionStorage.removeItem("lcxxvi-career-match-launch"); } catch { /* ignore */ }
          const requestId = auxId();
          inflight.current = requestId;
          setBusy(true);
          w.postMessage({ version: UI_VERSION, requestId, expectedRevision: r.revision, type: "BOOT", fresh: true });
        }
      }
      if (r.diagnosticPreview) setDiagnosticPreview(r.diagnosticPreview);
      if (r.diagnosticBytes) {
        const bytes = new Uint8Array(r.diagnosticBytes);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "lord-cricket-diagnostic.json"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (r.archive) {
        const archiveBytes = new Uint8Array(r.archive.byteLength);
        archiveBytes.set(r.archive);
        const blob = new Blob([archiveBytes.buffer], {
          type: "application/zip",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lord-cricket-${new Date().toISOString().slice(0, 10)}.lcxxvi`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    };
    const failed = () => {
      rebuildRequest.current = null;
      setAnalyticsRebuild({ state: "IDLE", applied: 0, total: 0 });
      advanceBatch.current = null;
      setBatchState("idle");
      setFatal(true);
      setBusy(false);
      setError(
        "The match worker stopped. Reload to recover the last durable checkpoint.",
      );
    };
    w.onerror = failed;
    w.onmessageerror = failed;
    // Best effort: give the writer lease back when the page goes away so a reopened tab is not read-only
    // for the rest of the 12 s lease. Correctness does not depend on it; the lease still expires.
    const releaseLease = () => {
      if (inflight.current) return;
      w.postMessage({ version: UI_VERSION, requestId: auxId(), expectedRevision: currentRevision.current, type: "RELEASE_WRITER" });
    };
    const reacquire = (event: PageTransitionEvent) => {
      if (!event.persisted || inflight.current) return;
      const requestId = auxId();
      inflight.current = requestId;
      w.postMessage({ version: UI_VERSION, requestId, expectedRevision: currentRevision.current, type: "RETRY_WRITER" });
    };
    window.addEventListener("pagehide", releaseLease);
    window.addEventListener("pageshow", reacquire);
    const id = `ui-${++serial.current}`;
    inflight.current = id;
    w.postMessage({
      version: UI_VERSION,
      requestId: id,
      expectedRevision: 0,
      type: "BOOT",
      careerFixture: careerLaunch.current,
    });
    return () => {
      window.removeEventListener("pagehide", releaseLease);
      window.removeEventListener("pageshow", reacquire);
      w.terminate();
    };
  }, []);
  // A lease that expired while the owning tab was closing leaves a restored match read-only. Retry for a
  // bounded time (about 30 s) so a legitimate reopen recovers on its own; a live second tab is never taken over.
  useEffect(() => {
    if (!persistence?.readOnly || fatal) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts > 6) { window.clearInterval(timer); return; }
      retryWriter();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [persistence?.readOnly, fatal]);
  function retryWriter() {
    if (inflight.current || fatal) return;
    const requestId = auxId();
    inflight.current = requestId;
    setBusy(true);
    worker.current?.postMessage({ version: UI_VERSION, requestId, expectedRevision: currentRevision.current, type: "RETRY_WRITER" });
  }
  function abandonCareerMatch() {
    if (!window.confirm("Abandon this career match? The match is kept as a plain exhibition and the career fixture stays unplayed.")) return;
    if (inflight.current || fatal) return;
    const requestId = auxId();
    abandonRequest.current = requestId;
    inflight.current = requestId;
    setBusy(true);
    setError("");
    worker.current?.postMessage({ version: UI_VERSION, requestId, expectedRevision: currentRevision.current, type: "ABANDON_MANAGED" });
  }
  useEffect(() => {
    if (view && lastPhase.current !== `${view.phase}:${view.decisionTeamId}`) {
      lastPhase.current = `${view.phase}:${view.decisionTeamId}`;
      decisionRef.current?.focus({ preventScroll: true });
    }
  }, [view]);
  useEffect(() => {
    if (restoreWorldFocus && !editingWorld && !view) {
      editWorldButton.current?.focus();
      setRestoreWorldFocus(false);
    }
  }, [editingWorld, restoreWorldFocus, view]);

  const captainedTeam = scenario?.playerTeamId ?? careerLaunch.current?.managedTeamId ?? view?.teams.find(t => t.id !== aiTeamId)?.id;
  const rivalTeam = view?.teams.find(t => t.id !== captainedTeam)?.id;
  const limitedOvers = view?.format === "T20" || view?.format === "ODI";
  useEffect(() => {
    const saved = persistence?.saveId && localStorage.getItem("lcxxvi-match-pace:" + persistence.saveId);
    setPaceOverride(saved === "highlights" ? true : saved === "manual" ? false : null);
  }, [persistence?.saveId]);
  const highlights = paceOverride ?? (!!scenario && isCloseFinish(scenario.scenarioId));
  // One durable AI action per worker request. Poll again only when the engine revision advances;
  // a no-op never spins. The user remains responsible for advancing the match clock.
  useEffect(() => {
    if (!view || busy || fatal || error || persistence?.readOnly) return;
    if (view.phase === "COMPLETE") return;
    const candidates = [
      ...(aiTeamId && view.teams.some(team => team.id === aiTeamId) ? [{ teamId: aiTeamId, delegated: false }] : []),
      ...view.teams.filter(team => team.id !== aiTeamId && delegationForTeam(delegation, team.id).length > 0).map(team => ({ teamId: team.id, delegated: true })),
    ];
    for (const candidate of candidates) {
      const key = `${candidate.delegated ? "delegated" : "opponent"}:${candidate.teamId}`;
      const stamp = `${view.revision}:${delegation.changes.length}:${matchAware}:${highlights}`;
      if (lastAiChecked.current[key] === stamp) continue;
      lastAiChecked.current[key] = stamp;
      send({ type: "AI_STEP", ...candidate, clubStyle: highlights && !candidate.delegated, matchAware: matchAware && !candidate.delegated });
      return;
    }
  }, [view, aiTeamId, delegation, busy, fatal, error, persistence?.readOnly, matchAware, highlights]);
  // Let the ordinary opponent policy finish its commands before resuming the passage.
  useEffect(() => {
    const active = passage.current;
    if (!active || !view || !captainedTeam || busy || inflight.current) return;
    const innings = view.innings[view.activeIndex]?.innings;
    if (error || fatal || persistence?.readOnly || persistence?.saveId !== active.saveId || !innings) {
      endPassage("");
      return;
    }
    if (active.inningsIndex !== view.activeIndex) { endPassage(passageReport(active, view) + " Innings closed."); return; }
    if (active.stopping || view.phase === "COMPLETE" || innings.wickets !== active.wickets || innings.legalBalls >= active.stopAt ||
        (active.requiredRate !== null && active.requiredRate < 10 && requiredRate(view) >= 10) ||
        (view.phase !== "READY" && view.decisionTeamId === captainedTeam)) {
      endPassage(passageReport(active, view));
    } else if (view.phase === "READY" && !view.advanceReason) {
      const timer = window.setTimeout(() => { if (passage.current === active && !inflight.current) act({kind:"ADVANCE", payload:{scope:"DELIVERY"}}, true); }, 150);
      return () => window.clearTimeout(timer);
    } else if (view.phase === "READY" || aiTeamId !== rivalTeam) {
      endPassage(passageReport(active, view));
    }
  }, [view, captainedTeam, rivalTeam, busy, error, fatal, persistence, aiTeamId]);
  // Stage 14: the tactical captain makes its side's super-over choices.
  const lastSuperOverAi = useRef("");
  useEffect(() => {
    if (!superOver?.pending || !aiTeamId || busy || fatal || persistence?.readOnly) return;
    if (superOver.pending.teamId !== aiTeamId) return;
    const stamp = `${superOver.rounds.length}:${JSON.stringify(superOver.rounds)}:${superOver.pending.decision}`;
    if (lastSuperOverAi.current === stamp) return;
    lastSuperOverAi.current = stamp;
    send({ type: "SUPER_OVER", action: { kind: "AI", teamId: aiTeamId } });
  }, [superOver, aiTeamId, busy, fatal, persistence?.readOnly]);
  function changeAiOpponent(id: string) {
    const next = id || null;
    setAiTeamId(next);
    lastAiChecked.current = {};
    if (careerLaunch.current) return;
    if (next) sessionStorage.setItem("lcxxvi-optional-ai-team", next);
    else sessionStorage.removeItem("lcxxvi-optional-ai-team");
  }
  async function importRoster(file: File | null) {
    if (!file) return;
    try {
      if (file.size > 25_000_000) throw new Error("Roster file exceeds 25 MB.");
      const pack = createStagedRosterPack(await file.text(), RULE_MANIFESTS.map(rule => rule.rulesId), SYNTHETIC_ALPHA_PACK.manifest.variationIds);
      setStagedRoster(pack);
      setStagedWorld(null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error && reason.name !== "ZodError" ? reason.message : "Invalid roster file. Check its required fields and supported values.");
    }
  }
  function downloadRosterTemplate() {
    const players = careerWorld.players.map(player => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    const source = { version: "LC_ROSTER_IMPORT_V1", sourceId: "my-roster", world: { ...careerWorld, players } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(source, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lord-cricket-roster-template.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function saveCopy() {
    if (!view) return;
    const fullTitle = `${view.teams[0]?.name ?? "Team 1"} v ${view.teams[1]?.name ?? "Team 2"} · ${new Date().toLocaleString()}`;
    const title = fullTitle.length > 80 ? `${fullTitle.slice(0, 79)}…` : fullTitle;
    send({ type: "MANUAL_SAVE", title });
  }
  function exportSave(saveId: string | null = null) {
    send({ type: "EXPORT_SAVE", saveId });
  }
  async function importFile(file: File | null) {
    if (!file || inflight.current || fatal) return;
    const archive = new Uint8Array(await file.arrayBuffer());
    send({ type: "IMPORT_SAVE", archive });
  }
  function act(action: Action, continuingPassage = false) {
    if (!view || inflight.current || fatal) return;
    if (passage.current && !continuingPassage) endPassage(passageReport(passage.current, view));
    audioBootSyncRef.current = false;
    audioManagerRef.current?.unlockFromUserGesture();
    setDiagnosticPreview(null);
    if (!advanceBatch.current) setBatchProgress(null);
    const i = view.innings[view.activeIndex]?.innings;
    const team =
      "teamId" in action.payload
        ? action.payload.teamId
        : action.kind === "SET_BATTING_PLAN"
          ? i?.battingTeamId
          : i?.bowlingTeamId;
    const requestId = `ui-${++serial.current}`;
    inflight.current = requestId;
    setBusy(true);
    setError("");
    setVerification(null);
    worker.current?.postMessage({
      version: UI_VERSION,
      type: "COMMAND",
      requestId,
      expectedRevision: view.revision,
      origin: "HUMAN",
      command: {
        ...action,
        commandId: requestId,
        expectedRevision: view.revision,
        actorId: action.kind === "ADVANCE" || action.kind === "ADD_RAIN_DELAY" ? "SYSTEM" : `USER:${team}`,
      },
    });
  }
  function stopPassage() {
    if (!passage.current || !view) return;
    passage.current.stopping = true;
    if (!inflight.current) endPassage(passageReport(passage.current, view));
  }

  function startPassage(action: Action, label: string) {
    if (!view || !captainedTeam || inflight.current || fatal || !persistence?.saveId || persistence.readOnly) return;
    const selectingBowler = action.kind === "SET_BOWLER" &&
      view.phase === "AWAITING_BOWLER" && view.decisionTeamId === captainedTeam;
    if (view.phase !== "READY" && !selectingBowler) return;

    const innings = view.innings[view.activeIndex]!.innings;
    const balls = innings.legalBalls;
    const limit = view.format === "ODI" ? 300 : 120;
    const twoOverBoundary = (Math.floor(balls / 6) + 2) * 6;
    passage.current = {
      saveId: persistence.saveId, label, runs: innings.runs, wickets: innings.wickets, balls, requiredRate: innings.targetToWin ? requiredRate(view) : null,
      boundaries: boundaryCount(view), stopping: false,
      inningsIndex: view.activeIndex, sequence: view.fieldPresentation?.latestHighlight?.sequence ?? 0,
      stopAt: Math.min(balls < limit - 12 ? limit - 12 : limit, twoOverBoundary),
    };
    setPlayingPassage(true);
    setFinishReport("");
    act(action, true);
  }

  function advanceTo(scope: "DECISION" | "INNINGS" | "MATCH") {
    if (!view || inflight.current || fatal || view.advanceReason || persistence?.readOnly) return;
    advanceBatch.current = { scope, innings: view.activeIndex, remaining: 512, cancel: false, from: null };
    setBatchProgress(null);
    setBatchState("running");
    act({ kind: "ADVANCE", payload: { scope: "OVER" } });
  }
  function cancelAnalyticsRebuild() {
    if (!rebuildRequest.current) return;
    setAnalyticsRebuild(current => ({ ...current, state: "STOPPING" }));
    worker.current?.postMessage({ version: UI_VERSION, type: "CANCEL_ANALYTICS", requestId: `ui-${++serial.current}`, expectedRevision: currentRevision.current, targetRequestId: rebuildRequest.current });
  }
  function stopAdvance() {
    setCancelSignal(current => current + 1);
    if (!advanceBatch.current) return;
    advanceBatch.current.cancel = true;
    setBatchState("stopping");
  }
  useEffect(() => {
    if (error) document.querySelector<HTMLElement>("[role=alert]")?.focus();
  }, [error]);
  const ledger = view?.innings[view.activeIndex],
    i = ledger?.innings;
  const tn = (id: string) => view?.teams.find((t) => t.id === id)?.name ?? id;
  const striker =
    i?.strikerEnd === "NORTH" ? i.northBatterId : i?.southBatterId;
  const chaseRuns = i?.targetToWin == null ? null : Math.max(0, i.targetToWin - i.runs);
  const chaseBalls = !i || !view || view.format === "RED_BALL"
    ? null
    : Math.max(0, (view.format === "ODI" ? 300 : 120) - i.legalBalls);
  const preferences = (
      <div className="preferences">
        <label>
          Text scale{" "}
          <select
            aria-label="Text scale"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          >
            <option value="100">100%</option>
            <option value="115">115%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </label>
        <label>
          Commentary{" "}
          <select
            aria-label="Commentary"
            value={commentary}
            onChange={(e) =>
              setCommentary(e.target.value as "full" | "detailed" | "brief" | "off")
            }
          >
            <option value="full">Standard</option>
            <option value="detailed">Detailed</option>
            <option value="brief">Brief</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label>
          Layout{" "}
          <select
            aria-label="Layout"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Tactical briefings{" "}
          <select
            aria-label="Tactical briefings"
            value={briefingsPref}
            onChange={(e) => setBriefingsPref(e.target.value === "hidden" ? "hidden" : "shown")}
          >
            <option value="shown">Shown</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <span className="save-status" data-testid="save-status">
          {persistence?.readOnly
            ? "Read only · another tab owns this save (retrying)"
            : persistence?.savedAt
              ? `Saved · ${new Date(persistence.savedAt).toLocaleTimeString()}`
              : "Local autosave ready"}
        </span>
      </div>
  );
  const pacePanel = view && limitedOvers && captainedTeam && (
    <section className="captain-station" aria-label="Match pace">
      <header>
        <div>
          <p className="eyebrow">CAPTAIN’S PAVILION</p>
          <strong>
            {view.teams.find((t) => t.id === captainedTeam)?.name}
          </strong>
        </div>
        <button
          type="button"
          aria-pressed={highlights}
          disabled={busy || !!persistence?.readOnly}
          onClick={() => {
            if (highlights) stopPassage();
            else if (rivalTeam && !aiTeamId) changeAiOpponent(rivalTeam);
            setPaceOverride(!highlights);
            if (persistence?.saveId)
              localStorage.setItem(
                "lcxxvi-match-pace:" + persistence.saveId,
                highlights ? "manual" : "highlights",
              );
            setDelegationTeam(captainedTeam);
          }}
        >
          {highlights ? "Return to manual pace" : "Play captain’s highlights"}
        </button>
        {view.format === "T20" && (
          <label>
            Opposition{" "}
            <select
              aria-label="Opposition difficulty"
              value={matchAware ? "advanced" : "standard"}
              disabled={busy || playingPassage}
              onChange={(e) => {
                const enabled = e.target.value === "advanced";
                setMatchAware(enabled);
                lastAiChecked.current = {};
                localStorage.setItem(
                  "lcxxvi-captain-challenge",
                  enabled ? "match-aware" : "standard",
                );
              }}
            >
              <option value="standard">Standard</option>
              <option value="advanced">Match-aware</option>
            </select>
          </label>
        )}
      </header>
      {highlights && (
        <>
          <CloseFinish
            view={view}
            playerTeamId={captainedTeam}
            finished={view.phase === "COMPLETE"}
            disabled={
              busy ||
              fatal ||
              Boolean(persistence?.readOnly) ||
              (view.phase === "READY" && Boolean(view.advanceReason))
            }
            playing={playingPassage}
            report={finishReport}
            stop={stopPassage}
            replay={
              scenario
                ? () =>
                    send({
                      type: "SCENARIO_START",
                      scenarioId: scenario.scenarioId,
                    })
                : undefined
            }
            command={startPassage}
            select={act}
          />
          <a
            href="#decision"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector<HTMLElement>("#decision h2")?.focus();
            }}
          >
            Full match controls
          </a>
          <a
            href="#captain-delegation"
            onClick={(e) => {
              e.preventDefault();
              setDelegationTeam(captainedTeam);
              const details = document.querySelector<HTMLDetailsElement>(
                "#captain-delegation",
              );
              if (details) {
                details.open = true;
                details.querySelector("summary")?.focus();
              }
            }}
          >
            Choose delegated decisions
          </a>
        </>
      )}
    </section>
  );
  return (
    <main
      style={{ fontSize: `${Number(scale) / 100}rem` }}
      data-motion={highlightMotion} className={`match-shell density-${density}`}
    >
      <a className="skip" href="#decision">
        Skip to next decision
      </a>
      <header className="masthead">
        <div>
          <p className="eyebrow">{careerLaunch.current ? "CAREER MATCHDAY" : view?.matchId?.startsWith("tour-m") ? "TOURNAMENT MATCHDAY" : scenario ? "SCENARIO CHALLENGE" : "THE FICTIONAL CRICKET EXHIBITION"}</p>
          <h1>
            Lord Cricket <span>XXVI</span>
          </h1>
        </div>
        <span className="alpha">SYNTHETIC_ALPHA</span>
      </header>
      {!view && preferences}
      {view?.matchId?.startsWith("tour-m") && (
        <section className="career-match-banner" data-testid="tournament-banner" aria-label="Tournament match">
          <strong>Tournament match</strong>
          <p>When the match ends (and any super over), go back to Tournaments to record the result.</p>
          <a href="#tournaments">Back to Tournaments</a>
        </section>
      )}
      {scenario && view && (
        <section className="career-match-banner" data-testid="scenario-banner" aria-label="Scenario challenge">
          <strong>Scenario: {scenario.title}</strong>{" "}
          <span className="alpha">{scenario.difficulty}</span>
          <p data-testid="scenario-objective">Objective: {scenario.objectiveSummary}</p>
          <p>{scenario.briefing}</p>
          {scenario.outcome && (
            <p role="status" data-testid="scenario-outcome">
              <strong>{scenario.resultText}</strong>
            </p>
          )}
          <a href="#scenarios">Back to scenarios</a>
        </section>
      )}
      {careerLaunch.current && (
        <div className="career-match-banner">
          <strong>Scheduled career match</strong>
          <span>Round {careerLaunch.current.roundNumber} · this result will return to the management career only after the match is complete.</span>
          {view?.phase === "COMPLETE" && (
            <button className="primary" onClick={() => { const roster = careerLaunch.current?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER"; if (onReturnCareer) onReturnCareer(roster); else window.location.hash = roster ? "#roster-career" : "#career"; }}>Return result to career</button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      {persistence?.recovered && (
        <p className="recovery" role="status">
          Recovered from a valid checkpoint. The damaged source save
          was preserved.
        </p>
      )}
      {!view && (
        <>
          <section className="intro">
            <h2>Take the captain’s chair.</h2>
            <p>
              Select your side and an opponent. You make decisions for{" "}
              <strong>both teams</strong> initially. After starting a match, you can optionally
              delegate either team or individual decisions to the deterministic tactical captain.
            </p>
          </section>
          {displayCatalog ? (
            <>
              <section className="world-customization" aria-label="Exhibition world">
                {editingWorld ? <WorldEditor base={careerWorld} initial={stagedWorld} purpose="exhibition" onClose={() => { setEditingWorld(false); setRestoreWorldFocus(true); }} onStage={copy => { setStagedRoster(null); setStagedWorld(copy); setEditingWorld(false); setRestoreWorldFocus(true); }} /> : <div className="action-row">
                  <button ref={editWorldButton} type="button" disabled={busy || fatal} onClick={() => setEditingWorld(true)}>Edit names and colours</button>
                  {stagedWorld && <button type="button" disabled={busy || fatal} onClick={() => setStagedWorld(null)}>Use original world</button>}
                </div>}
                {stagedWorld && <p role="status">Edited world ready for a new exhibition. Saved matches remain unchanged.</p>}
                <div className="action-row">
                  <button type="button" disabled={busy || fatal || editingWorld} onClick={downloadRosterTemplate}>Download roster template</button>
                  <label className="roster-file">Import roster <input type="file" accept=".json,application/json" disabled={busy || fatal || editingWorld} onChange={event => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importRoster(file); }} /></label>
                  {stagedRoster && <button type="button" disabled={busy || fatal} onClick={() => setStagedRoster(null)}>Use original roster</button>}
                </div>
                {stagedRoster && <p role="status">Imported roster ready for an exhibition. Missing ratings use the declared prior of 50.</p>}
              </section>
              <Setup
                key={stagedRoster?.world.packId ?? stagedWorld?.world.packId ?? "original"}
                catalog={displayCatalog}
                world={stagedRoster?.world ?? stagedWorld?.world ?? careerWorld}
                busy={busy || fatal || editingWorld}
                showBriefings={briefingsPref === "shown"}
                start={(format, selections, groundId) =>
                  send({ type: "START", format, selections, groundId, ...(stagedWorld ? { worldCopy: stagedWorld } : {}), ...(stagedRoster ? { rosterPack: stagedRoster } : {}) })
                }
              />
            </>
          ) : (
            <p role="status">Loading the approved fictional world…</p>
          )}
        </>
      )}
      {view && (
        <>
          <section
            className="scorestrip" data-quay={view.ground === "Aster Quay"} data-stage={view.resultText ? "result" : i?.targetToWin ? "chase" : i ? "innings" : "toss"}
            aria-label="Match scoreboard"
            data-testid="scorestrip"
            /* Both sides' kit colours as a thin stripe along the top: the scoreboard is where edited-world colours show. */
            style={{ ...groundArtBackground(view.ground, ART_WASH.scoreboard), ...(view.teams[0]?.colours && view.teams[1]?.colours ? { boxShadow: `inset 0 2px 0 ${view.teams[0].colours[0]}, inset 0 4px 0 ${view.teams[0].colours[1]}, inset 0 6px 0 ${view.teams[1].colours[0]}, inset 0 8px 0 ${view.teams[1].colours[1]}` } : {}) }}
            data-art="true"
          >
            <div>
              <p>
                {view.ground} · {view.format} ·{" "}
                {i ? `Innings ${view.activeIndex + 1}` : "Pre-match"}
              </p>
              <h2>
                {i
                  ? tn(i.battingTeamId)
                  : view.teams.map((t) => t.name).join(" v ")}
              </h2>
              <div className="broadcast-line">{view.teams.filter(team => !i || team.id === i.battingTeamId).map(team => <TeamCrest key={team.id} teamId={team.id} name={team.name} colours={team.colours ?? []} size={32} decorative />)}
              <strong className="score">
                {i ? `${i.runs}/${i.wickets}` : "Ready for the toss"}
              </strong>
              </div>
              {i && (
                <span className="over">
                  {view.format === "RED_BALL"
                    ? `${overs(i.legalBalls)} overs`
                    : `${overs(i.legalBalls)} / ${view.format === "ODI" ? 50 : 20} overs`}
                </span>
              )}
            </div>
            <div className="target" data-testid="target">
              <span>{view.resultText ? "Result" : i?.targetToWin != null ? "Target" : "Match phase"}</span>
              <strong>{view.resultText ?? i?.targetToWin ?? (i ? `Innings ${view.activeIndex + 1}` : "Pre-match")}</strong>
              {!view.resultText && chaseRuns !== null && (
                <p>
                  {chaseRuns} needed · {chaseBalls === null ? "time remaining" : `${chaseBalls} balls left`}
                  {chaseBalls !== null && chaseBalls > 0 && (
                    <> · Required rate {((6 * chaseRuns) / chaseBalls).toFixed(2)}</>
                  )}
                </p>
              )}
              {view.activeIndex === 1 && (
                <p>
                  {tn(view.innings[0]!.innings.battingTeamId)}{" "}
                  {view.innings[0]!.innings.runs}/
                  {view.innings[0]!.innings.wickets}
                </p>
              )}
            </div>
          </section>
          {highlights && pacePanel}
          <section
            className="active"
            aria-label="Active players"
            data-testid="active"
          >
            <div>
              <span>Batters</span>
              {i ? (
                [i.northBatterId, i.southBatterId].map((id, n) => (
                  <p key={n} className={id ? "active-player" : undefined}>
                    {id ? (
                      <>
                        <PlayerPortrait playerId={id} role={activeRole(view, id)} kit={activeKit(view, id)} size={44} />
                        <strong>
                          {view.names[id]}
                          {id === striker ? " *" : ""}
                        </strong>{" "}
                        {ledger!.batting[id]!.runs} (
                        {ledger!.batting[id]!.ballsFaced})
                      </>
                    ) : (
                      "Awaiting selection"
                    )}
                  </p>
                ))
              ) : (
                <p>Awaiting innings choice</p>
              )}
            </div>
            <div>
              <span>Bowler</span>
              <p className={i?.bowlerId ? "active-player" : undefined}>
                {i?.bowlerId && <PlayerPortrait playerId={i.bowlerId} role="BOWLER" kit={activeKit(view, i.bowlerId)} size={44} />}
                <strong>
                  {i?.bowlerId ? view.names[i.bowlerId] : "Awaiting selection"}
                </strong>
              </p>
              {i?.bowlerId && (
                <p>
                  {overs(ledger!.bowling[i.bowlerId]!.legalBalls)} overs ·{" "}
                  {ledger!.bowling[i.bowlerId]!.wickets}/
                  {ledger!.bowling[i.bowlerId]!.runsConceded}
                </p>
              )}
            </div>
            <div>
              <span>Match status</span>
              <p>
                {view.resultText ??
                  (view.format === "RED_BALL" && view.redBall
                    ? `Day ${view.redBall.day} · ${String(Math.floor(view.redBall.localSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((view.redBall.localSeconds % 3600) / 60)).padStart(2, "0")}${view.redBall.finalHourActive ? ` · final hour ${view.redBall.finalHourBallsRemaining} balls` : ""}`
                    : i?.freeHitPending
                      ? "Free hit pending"
                      : i && i.legalBalls < 36
                        ? "Powerplay: at most 2 outside the circle"
                        : aiTeamId ? `${tn(aiTeamId)} controlled by AI` : "Manual control of both teams")}
              </p>
            </div>
          </section>
          <section
            className="decision"
            id="decision"
            aria-busy={busy}
            data-phase={view.phase}
            data-revision={view.revision}
          >
            <div className="decision-top">
              <div>
                <p className="eyebrow">NEXT DECISION</p>
                <h2 ref={decisionRef} tabIndex={-1}>
                  {view.nextDecision}
                </h2>
              </div>
              <span role="status" className="working">
                {batchState === "stopping" ? "Stopping after this commit…" : busy ? "Applying…" : "Up to date"}
              </span>
            </div>
            {batchState !== "idle" && <button type="button" disabled={batchState === "stopping"} onClick={stopAdvance}>Stop simulation</button>}
            {batchProgress && <p role="status">Committed events {batchProgress.from}–{batchProgress.to}.</p>}
            <fieldset disabled={busy || fatal || persistence?.readOnly}>
              <legend className="sr-only">Match decisions</legend>
              {view.phase === "TOSS" && (
                <div className="actions">
                  <button
                    onClick={() =>
                      act({
                        kind: "CALL_TOSS",
                        payload: {
                          teamId: view.decisionTeamId!,
                          call: "HEADS",
                        },
                      })
                    }
                  >
                    Call heads
                  </button>
                  <button
                    onClick={() =>
                      act({
                        kind: "CALL_TOSS",
                        payload: {
                          teamId: view.decisionTeamId!,
                          call: "TAILS",
                        },
                      })
                    }
                  >
                    Call tails
                  </button>
                </div>
              )}
              {view.phase === "AWAITING_INNINGS" && (
                <div className="actions">
                  <button
                    onClick={() =>
                      act({
                        kind: "CHOOSE_INNINGS",
                        payload: {
                          teamId: view.decisionTeamId!,
                          choice: "BAT",
                        },
                      })
                    }
                  >
                    Bat first
                  </button>
                  <button
                    onClick={() =>
                      act({
                        kind: "CHOOSE_INNINGS",
                        payload: {
                          teamId: view.decisionTeamId!,
                          choice: "BOWL",
                        },
                      })
                    }
                  >
                    Bowl first
                  </button>
                </div>
              )}
              {view.phase === "AWAITING_FOLLOW_ON" && (
                <div className="actions">
                  <button
                    onClick={() =>
                      act({
                        kind: "CHOOSE_FOLLOW_ON",
                        payload: {
                          teamId: view.decisionTeamId!,
                          enforce: true,
                        },
                      })
                    }
                  >
                    Enforce follow-on
                  </button>
                  <button
                    onClick={() =>
                      act({
                        kind: "CHOOSE_FOLLOW_ON",
                        payload: {
                          teamId: view.decisionTeamId!,
                          enforce: false,
                        },
                      })
                    }
                  >
                    Bat again
                  </button>
                </div>
              )}
              {(view.phase === "AWAITING_BATTER" ||
                view.phase === "AWAITING_BOWLER") && (
                <div className="candidates">
                  {view.candidates.map((p) => (
                    <div key={p.id}>
                      <button
                        data-candidate={p.id}
                        disabled={!!p.reason}
                        aria-describedby={
                          p.reason ? `reason-${p.id}` : undefined
                        }
                        onClick={() =>
                          act(
                            view.phase === "AWAITING_BATTER"
                              ? {
                                  kind: "SET_BATTER",
                                  payload: {
                                    teamId: view.decisionTeamId!,
                                    playerId: p.id,
                                  },
                                }
                              : {
                                  kind: "SET_BOWLER",
                                  payload: {
                                    teamId: view.decisionTeamId!,
                                    bowlerId: p.id,
                                  },
                                },
                          )
                        }
                      >
                        {p.name}
                      </button>
                      {p.reason && (
                        <small id={`reason-${p.id}`}>{p.reason}</small>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {view.phase === "READY" && view.format === "RED_BALL" && i && (
                <div className="actions redball-actions">
                  <button
                    onClick={() =>
                      act({
                        kind: "DECLARE",
                        payload: { teamId: i.battingTeamId },
                      })
                    }
                  >
                    Declare innings
                  </button>
                  <button
                    disabled={!view.redBall?.newBallAvailable}
                    onClick={() =>
                      act({
                        kind: "TAKE_NEW_BALL",
                        payload: { teamId: i.bowlingTeamId },
                      })
                    }
                  >
                    Take new ball
                  </button>
                </div>
              )}
              <div className="advance">
                <button
                  disabled={!!view.advanceReason}
                  aria-describedby="advance-reason"
                  onClick={() =>
                    act({ kind: "ADVANCE", payload: { scope: "DELIVERY" } })
                  }
                >
                  Next delivery
                </button>
                <button
                  className="primary"
                  disabled={!!view.advanceReason}
                  aria-describedby="advance-reason"
                  onClick={() =>
                    act({ kind: "ADVANCE", payload: { scope: "OVER" } })
                  }
                >
                  Finish over
                </button>
                <button disabled={!!view.advanceReason} onClick={() => advanceTo("DECISION")}>Next decision</button>
                <button disabled={!!view.advanceReason} onClick={() => advanceTo("INNINGS")}>Finish innings</button>
                <button disabled={!!view.advanceReason} onClick={() => advanceTo("MATCH")}>Finish match</button>
                <span id="advance-reason">
                  {view.advanceReason ||
                    "All options stop at required decisions, including batter or bowler selection."}
                </span>
              </div>
            </fieldset>
          </section>
          {!highlights && pacePanel}
          {preferences}
          <section className="career-match-banner opponent-control" aria-label="Opponent captain control">
            <label htmlFor="ai-opponent-select"><strong>Tactical captain</strong></label>{" "}
            <select id="ai-opponent-select" value={aiTeamId ?? ""} disabled={busy || Boolean(persistence?.readOnly)}
              onChange={e => changeAiOpponent(e.target.value)}>
              <option value="">Manual decisions for both teams</option>
              {view.teams.map(t => <option key={t.id} value={t.id}>{t.name} controlled by AI</option>)}
            </select>
            <span>AI chooses its team's batters, bowlers and tactics through accepted commands. You still advance deliveries.</span>
          </section>
        {careerLaunch.current && !view.resultText && onInspectCareer && <button type="button" disabled={busy || fatal} onClick={() => onInspectCareer(careerLaunch.current?.launchVersion === "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER")}>Inspect career</button>}
          {(() => {
            const selectedTeam = view.teams.find(team => team.id === delegationTeam) ?? view.teams[0]!;
            const selected = delegationForTeam(delegation, selectedTeam.id);
            const currentProfile = redBallProfileForTeam(delegation, selectedTeam.id);
            const choices: [DelegationCategory, string][] = [
              ["TOSS", "Toss call"],
              ["INNINGS", "Bat or bowl"],
              ["BATTER", "Batter selection"],
              ["BOWLER", "Bowler selection"],
              ["BATTING_PLAN", "Batting plan"],
              ["BOWLING_PLAN", "Bowling plan"],
              ...(view.format !== "T20" ? [["FIELD", "Field placement"]] as [DelegationCategory, string][] : []),
              ...(view.format === "RED_BALL" ? [["DECLARATION", "Declaration"], ["FOLLOW_ON", "Follow-on"], ["NEW_BALL", "New ball"]] as [DelegationCategory, string][] : []),
            ];
            return <details className="career-panel" id="captain-delegation">
              <summary>Delegate individual decisions</summary>
              <p>Choose which decisions the tactical captain may make. These choices are saved with the match.</p>
              <label>Delegation team <select value={selectedTeam.id} disabled={busy || fatal} onChange={event => setDelegationTeam(event.currentTarget.value)}>{view.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              {view.format === "RED_BALL" && (
                <div>
                  <label>Red-ball tactical profile <select aria-label="Red-ball tactical profile" value={currentProfile} disabled={busy || fatal || Boolean(persistence?.readOnly)} onChange={event => {
                    const redBallProfile = event.currentTarget.value as RedBallTacticalProfile;
                    send({ type: "SET_DELEGATION", teamId: selectedTeam.id, expectedDelegationRevision: delegation.changes.length, categories: [...selected], redBallProfile });
                  }}>
                    <option value="CONSERVATIVE">Conservative</option>
                    <option value="BALANCED">Balanced</option>
                    <option value="AGGRESSIVE">Aggressive</option>
                  </select></label>
                  <p data-testid="redball-profile-posture">{RED_BALL_PROFILE_DESCRIPTIONS[currentProfile]}</p>
                </div>
              )}
              {aiTeamId === selectedTeam.id && <p>The tactical captain controls this team until you change the opponent setting.</p>}
              <fieldset disabled={busy || fatal || Boolean(persistence?.readOnly) || aiTeamId === selectedTeam.id}>
                <legend>Delegated decisions</legend>
                {choices.map(([category, label]) => <label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={event => {
                  const categories = event.currentTarget.checked ? [...selected, category] : selected.filter(value => value !== category);
                  send({ type: "SET_DELEGATION", teamId: selectedTeam.id, expectedDelegationRevision: delegation.changes.length, categories, ...(view.format === "RED_BALL" ? { redBallProfile: currentProfile } : {}) });
                }} /> {label}</label>)}
              </fieldset>
            </details>;
          })()}
          {view.format === "RED_BALL" && view.redBall && (
            <details className="career-panel" data-testid="redball-conditions-panel">
              <summary>Red-ball pitch wear and weather controls</summary>
              <p data-testid="redball-conditions-summary">
                Day {view.redBall.day} · Phase: {view.redBall.clockPhase ?? "PLAY"} · Weather delay today: {Math.round((view.redBall.delaySecondsToday ?? 0) / 60)} min · Pitch wear: {view.redBall.pitchWearPoints ?? 0} pts · Seam: {((view.redBall.seamBp ?? 5000) / 100).toFixed(1)}% · Turn: {((view.redBall.turnBp ?? 5000) / 100).toFixed(1)}%
              </p>
              {view.redBall.forecast && (
                <p data-testid="redball-uncertain-forecast">
                  {view.redBall.forecast.summaryText}
                </p>
              )}
              <p>
                Seeded weather segments use an independent random domain; forecasts show coarse uncertainty bands without revealing the hidden segment schedule, and weather checks apply only at safe over boundaries.
              </p>
              {view.phase !== "COMPLETE" && view.innings.length > 0 && (
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy || fatal || Boolean(persistence?.readOnly) || !view.redBall.atSafeWeatherBoundary}
                    onClick={() => send({ type: "CHECK_SEEDED_WEATHER" })}
                  >
                    Check weather at boundary
                  </button>
                  <button type="button" disabled={busy || fatal || Boolean(persistence?.readOnly)} onClick={() => act({ kind: "ADD_RAIN_DELAY", payload: { seconds: 1800 } })}>Rain delay (30m)</button>
                  <button type="button" disabled={busy || fatal || Boolean(persistence?.readOnly)} onClick={() => act({ kind: "ADD_RAIN_DELAY", payload: { seconds: 3600 } })}>Rain delay (60m)</button>
                </div>
              )}
            </details>
          )}
          {view.phase === "READY" && (
            <Tactics
              key={`${view.revision}`}
              view={view}
              disabled={busy || fatal}
              act={act}
            />
          )}
          {view.fieldPresentation && view.innings.length > 0 && (
            <LiveFieldPanel
              presentation={view.fieldPresentation}
              committedFieldSlots={view.fieldSlots}
              outfieldIds={ledger?.outfieldIds ?? []}
              bowlingTeamId={i?.bowlingTeamId ?? null}
              legalBalls={i?.legalBalls ?? 0}
              names={view.names}
              busy={busy || fatal || Boolean(persistence?.readOnly)}
              pacingMode={highlightPacing}
              onChangePacingMode={setHighlightPacing}
              motionMode={highlightMotion}
              onChangeMotionMode={setHighlightMotion}
              committedWindow={committedWindow}
              cancelSignal={cancelSignal}
              onApplyField={act}
            />
          )}
          {briefingsPref === "shown" && view.tacticalAssistant && (
            <InMatchTacticalAssistantPanel
              assistant={view.tacticalAssistant}
              phase={view.phase}
              busy={busy || fatal || Boolean(persistence?.readOnly)}
              strikerId={striker ?? null}
              activeBowlerId={i?.bowlerId ?? null}
              bowlingTeamId={i?.bowlingTeamId ?? null}
              onApplyAction={act}
            />
          )}
          {view.phase === "COMPLETE" && superOver && (
            <SuperOverPanel
              view={superOver}
              aiTeamId={aiTeamId}
              busy={busy || fatal || Boolean(persistence?.readOnly)}
              onStart={() => send({ type: "SUPER_OVER", action: { kind: "START" } })}
              onCommand={(command) => send({ type: "SUPER_OVER", action: { kind: "COMMAND", command } })}
            />
          )}
          {view.resultText && (
            <section className="result">
              <h2>{view.resultText}</h2>
              <p>
                One complete fictional{" "}
                {view.format === "RED_BALL"
                  ? "five-day red-ball match"
                  : view.format}
                . Review the innings below.
              </p>
              {view.matchAward && (
                <div
                  className="match-award-box"
                  data-testid="match-award-panel"
                >
                  <div className="match-award-head">
                    <strong>Player of the Match</strong>
                    <span className="award-provenance-tag" data-testid="match-award-provenance">
                      Game award · {view.matchAward.awardVersion}
                    </span>
                  </div>
                  {view.matchAward.status === "AWARDED" && view.matchAward.winnerPlayerId ? (
                    <>
                      <p data-testid="match-award-winner">
                        <strong>
                          {view.names[view.matchAward.winnerPlayerId] ?? view.matchAward.winnerPlayerId}
                        </strong>{" "}
                        (
                        {view.teams.find((t) => t.id === view.matchAward?.winnerTeamId)?.name ??
                          view.matchAward.winnerTeamId}
                        {view.matchAward.fromLosingTeam ? " · losing side" : ""}) ·{" "}
                        {((view.matchAward.scoreTotalX100 ?? 0) / 100).toFixed(2)} pts
                      </p>
                      <p className="match-award-explain">{view.matchAward.explanationText}</p>
                      {view.matchAward.components && (
                        <p className="match-award-breakdown" data-testid="match-award-breakdown">
                          Bat {(view.matchAward.components.battingPointsX100 / 100).toFixed(1)} · Bowl{" "}
                          {(view.matchAward.components.bowlingPointsX100 / 100).toFixed(1)} · Field{" "}
                          {(view.matchAward.components.fieldingPointsX100 / 100).toFixed(1)} · Result{" "}
                          {(view.matchAward.components.resultBonusX100 / 100).toFixed(1)}
                        </p>
                      )}
                      {view.matchAward.candidates.length > 1 && (
                        <ol className="match-award-candidates">
                          {view.matchAward.candidates.slice(0, 3).map((cand: MatchAwardCandidate) => (
                            <li key={cand.playerId}>
                              {view.names[cand.playerId] ?? cand.playerId} (
                              {view.teams.find((t) => t.id === cand.teamId)?.name ?? cand.teamId}):{" "}
                              {(cand.totalPointsX100 / 100).toFixed(2)} pts — {cand.summaryLine}
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  ) : (
                    <p data-testid="match-award-winner">{view.matchAward.explanationText}</p>
                  )}
                  <p className="award-notice">{AWARDS_PROVENANCE_NOTICE}</p>
                </div>
              )}
              <button
                disabled={busy || fatal}
                onClick={() => send({ type: "VERIFY" })}
              >
                Verify replay and scorecard
              </button>
              {verification && (
                <div className="verification" data-testid="verification">
                  <strong>Replay and command resimulation match.</strong>
                  <p>
                    Accepted events: {verification.eventCount}. Human requests:{" "}
                    {verification.humanRequests}. Test autopilot requests: 0.
                  </p>
                  <p>
                    Event bytes SHA-256{" "}
                    <code data-testid="events-hash">
                      {verification.eventsSha256}
                    </code>
                  </p>
                  <p>
                    Scorecard SHA-256{" "}
                    <code data-testid="card-hash">
                      {verification.scorecardSha256}
                    </code>
                  </p>
                </div>
              )}
            </section>
          )}
          {view.analytics && <AnalyticsPanel data={view.analytics} names={view.names} hands={view.hands} busy={busy || fatal} rebuild={analyticsRebuild} onRebuild={() => send({ type: "REBUILD_ANALYTICS" })} onCancel={cancelAnalyticsRebuild} />}
          <div className="details-grid">
            <section className="panel">
              <h2>Scorecard</h2>
              {view.scorecard && <ScorecardExport view={view} />}
              {view.innings.length === 0 && (
                <p>The scorecard starts with the first innings.</p>
              )}
              {view.innings.map((l, index) => (
                <article key={index}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <TeamCrest teamId={l.innings.battingTeamId} name={tn(l.innings.battingTeamId)} colours={view.teams.find((t) => t.id === l.innings.battingTeamId)?.colours ?? []} size={22} decorative />
                    <h3>
                      {tn(l.innings.battingTeamId)} · {l.innings.runs}/
                      {l.innings.wickets} ({overs(l.innings.legalBalls)})
                    </h3>
                  </div>
                  <table>
                    <caption>Innings {index + 1} batting</caption>
                    <thead>
                      <tr>
                        <th>Batter</th>
                        <th>Runs</th>
                        <th>Balls</th>
                        <th>4s</th>
                        <th>6s</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(l.batting).map(([id, b]) => (
                        <tr key={id}>
                          <th>
                            {view.names[id]}
                            <small>
                              {b.dismissed
                                ? "Out"
                                : [
                                      l.innings.northBatterId,
                                      l.innings.southBatterId,
                                    ].includes(id)
                                  ? "Not out"
                                  : "Did not bat"}
                            </small>
                          </th>
                          <td>{b.runs}</td>
                          <td>{b.ballsFaced}</td>
                          <td>{b.fours}</td>
                          <td>{b.sixes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    Extras{" "}
                    {Object.values(l.innings.extras).reduce((a, b) => a + b, 0)}
                    : {l.innings.extras.wides} wides, {l.innings.extras.noBalls}{" "}
                    no-balls, {l.innings.extras.byes} byes,{" "}
                    {l.innings.extras.legByes} leg-byes.
                  </p>
                  <table>
                    <caption>Innings {index + 1} bowling</caption>
                    <thead>
                      <tr>
                        <th>Bowler</th>
                        <th>Overs</th>
                        <th>Runs</th>
                        <th>Wkts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(l.bowling)
                        .filter(
                          ([, b]) =>
                            b.legalBalls || b.runsConceded || b.wickets,
                        )
                        .map(([id, b]) => (
                          <tr key={id}>
                            <th>{view.names[id]}</th>
                            <td>{overs(b.legalBalls)}</td>
                            <td>{b.runsConceded}</td>
                            <td>{b.wickets}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </section>
            <section className="panel commentary" data-testid="match-commentary-panel">
              <h2>Commentary</h2>
              <p>From accepted match events only. Latest first.</p>
              {commentary === "off" ? (
                <p>Commentary hidden. Match decisions remain above.</p>
              ) : (
                <>
                <ol reversed>
                  {(showAllCommentary ? view.commentary : view.commentary.slice(-COMMENTARY_WINDOW))
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={e.sequence} value={e.sequence} data-category={e.category} data-moment={e.sequence === view.commentary.at(-1)?.sequence && (e.category === "DISMISSAL" || e.category === "MILESTONE" || e.category === "RESULT" || !!e.milestoneTags?.length)}>
                        <span>{selectCommentaryTextForMode(e, commentary)}</span>
                        {commentary !== "brief" && e.milestoneTags && e.milestoneTags.length > 0 && (
                          <span className="commentary-milestones" aria-label="Milestones">
                            {e.milestoneTags.map((tag) => (
                              <span key={tag} className="commentary-milestone-badge">
                                {tag.replaceAll("_", " ")}
                              </span>
                            ))}
                          </span>
                        )}
                      </li>
                    ))}
                </ol>
                {view.commentary.length > COMMENTARY_WINDOW && (
                  <button type="button" className="secondary" onClick={() => setShowAllCommentary((v) => !v)}>
                    {showAllCommentary
                      ? `Show the latest ${COMMENTARY_WINDOW} entries`
                      : `Show all ${view.commentary.length} entries`}
                  </button>
                )}
                </>
              )}
            </section>
          </div>
        </>
      )}
      <AudioControlsPanel
        preferences={audioPrefs}
        snapshot={audioSnapshot}
        onChangePreferences={setAudioPrefs}
        onUnlockAudio={() => audioManagerRef.current?.unlockFromUserGesture()}
        onUiInteract={(caption) => void audioManagerRef.current?.playUiFeedback(caption)}
      />
      <section className="panel" aria-label="Match diagnostic export">
        <h2>Match diagnostic</h2>
        <p>The file contains match events, identifiers and the most recent rejected command if available. The random seed is included once the match is complete, or if you choose to include it. With the seed, anyone can replay the rest of an unfinished match. Review the file before sharing.</p>
        {view?.phase !== "COMPLETE" && <label><input type="checkbox" checked={diagnosticSeed} onChange={(event) => setDiagnosticSeed(event.currentTarget.checked)} /> Include the random seed (reveals the rest of this unfinished match)</label>}
        <button type="button" disabled={busy || fatal} onClick={() => send({ type: "PREVIEW_DIAGNOSTIC", includeSeed: diagnosticSeed })}>Preview diagnostic</button>
        {diagnosticPreview && <div role="region" aria-label="Diagnostic preview">
          <p>Format: {diagnosticPreview.format ?? "Unavailable"}. Events: {diagnosticPreview.eventCount}. Revision: {diagnosticPreview.revision ?? "Unavailable"}. Size: {diagnosticPreview.byteCount} bytes.</p>
          <p>Seed: {diagnosticPreview.includesSeed ? "Included in file" : "Not included"}. Latest failure: {diagnosticPreview.failure ? `${diagnosticPreview.failure.requestType}, sequence ${diagnosticPreview.failure.sequence ?? "unavailable"}, code ${diagnosticPreview.failure.invariantCode ?? "unavailable"}` : "None recorded in this session"}.</p>
          <p>File version: LC_MATCH_DIAGNOSTIC_V1. Model status: SYNTHETIC_ALPHA. Engine: {diagnosticPreview.engine ?? "Unavailable"}.</p>
          <p>Rules hash: <code>{diagnosticPreview.rulesHash ?? "Unavailable"}</code>. Model hash: <code>{diagnosticPreview.modelHash ?? "Unavailable"}</code>.</p>
          <p>SHA-256: <code>{diagnosticPreview.sha256}</code></p>
          <button type="button" disabled={busy || fatal} onClick={() => send({ type: "EXPORT_DIAGNOSTIC", sha256: diagnosticPreview.sha256 })}>Download diagnostic</button>
        </div>}
      </section>
      <section className="save-manager" aria-label="Save files">
        <div className="save-file-actions">
          {view && (
            <>
              {!careerLaunch.current && <button type="button" disabled={busy || fatal} onClick={() => send({ type: "BOOT", fresh: true })}>New exhibition</button>}
              {careerLaunch.current && view.phase !== "COMPLETE" && <button type="button" disabled={busy || fatal} onClick={abandonCareerMatch}>Abandon career match</button>}
              {persistence?.readOnly && <button type="button" disabled={busy || fatal} onClick={retryWriter}>Retry write access</button>}
              <button
                type="button"
                disabled={busy || fatal || persistence?.readOnly}
                onClick={saveCopy}
              >
                Save copy
              </button>
              <button
                type="button"
                disabled={busy || fatal}
                onClick={() => exportSave(null)}
              >
                Export current
              </button>
            </>
          )}
          <label className="import-control">
            Import .lcxxvi
            <input
              aria-label="Import saved game"
              type="file"
              accept=".lcxxvi,application/zip"
              disabled={busy || fatal}
              onChange={(e) => {
                void importFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {persistence && persistence.saves.length > 0 && (
          <details className="saved-games" open={!view}>
            <summary>Saved games ({persistence.saves.length})</summary>
            <div className="section-heading">
              <p className="eyebrow">SAVED GAMES</p>
              <h2>Continue or manage a match</h2>
            </div>
            <div className="save-list">
              {persistence.saves.map((save) => (
                <article key={save.saveId} className="save-card">
                  <div>
                    <strong>{save.title}</strong>
                    <p>
                      {save.phase.replaceAll("_", " ")} · revision{" "}
                      {save.revision} ·{" "}
                      {new Date(save.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      disabled={
                        busy || fatal || save.saveId === persistence.saveId
                      }
                      onClick={() =>
                        send({ type: "LOAD_SAVE", saveId: save.saveId })
                      }
                    >
                      {save.saveId === persistence.saveId ? "Current" : "Load"}
                    </button>
                    <button
                      disabled={busy || fatal}
                      onClick={() => exportSave(save.saveId)}
                    >
                      Export
                    </button>
                    <button
                      disabled={busy || fatal}
                      onClick={() =>
                        send({ type: "DELETE_SAVE", saveId: save.saveId })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
      <footer>
        <p>
          Autosaves and manual copies are stored locally in this browser.
          Portable .lcxxvi exports include the deterministic match history and
          pinned engine/model/rules identity required for validated resume.
        </p>
        <p>
          Original world: 160 fictional players, 8 squads. T20, ODI and five-day
          red-ball exhibitions use custom game rules; no certified ICC
          compliance or empirical realism. A one-season T20 career, optional
          T20/ODI/red-ball tactical captaincy, and explicit deterministic
          red-ball weather delays are available. DLS remains disabled.
        </p>
      </footer>
    </main>
  );
}
function Setup({
  catalog,
  world,
  busy,
  showBriefings,
  start,
}: {
  catalog: Catalog;
  world: WorldPack;
  busy: boolean;
  showBriefings: boolean;
  start: (
    format: "T20" | "ODI" | "RED_BALL",
    teams: [Selection, Selection],
    ground: string,
  ) => void;
}) {
  const [teams, setTeams] = useState<[Selection, Selection]>([
    structuredClone(catalog.teams[0]!.suggested),
    structuredClone(catalog.teams[1]!.suggested),
  ]);
  const [ground, setGround] = useState(catalog.grounds[0]!.id);
  const [format, setFormat] = useState<"T20" | "ODI" | "RED_BALL">(() => world.rulesIds.includes("LC_T20_01") ? "T20" : world.rulesIds.includes("LC_ODI_01") ? "ODI" : "RED_BALL");
  const reasons = teams
    .map((s, index) => {
      const t = catalog.teams.find((t) => t.id === s.teamId)!;
      const selected = t.players.filter((p) => s.playerIds.includes(p.id));
      return s.playerIds.length !== 11
        ? `Side ${index + 1}: select exactly 11 players (${s.playerIds.length}/11).`
        : !s.playerIds.includes(s.captainId)
          ? `Side ${index + 1}: select a captain in the XI.`
          : !selected.some((p) => p.id === s.keeperId && p.role === "KEEPER")
            ? `Side ${index + 1}: select an eligible keeper in the XI.`
            : selected.filter((p) => p.canBowl && p.id !== s.keeperId).length <
                5
              ? `Side ${index + 1}: select at least five bowlers.`
              : "";
    })
    .filter(Boolean);
  if (teams[0].teamId === teams[1].teamId)
    reasons.push("Choose two different teams.");
  const selectedGround =
    world.grounds.find((item) => item.groundId === ground) ?? world.grounds[0]!;
  const preMatchBriefing = useMemo(() => {
    if (teams[0].teamId === teams[1].teamId) return null;
    const buildSide = (sel: Selection) => {
      const team = catalog.teams.find((candidate) => candidate.id === sel.teamId)!;
      return {
        teamId: team.id,
        teamName: team.name,
        players: team.players.map((p) => {
          const wp = world.players.find((candidate) => candidate.playerId === p.id);
          return {
            playerId: p.id,
            name: p.name,
            role: (wp?.role ?? p.role) as "BATTER" | "BOWLER" | "ALLROUNDER" | "KEEPER",
            batHand: p.batHand ?? wp?.batHand ?? ("R" as const),
            bowlingStyle: wp?.bowlingStyle ?? null,
          };
        }),
      };
    };
    return projectPreMatchBriefing({
      format,
      ground: {
        groundId: selectedGround.groundId,
        name: selectedGround.name,
        pitchPrior: {
          seamBp: selectedGround.pitchPrior.seamBp,
          turnBp: selectedGround.pitchPrior.turnBp,
        },
      },
      teams: [buildSide(teams[0]), buildSide(teams[1])],
      selections: teams,
    });
  }, [catalog, format, selectedGround, teams, world]);
  function update(index: number, s: Selection) {
    setTeams(
      (prev) =>
        prev.map((old, i) => (i === index ? s : old)) as [Selection, Selection],
    );
  }
  return (
    <section className="setup">
      {/* The match-up banner: both crests over the chosen ground's art. Decorative: the selects below carry the names. */}
      <div className="setup-hero" aria-hidden="true" data-art="true" style={groundArtBackground(selectedGround.name, ART_WASH.banner)}>
        {teams.map((sel, index) => {
          const team = world.teams.find((candidate) => candidate.teamId === sel.teamId);
          return (
            <React.Fragment key={index}>
              {index === 1 && <span className="setup-hero-v">v</span>}
              <TeamCrest teamId={sel.teamId} name={team?.name ?? sel.teamId} colours={team?.colours ?? []} size={88} decorative />
            </React.Fragment>
          );
        })}
      </div>
      <fieldset disabled={busy}>
        <legend>Choose teams and XIs</legend>
        <label>
          Format{" "}
          <select
            aria-label="Format"
            value={format}
            onChange={(e) =>
              setFormat(e.target.value as "T20" | "ODI" | "RED_BALL")
            }
          >
            <option value="T20" disabled={!world.rulesIds.includes("LC_T20_01")}>T20 · 20 overs</option>
            <option value="ODI" disabled={!world.rulesIds.includes("LC_ODI_01")}>ODI · 50 overs</option>
            <option value="RED_BALL" disabled={!world.rulesIds.includes("LC_RED5_01")}>Red ball · five days</option>
          </select>
        </label>
        <label>
          Ground{" "}
          <select
            aria-label="Ground"
            value={ground}
            onChange={(e) => setGround(e.target.value)}
          >
            {catalog.grounds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <PitchInspection ground={world.grounds.find((item) => item.groundId === ground)} format={format} />
        {showBriefings && preMatchBriefing && (
          <PreMatchBriefingPanel
            briefing={preMatchBriefing}
            focusTeamId={teams[0].teamId}
          />
        )}
        <div className="team-grid">
          {teams.map((s, index) => {
            const t = catalog.teams.find((t) => t.id === s.teamId)!;
            return (
              <div className="panel" key={index}>
                <label>
                  {index === 0 ? "Your team" : "Opponent"}
                  <select
                    aria-label={index === 0 ? "Your team" : "Opponent"}
                    value={s.teamId}
                    onChange={(e) =>
                      update(
                        index,
                        structuredClone(
                          catalog.teams.find((t) => t.id === e.target.value)!
                            .suggested,
                        ),
                      )
                    }
                  >
                    {catalog.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <h3>
                  Playing XI <span>{s.playerIds.length}/11</span>
                </h3>
                <div className="squad">
                  {t.players.map((p) => (
                    <label className="player-choice" key={p.id}>
                      <input
                        type="checkbox"
                        checked={s.playerIds.includes(p.id)}
                        onChange={(e) =>
                          update(index, {
                            ...s,
                            playerIds: e.target.checked
                              ? [...s.playerIds, p.id]
                              : s.playerIds.filter((id) => id !== p.id),
                          })
                        }
                      />
                      <PlayerPortrait playerId={p.id} role={p.role} kit={world.teams.find((team) => team.teamId === s.teamId)?.colours ?? []} size={30} />
                      <span>
                        {p.name}
                        <small>
                          {p.role.toLowerCase()} ·{" "}
                          {p.style?.toLowerCase().replaceAll("_", " ") ??
                            "non-bowler"}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="roles">
                  <label>
                    Captain, side {index + 1}
                    <select
                      aria-label={`Captain, side ${index + 1}`}
                      value={
                        s.playerIds.includes(s.captainId) ? s.captainId : ""
                      }
                      onChange={(e) =>
                        update(index, { ...s, captainId: e.target.value })
                      }
                    >
                      <option value="">Choose captain</option>
                      {t.players
                        .filter((p) => s.playerIds.includes(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Keeper, side {index + 1}
                    <select
                      aria-label={`Keeper, side ${index + 1}`}
                      value={s.playerIds.includes(s.keeperId) ? s.keeperId : ""}
                      onChange={(e) =>
                        update(index, { ...s, keeperId: e.target.value })
                      }
                    >
                      <option value="">Choose keeper</option>
                      {t.players
                        .filter(
                          (p) =>
                            p.role === "KEEPER" && s.playerIds.includes(p.id),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <p>
          Suggested XIs are preselected for review. All match decisions remain
          manual.
        </p>
        <button
          className="primary"
          disabled={reasons.length > 0}
          aria-describedby="setup-reasons"
          onClick={() => start(format, teams, ground)}
        >
          Confirm XIs and start
        </button>
        <div id="setup-reasons" role="status">
          {reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
function Tactics({
  view,
  disabled,
  act,
}: {
  view: View;
  disabled: boolean;
  act: (a: Action) => void;
}) {
  const i = view.innings[view.activeIndex]!.innings;
  const [bowling, setBowling] = useState(view.bowlingPlan!);
  const [field, setField] = useState(view.fieldSlots);
  return (
    <section className="tactics panel">
      <h2>Tactics</h2>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Tactics</legend>
        <div className="tactic-grid">
          <div>
            <h3>Batting aggression</h3>
            {[i.northBatterId, i.southBatterId]
              .filter((id): id is string => !!id)
              .map((id) => (
                <label key={id}>
                  {view.names[id]}
                  <select
                    aria-label={`Aggression for ${view.names[id]}`}
                    value={view.battingPlans[id]?.aggression ?? 2}
                    onChange={(e) =>
                      act({
                        kind: "SET_BATTING_PLAN",
                        payload: {
                          playerId: id,
                          aggression: Number(e.target.value),
                          intent: view.battingPlans[id]?.intent ?? "NORMAL",
                        },
                      })
                    }
                  >
                    {[
                      "0 · Defend",
                      "1 · Cautious",
                      "2 · Balanced",
                      "3 · Positive",
                      "4 · Attack",
                    ].map((name, n) => (
                      <option key={n} value={n}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
          <div>
            <h3>Bowling plan</h3>
            <label>
              Variation
              <select aria-label="Variation" value="stock" disabled>
                <option>stock</option>
              </select>
            </label>
            <small>Only stock is supported by this model.</small>
            <label>
              Effort
              <select
                aria-label="Effort"
                value={bowling.effort}
                onChange={(e) =>
                  setBowling({
                    ...bowling,
                    effort: e.target.value as typeof bowling.effort,
                  })
                }
              >
                {["CONSERVE", "NORMAL", "MAXIMUM"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Line
              <select
                aria-label="Line"
                value={bowling.line}
                onChange={(e) =>
                  setBowling({
                    ...bowling,
                    line: e.target.value as typeof bowling.line,
                  })
                }
              >
                {["OFF", "STUMPS", "LEG"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Length
              <select
                aria-label="Length"
                value={bowling.length}
                onChange={(e) =>
                  setBowling({
                    ...bowling,
                    length: e.target.value as typeof bowling.length,
                  })
                }
              >
                {["YORKER", "FULL", "GOOD", "SHORT"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                act({ kind: "SET_BOWLING_PLAN", payload: bowling })
              }
            >
              Apply bowling plan
            </button>
          </div>
          <div>
            <h3>Named field</h3>
            <p>
              {i.legalBalls < 36 ? "Powerplay: 2" : "After powerplay: 5"}{" "}
              outside the circle maximum. Duplicate positions are rejected.
            </p>
            {field.map((slot, n) => (
              <label key={slot.playerId}>
                {view.names[slot.playerId]}
                <select
                  aria-label={`Field for ${view.names[slot.playerId]}`}
                  value={slot.slotId}
                  onChange={(e) =>
                    setField(
                      field.map((s, j) =>
                        n === j ? { ...s, slotId: e.target.value } : s,
                      ),
                    )
                  }
                >
                  {view.positions.map((p) => (
                    <option key={p} value={p}>
                      {p.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              onClick={() =>
                act({
                  kind: "SET_FIELD",
                  payload: { teamId: i.bowlingTeamId, fieldSlots: field },
                })
              }
            >
              Apply named field
            </button>
            <p>Edits take effect only after acceptance.</p>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
function RootApp() {
  const [hash, setHash] = useState(window.location.hash || "#career");
  const [retainedMatch, setRetainedMatch] = useState(() => sessionStorage.getItem("lcxxvi-inspecting-match") === "1");
  const [offlineState, setOfflineState] = useState(() => offlineUpdateCoordinator.getState());
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#career");
    window.addEventListener("hashchange", onHash);
    const unsub = offlineUpdateCoordinator.subscribe(setOfflineState);
    void offlineUpdateCoordinator.register();
    return () => {
      window.removeEventListener("hashchange", onHash);
      unsub();
    };
  }, []);
  const inspect = (roster: boolean) => { sessionStorage.setItem("lcxxvi-inspecting-match", "1"); setRetainedMatch(true); window.location.hash = roster ? "#roster-career" : "#career"; };
  const finish = (roster: boolean) => { sessionStorage.removeItem("lcxxvi-inspecting-match"); setRetainedMatch(false); window.location.hash = roster ? "#roster-career" : "#career"; };
  return <>
    {offlineState.waitingWorkerPresent && (
      <section role="status" aria-live="polite" className="panel" data-testid="safe-update-banner">
        <strong>Application update staged.</strong>{" "}
        {offlineState.deferredByActiveTransaction
          ? "Waiting for the current match or save transaction to finish before applying."
          : "All saves and transactions are idle. Current supported engines remain retained."}{" "}
        <button
          type="button"
          disabled={!offlineState.canApplyNow}
          onClick={() => {
            const res = offlineUpdateCoordinator.applySafeUpdate();
            if (res.applied && navigator.serviceWorker?.controller) {
              navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
            }
          }}
        >
          Apply update safely
        </button>{" "}
        <a href={offlineState.recoveryBuildPath}>Recovery build</a>
      </section>
    )}
    {(hash === "#exhibition" || retainedMatch) && <div hidden={hash !== "#exhibition"}><MatchApp onInspectCareer={inspect} onReturnCareer={finish} /></div>}
    {hash === "#scenarios" && <ScenariosApp />}
    {hash === "#tournaments" && <TournamentsApp />}
    {hash === "#rain" && <RainApp />}
    {hash !== "#exhibition" && hash !== "#scenarios" && hash !== "#tournaments" && hash !== "#rain" && (hash === "#roster-career" ? <RosterCareerApp inspectionOnly={retainedMatch} /> : <CareerApp inspectionOnly={retainedMatch} />)}
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(<RootApp />);

/** Kit colours of the side a player is in, for their portrait on the match screen. */
function activeKit(view: View, playerId: string): readonly string[] {
  return view.teams.find((team) => team.playerIds.includes(playerId))?.colours ?? [];
}
/** A player's role for their portrait: the keeper from the team sheet, otherwise the approved world's record. */
function activeRole(view: View, playerId: string): string {
  if (view.teams.some((team) => team.keeperId === playerId)) return "KEEPER";
  return careerWorld.players.find((player) => player.playerId === playerId)?.role ?? "BATTER";
}
