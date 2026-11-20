import { useEffect, useRef, useState } from "react";
import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson, TOURNAMENT_RUN_SCHEMA_ID, type Competition, type TournamentFixture, type TournamentResult, type TournamentRun, type TournamentStage, type UserCompetition, type UserTour, UserTourSchema, TOURNAMENT_AUCTION_SCHEMA_ID, type TournamentAuctionRecord, type WorldPack, type StagedRosterPack } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, competitionById } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { IndexedDbSaveRepository, sha256Text } from "@lcxxvi/persistence";
import { rehydrateODISession, rehydrateRosterODISession, rehydrateRosterT20Session, rehydrateT20Session, verifySuperOverRecord, type ODISession, type T20Session } from "@lcxxvi/simulation";
import { isKnockoutStage, tournamentMatchIdentity, tournamentResultFromSession } from "./runner.js";
import type { TournamentWorkerRequest, TournamentWorkerResponse } from "./tournament.worker.js";
import { buildUserCompetition, parseUserCompetitionPack, userCompetitionPackText, type StructureChoice, type UserCompetitionDraft } from "./user-competitions.js";
import { TeamCrest } from "../world/TeamCrest.js";
import { PlayerPortrait, RatingBadge, RoleChip } from "../world/PlayerPortrait.js";
import { playerStrengths } from "../world/player-visuals.js";
import { generatedRunRoster, generatedSelections, tourCompetition, touringTeamId, type GeneratedSquad } from "./generated-roster.js";
import {
  AUCTION_BUDGET,
  AUCTION_SQUAD_SIZE,
  auctionSquads,
  auctionSquadsSha256,
  awaitingPlayer,
  createAuction,
  decideLot,
  maxAffordable,
  playerRating,
  replayAuction,
  reservePrice,
  type AuctionDecision,
  type AuctionState,
} from "./auction.js";
import "../career/career.css";

/**
 * Stage 15 Tournaments (owner decision 17 November 2026, answer 5a). Curated fictional competitions played match by
 * match on the authoritative engines. Runs are stored apart from every career and every match save.
 */
const worldBytes = new TextEncoder().encode(worldText);

/** sessionStorage key the match screen reads once to start the player's tournament fixture. */
export const TOURNAMENT_LAUNCH_KEY = "lcxxvi-tournament-launch";
/** `roster` is set for a tour or auctioned run: the match is played on its generated roster with these XIs. */
export type TournamentLaunch = {
  format: "T20" | "ODI";
  runId: string;
  runSeed: string;
  fixture: TournamentFixture;
  playerTeamId: string;
  roster?: { pack: StagedRosterPack; selections: ReturnType<typeof generatedSelections> };
};

/** The player's team in a run: a per-browser preference, not part of the stored run. */
const teamKey = (runId: string) => `lcxxvi-tournament-team:${runId}`;
function readPlayerTeam(runId: string): string | null {
  try {
    return localStorage.getItem(teamKey(runId));
  } catch {
    return null;
  }
}

/** Plays one fixture in the background worker (owner decision 11a). */
let workerSerial = 0;
function simulateInWorker(worker: Worker, run: TournamentRun, competition: Competition, tour: UserTour | null, squads: GeneratedSquad[] | null): Promise<TournamentResult> {
  const id = ++workerSerial;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<TournamentWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "The match could not be played."));
    };
    worker.addEventListener("message", onMessage);
    const request: TournamentWorkerRequest = { id, competition, ...(tour ? { tour } : {}), ...(squads ? { squads } : {}), runId: run.runId, runSeed: run.seed, results: run.results };
    worker.postMessage(request);
  });
}
const world = JSON.parse(worldText) as { teams: { teamId: string; name: string; colours: string[] }[]; grounds: { groundId: string; name: string }[] };
const fullWorld = JSON.parse(worldText) as WorldPack;
const playerNames = new Map(fullWorld.players.map((p) => [p.playerId, p.name]));
const teamColours = (id: string) => world.teams.find((t) => t.teamId === id)?.colours ?? [];
type TourDraft = { title: string; format: "T20" | "ODI"; hostTeamId: string; touringName: string; matches: 1 | 3 | 5 | 7; groundIds: string[] };
const EMPTY_TOUR: TourDraft = { title: "", format: "T20", hostTeamId: world.teams[0]!.teamId, touringName: "Invitation XI", matches: 3, groundIds: [] };
const EMPTY_DRAFT: UserCompetitionDraft = { title: "", format: "T20", structure: "ROUND_ROBIN", seriesMatches: 3, teamIds: [], groundIds: [] };
const teamNames = Object.fromEntries(world.teams.map((t) => [t.teamId, t.name]));
const groundNames = Object.fromEntries(world.grounds.map((g) => [g.groundId, g.name]));
/** Touring sides are not world teams; their names come from the stored tours (set on every reload). */
const touringNames = new Map<string, string>();
const teamName = (id: string) => teamNames[id] ?? touringNames.get(id) ?? id;

const STAGE_LABELS: Record<TournamentStage, string> = {
  LEAGUE: "League",
  GROUP_A: "Group A",
  GROUP_B: "Group B",
  SEMI_FINAL: "Semi-final",
  FINAL: "Final",
  SERIES: "Series",
};

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function TournamentsApp() {
  const repository = useRef(new IndexedDbSaveRepository());
  const [runs, setRuns] = useState<TournamentRun[] | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stop = useRef(false);
  const worker = useRef<Worker | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Record<string, string>>({});
  const [chosenTeam, setChosenTeam] = useState<Record<string, string>>({});
  const [userCompetitions, setUserCompetitions] = useState<UserCompetition[]>([]);
  const [draft, setDraft] = useState<UserCompetitionDraft>(EMPTY_DRAFT);
  const [notice, setNotice] = useState<string | null>(null);
  const [tours, setTours] = useState<UserTour[]>([]);
  const [auctions, setAuctions] = useState<Record<string, TournamentAuctionRecord>>({});
  const [auction, setAuction] = useState<{ competition: Competition; state: AuctionState } | null>(null);
  /** An auctioned run's squads, found by running its stored auction again; refused if they no longer match. */
  const squadsFor = (run: TournamentRun, competition: Competition): GeneratedSquad[] | null => {
    const record = auctions[run.runId];
    if (!record) return null;
    const state = replayAuction(fullWorld, competition, record.seed, record.playerTeamId, record.decisions);
    const squads = auctionSquads(fullWorld, state);
    if (auctionSquadsSha256(squads) !== record.squadsSha256 || record.competitionId !== competition.competitionId) throw new Error("This tournament's auction failed its check.");
    return squads;
  };
  const [tourDraft, setTourDraft] = useState<TourDraft>(EMPTY_TOUR);
  const tourFor = (competitionId: string): UserTour | null => tours.find((t) => t.tourId === competitionId) ?? null;
  /** A curated competition, one the player made, or the series a tour plays. */
  const findCompetition = (competitionId: string): Competition | null => {
    const tour = tourFor(competitionId);
    return competitionById(competitionId) ?? userCompetitions.find((c) => c.competitionId === competitionId) ?? (tour ? tourCompetition(tour) : null);
  };
  /** The generated roster a tour or auctioned run plays with, or null for a run between the world's own clubs. */
  const generatedRosterFor = (run: TournamentRun): { pack: StagedRosterPack; squads: GeneratedSquad[] } | null => {
    const tour = tourFor(run.competitionId);
    if (tour) return generatedRunRoster(fullWorld, { tour });
    const competition = findCompetition(run.competitionId);
    const squads = competition ? squadsFor(run, competition) : null;
    return squads ? generatedRunRoster(fullWorld, { runId: run.runId, squads }) : null;
  };
  useEffect(() => {
    worker.current = new Worker(new URL("./tournament.worker.ts", import.meta.url), { type: "module" });
    return () => worker.current?.terminate();
  }, []);

  async function reload() {
    try {
      const { runs: stored, damaged } = await repository.current.listTournamentRuns();
      setRuns(stored);
      if (damaged.length) setProblem(`${damaged.length} stored tournament${damaged.length === 1 ? " is" : "s are"} damaged and not shown.`);
      const mine = await repository.current.listUserCompetitions();
      setUserCompetitions(mine.competitions.sort((a, b) => (a.competitionId < b.competitionId ? -1 : 1)));
      const storedAuctions = await repository.current.listTournamentAuctions();
      setAuctions(Object.fromEntries(storedAuctions.auctions.map((a) => [a.runId, a])));
      // The player's team: the per-browser choice, else the team they bid for in the run's auction.
      const auctionTeams = new Map(storedAuctions.auctions.map((a) => [a.runId, a.playerTeamId]));
      setPlayerTeams(Object.fromEntries(stored.flatMap((r) => {
        const team = readPlayerTeam(r.runId) ?? auctionTeams.get(r.runId) ?? null;
        return team ? [[r.runId, team]] : [];
      })));
      if (storedAuctions.damaged.length) setProblem(`${storedAuctions.damaged.length} tournament auction${storedAuctions.damaged.length === 1 ? " is" : "s are"} damaged.`);
      const storedTours = await repository.current.listUserTours();
      storedTours.tours.forEach((t) => touringNames.set(touringTeamId(t), t.touringName));
      setTours(storedTours.tours.sort((a, b) => (a.tourId < b.tourId ? -1 : 1)));
      if (storedTours.damaged.length) setProblem(`${storedTours.damaged.length} of your tours ${storedTours.damaged.length === 1 ? "is" : "are"} damaged and not shown.`);
      if (mine.damaged.length) setProblem(`${mine.damaged.length} of your tournaments ${mine.damaged.length === 1 ? "is" : "are"} damaged and not shown.`);
    } catch {
      setRuns([]);
      setProblem("Tournament records are unavailable in this browser.");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function start(competition: Competition) {
    setBusy(true);
    setProblem(null);
    try {
      const run: TournamentRun = {
        schemaId: TOURNAMENT_RUN_SCHEMA_ID,
        runId: `run-${randomToken()}`,
        competitionId: competition.competitionId,
        competitionSha256: await sha256Text(canonicalJson(competition)),
        seed: `tour-${randomToken()}`,
        results: [],
      };
      await repository.current.saveTournamentRun(run, 0);
      const team = chosenTeam[competition.competitionId];
      if (team) {
        try { localStorage.setItem(teamKey(run.runId), team); } catch { /* preference only */ }
      }
      await reload();
      setActiveRunId(run.runId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The tournament could not start.");
    } finally {
      setBusy(false);
    }
  }

  /** Owner decision B2b: rebuild every squad by auction before one of the player's own tournaments starts. */
  function startAuction(competition: Competition) {
    setProblem(null);
    try {
      const team = chosenTeam[competition.competitionId] || null;
      setAuction({ competition, state: createAuction(fullWorld, competition, `auction-${randomToken()}`, team) });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The auction could not start.");
    }
  }

  function decide(decision: AuctionDecision) {
    if (!auction) return;
    try {
      setAuction({ ...auction, state: decideLot(fullWorld, auction.state, decision) });
    } catch (error) {
      setProblem(
        error instanceof Error && error.message === "AUCTION_BID_OVER_BUDGET"
          ? "That bid is more than you can spend: keep 1 credit for every other place still to fill."
          : error instanceof Error && error.message === "AUCTION_BID_BELOW_RESERVE"
            ? "Bid at least the reserve price."
            : "That bid is not allowed.",
      );
    }
  }

  /** Stores the finished auction and the run that plays with its squads, together. */
  async function startAuctioned() {
    if (!auction?.state.complete) return;
    setBusy(true);
    setProblem(null);
    try {
      const { competition, state } = auction;
      const run: TournamentRun = {
        schemaId: TOURNAMENT_RUN_SCHEMA_ID,
        runId: `run-${randomToken()}`,
        competitionId: competition.competitionId,
        competitionSha256: await sha256Text(canonicalJson(competition)),
        seed: `tour-${randomToken()}`,
        results: [],
      };
      await repository.current.addAuctionedTournamentRun(
        {
          schemaId: TOURNAMENT_AUCTION_SCHEMA_ID,
          runId: run.runId,
          competitionId: competition.competitionId,
          seed: state.seed,
          playerTeamId: state.playerTeamId,
          decisions: state.decisions,
          squadsSha256: auctionSquadsSha256(auctionSquads(fullWorld, state)),
        },
        run,
      );
      setAuction(null);
      await reload();
      setActiveRunId(run.runId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The tournament could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function store(current: TournamentRun, result: TournamentResult): Promise<TournamentRun> {
    const next = { ...current, results: [...current.results, result] };
    await repository.current.saveTournamentRun(next, current.results.length);
    setRuns((all) => (all ?? []).map((r) => (r.runId === next.runId ? next : r)));
    return next;
  }

  /**
   * Simulates the next fixture, or every remaining one, in the background worker. It stops before a fixture the player
   * has chosen to play, unless `includePlayer` is set for that one match.
   */
  async function play(run: TournamentRun, all: boolean, includePlayer = false) {
    const competition = findCompetition(run.competitionId);
    if (!competition || !worker.current) return;
    setBusy(true);
    setProblem(null);
    stop.current = false;
    let current = run;
    const team = playerTeams[run.runId] ?? null;
    try {
      for (let first = true; ; first = false) {
        const next = viewTournament(competition, current.results).next;
        if (!next) break;
        const mine = team !== null && (next.homeTeamId === team || next.awayTeamId === team);
        if (mine && !(includePlayer && first)) break;
        current = await store(current, await simulateInWorker(worker.current, current, competition, tourFor(current.competitionId), squadsFor(current, competition)));
        if (!all || stop.current) break;
      }
    } catch (error) {
      setProblem(
        error instanceof Error && error.message === "TOURNAMENT_RUN_STALE"
          ? "Another tab changed this tournament. Reload to continue."
          : error instanceof Error
            ? error.message
            : "The match could not be played.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Hands the player's fixture to the match screen. */
  function playYourself(run: TournamentRun, fixture: TournamentFixture) {
    const competition = findCompetition(run.competitionId);
    const team = playerTeams[run.runId];
    if (!competition || !team) return;
    let roster: TournamentLaunch["roster"];
    try {
      const generated = generatedRosterFor(run);
      if (generated) roster = { pack: generated.pack, selections: generatedSelections(fullWorld, generated.squads, fixture) };
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "This tournament's squads could not be rebuilt.");
      return;
    }
    const launch: TournamentLaunch = { format: competition.format, runId: run.runId, runSeed: run.seed, fixture, playerTeamId: team, ...(roster ? { roster } : {}) };
    try {
      sessionStorage.setItem(TOURNAMENT_LAUNCH_KEY, JSON.stringify(launch));
    } catch {
      setProblem("This browser blocked session storage, so the match cannot be handed to the match screen.");
      return;
    }
    window.location.hash = "#exhibition";
  }

  /**
   * Records the player's finished match from its save. The match is re-verified on the engine (rehydrated from its
   * events), checked against the fixture's seed, ids, teams and ground, and, for a tied knockout match, its super overs
   * are replayed.
   */
  async function recordPlayed(run: TournamentRun, fixture: TournamentFixture): Promise<string | null> {
    const competition = findCompetition(run.competitionId);
    if (!competition) return null;
    const { gameId } = tournamentMatchIdentity(run.runId, fixture.matchNumber);
    const loaded = await repository.current.load(`auto:${gameId}`);
    if (!loaded) return null;
    const generated = generatedRosterFor(run);
    let session: T20Session | ODISession;
    if (generated) {
      // A tour or auctioned run: the match must have been played on exactly the roster this run generates.
      if (!loaded.rosterPack || canonicalJson(loaded.rosterPack) !== canonicalJson(generated.pack)) return "Your saved match was played with different squads, so it cannot be recorded.";
      session =
        competition.format === "T20"
          ? (rehydrateRosterT20Session(loaded.session, loaded.rosterPack) as unknown as T20Session)
          : (rehydrateRosterODISession(loaded.session, loaded.rosterPack) as unknown as ODISession);
    } else {
      if (loaded.rosterPack) return "Your saved match was played with different squads, so it cannot be recorded.";
      session = competition.format === "T20" ? rehydrateT20Session(loaded.session, worldBytes, worldManifest) : rehydrateODISession(loaded.session, worldBytes, worldManifest);
    }
    if (session.core.phase !== "COMPLETE") return "Your match is not finished yet.";
    let superOverWinnerTeamId: string | null = null;
    // No super over between generated squads: a tied knockout goes to the higher-placed side.
    if (!generated && session.core.result?.kind === "TIE" && isKnockoutStage(fixture.stage)) {
      const record = await repository.current.loadSuperOverRecord(gameId);
      const state = record ? verifySuperOverRecord(session, record) : null;
      if (!state || state.phase !== "COMPLETE") return "Your match is tied. Play the super over on the match screen, then come back.";
      superOverWinnerTeamId = state.winnerTeamId;
    }
    const result = tournamentResultFromSession({ competition, fixture, runId: run.runId, runSeed: run.seed, session, superOverWinnerTeamId, teamName });
    await store(run, result);
    return null;
  }

  // When the Tournaments screen opens on a run whose next fixture is the player's, pick up a finished match.
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  useEffect(() => {
    const run = runs?.find((r) => r.runId === activeRunId);
    const competition = run ? findCompetition(run.competitionId) : null;
    const team = run ? playerTeams[run.runId] : null;
    if (!run || !competition || !team || busy) return;
    const next = viewTournament(competition, run.results).next;
    if (!next || (next.homeTeamId !== team && next.awayTeamId !== team)) {
      setPendingNote(null);
      return;
    }
    let live = true;
    void recordPlayed(run, next)
      .then((note) => {
        if (live) setPendingNote(note);
      })
      .catch((error) => {
        if (live) setProblem(error instanceof Error ? error.message : "Your match could not be recorded.");
      });
    return () => {
      live = false;
    };
  }, [activeRunId, runs, playerTeams, busy, userCompetitions, tours, auctions]);

  async function createUserCompetition() {
    setProblem(null);
    setNotice(null);
    try {
      const competition = buildUserCompetition(draft, `user-${randomToken()}`, world);
      await repository.current.addUserCompetition(competition);
      setDraft(EMPTY_DRAFT);
      await reload();
      setNotice(`${competition.title} is ready to start.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The tournament could not be made.");
    }
  }

  async function createTour() {
    setProblem(null);
    setNotice(null);
    try {
      const title = tourDraft.title.trim();
      const touringName = tourDraft.touringName.trim();
      if (!title) throw new Error("Give the tour a name.");
      if (!touringName) throw new Error("Give the touring side a name.");
      if (tourDraft.groundIds.length === 0) throw new Error("Choose at least one ground.");
      const tour = UserTourSchema.parse({
        tourId: `user-tour-${randomToken()}`,
        title,
        format: tourDraft.format,
        hostTeamId: tourDraft.hostTeamId,
        touringName,
        matches: tourDraft.matches,
        groundIds: tourDraft.groundIds,
      });
      await repository.current.addUserTour(tour);
      setTourDraft(EMPTY_TOUR);
      await reload();
      setNotice(`${tour.title} is ready to start.`);
    } catch (error) {
      setProblem(error instanceof Error && !error.message.startsWith("[") ? error.message : "The tour could not be arranged.");
    }
  }

  async function removeTour(tour: UserTour) {
    setProblem(null);
    try {
      await repository.current.deleteUserTour(tour.tourId);
      await reload();
    } catch (error) {
      setProblem(error instanceof Error && error.message === "USER_TOUR_IN_USE" ? "A tour with runs cannot be deleted." : "The tour could not be deleted.");
    }
  }

  async function removeUserCompetition(competition: UserCompetition) {
    setProblem(null);
    try {
      await repository.current.deleteUserCompetition(competition.competitionId);
      await reload();
    } catch (error) {
      setProblem(error instanceof Error && error.message === "USER_COMPETITION_IN_USE" ? "A tournament with runs cannot be deleted." : "The tournament could not be deleted.");
    }
  }

  function exportPack(competitions: readonly UserCompetition[]) {
    const url = URL.createObjectURL(new Blob([userCompetitionPackText(competitions)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = competitions.length === 1 ? `${competitions[0]!.competitionId}.json` : "my-tournaments.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importPack(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setProblem(null);
    setNotice(null);
    try {
      const { added, skipped } = parseUserCompetitionPack(file.size, await file.text(), world, new Set(userCompetitions.map((c) => c.competitionId)));
      for (const c of added) await repository.current.addUserCompetition(c);
      await reload();
      setNotice(`Loaded ${added.length} tournament${added.length === 1 ? "" : "s"}${skipped.length ? `; skipped ${skipped.length} you already have` : ""}.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That file could not be loaded.");
    }
  }

  const active = runs?.find((r) => r.runId === activeRunId) ?? null;
  const activeCompetition = active ? findCompetition(active.competitionId) : null;

  return (
    <main className="career-shell" data-testid="tournaments-screen">
      <header className="career-masthead">
        <div>
          <p className="eyebrow">LORD CRICKET XXVI</p>
          <h1>
            <span>Tournaments</span>
          </h1>
        </div>
        <a className="button-link" href="#career">
          Career
        </a>
        <a className="button-link" href="#scenarios">
          Scenario challenges
        </a>
        <a className="button-link" href="#exhibition">
          Exhibition matches
        </a>
      </header>
      {problem && <p role="alert">{problem}</p>}
      {auction ? (
        <AuctionPanel
          competition={auction.competition}
          state={auction.state}
          busy={busy}
          onDecide={decide}
          onStart={() => void startAuctioned()}
          onCancel={() => setAuction(null)}
        />
      ) : runs === null ? (
        <p role="status">Loading tournaments…</p>
      ) : active && activeCompetition ? (
        <TournamentRunView
          run={active}
          competition={activeCompetition}
          busy={busy}
          playerTeamId={playerTeams[active.runId] ?? null}
          auctioned={!!auctions[active.runId]}
          pendingNote={pendingNote}
          onBack={() => setActiveRunId(null)}
          onPlay={(all) => void play(active, all)}
          onSimulateMine={() => void play(active, false, true)}
          onPlayYourself={(fixture) => playYourself(active, fixture)}
          onStop={() => {
            stop.current = true;
          }}
        />
      ) : (
        <>
          <p>
            Fictional competitions played match by match on the game's engines. Each side fields its strongest XI and both
            captains are automatic. A tied semi-final or final goes to a super over. Results stay here and never touch a
            career.
          </p>
          <ol className="career-stories" aria-label="Tournaments">
            {[...TOURNAMENT_PACK.competitions, ...userCompetitions, ...tours.map(tourCompetition)].map((c) => {
              const tour = tourFor(c.competitionId);
              const mine = (runs ?? []).filter((r) => r.competitionId === c.competitionId);
              return (
                <li key={c.competitionId} className="career-panel" data-testid={`tournament-${c.competitionId}`}>
                  <h2>{c.title}</h2>
                  <p>
                    <small>
                      {c.format === "T20" ? "T20" : "One-day"}
                      {c.sourceType === "USER_AUTHORED" ? (tour ? " · a tour you arranged" : " · made by you") : ""}
                    </small>
                  </p>
                  <p>{c.summary}</p>
                  <div className="tournament-crests" aria-hidden="true">
                    {c.teamIds.map((id) => (
                      <TeamCrest key={id} teamId={id} name={teamName(id)} colours={teamColours(id)} size={30} decorative />
                    ))}
                  </div>
                  <div className="action-row tournament-start">
                    <label>
                      Your team{" "}
                      <select
                        value={chosenTeam[c.competitionId] ?? ""}
                        onChange={(event) => setChosenTeam({ ...chosenTeam, [c.competitionId]: event.currentTarget.value })}
                      >
                        <option value="">Watch only</option>
                        {c.teamIds.map((id) => (
                          <option key={id} value={id}>
                            {teamName(id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="primary" disabled={busy} onClick={() => void start(c)}>
                      Start {c.title}
                    </button>
                    {mine.map((r, index) => {
                      const outcome = viewTournament(c, r.results).outcome;
                      return (
                        <button key={r.runId} type="button" disabled={busy} onClick={() => setActiveRunId(r.runId)}>
                          Open run {index + 1} ({outcome.status === "IN_PROGRESS" ? `${r.results.length} played` : "finished"})
                        </button>
                      );
                    })}
                    {tour && (
                      <button type="button" disabled={busy || mine.length > 0} title={mine.length > 0 ? "A tour with runs cannot be deleted." : undefined} onClick={() => void removeTour(tour)}>
                        Delete {c.title}
                      </button>
                    )}
                    {c.sourceType === "USER_AUTHORED" && !tour && (
                      <>
                        <button type="button" disabled={busy} onClick={() => startAuction(c)}>
                          Start {c.title} with an auction
                        </button>
                        <button type="button" disabled={busy} onClick={() => exportPack([c])}>
                          Save {c.title} to a file
                        </button>
                        <button type="button" disabled={busy || mine.length > 0} title={mine.length > 0 ? "A tournament with runs cannot be deleted." : undefined} onClick={() => void removeUserCompetition(c)}>
                          Delete {c.title}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <UserCompetitionForm draft={draft} busy={busy} onChange={setDraft} onCreate={() => void createUserCompetition()} />
          <TourForm draft={tourDraft} busy={busy} onChange={setTourDraft} onCreate={() => void createTour()} />
          <section className="career-panel" aria-label="Share tournaments">
            <h2>Share tournaments</h2>
            <p>Save your tournaments to a file, or load a file someone shared. A loaded tournament that you already have is skipped.</p>
            <div className="action-row">
              <button type="button" disabled={busy || userCompetitions.length === 0} onClick={() => exportPack(userCompetitions)}>
                Save all my tournaments to a file
              </button>
              <label>
                Load a tournament file{" "}
                <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => void importPack(event.currentTarget)} />
              </label>
            </div>
            {notice && <p role="status">{notice}</p>}
          </section>
        </>
      )}
    </main>
  );
}

function TournamentRunView(props: {
  run: TournamentRun;
  competition: Competition;
  busy: boolean;
  playerTeamId: string | null;
  pendingNote: string | null;
  auctioned?: boolean;
  onBack: () => void;
  onPlay: (all: boolean) => void;
  onSimulateMine: () => void;
  onPlayYourself: (fixture: TournamentFixture) => void;
  onStop: () => void;
}) {
  const { run, competition, busy, playerTeamId } = props;
  const view = viewTournament(competition, run.results);
  const nextIsMine = !!view.next && playerTeamId !== null && (view.next.homeTeamId === playerTeamId || view.next.awayTeamId === playerTeamId);
  const resultFor = (fixtureId: string) => run.results.find((r) => r.fixtureId === fixtureId) ?? null;
  return (
    <section aria-labelledby="tournament-run-heading" data-testid="tournament-run">
      <h2 id="tournament-run-heading">{competition.title}</h2>
      {props.auctioned && <p>Squads were rebuilt by auction before this tournament. You can play your team's matches or simulate them; a tied knockout match goes to the higher-placed side.</p>}
      <div className="action-row">
        <button type="button" onClick={props.onBack} disabled={busy}>
          All tournaments
        </button>
        {view.next && nextIsMine && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => props.onPlayYourself(view.next!)}>
              Play this match yourself
            </button>
            <button type="button" disabled={busy} onClick={props.onSimulateMine}>
              Simulate it instead
            </button>
          </>
        )}
        {view.next && !nextIsMine && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => props.onPlay(false)}>
              Play next match
            </button>
            <button type="button" disabled={busy} onClick={() => props.onPlay(true)}>
              {playerTeamId ? "Play until your next match" : "Play all remaining"}
            </button>
            {busy && (
              <button type="button" onClick={props.onStop}>
                Stop after this match
              </button>
            )}
          </>
        )}
      </div>
      {view.outcome.status === "CHAMPION" && (
        <p role="status" data-testid="tournament-champion">
          <strong>
            {teamName(view.outcome.teamId)} win the {competition.title}. {view.outcome.how}.
          </strong>
        </p>
      )}
      {view.outcome.status === "SERIES_DRAWN" && (
        <p role="status" data-testid="tournament-champion">
          <strong>{view.outcome.how}.</strong>
        </p>
      )}
      {playerTeamId && <p>You manage {teamName(playerTeamId)}. Simulation stops before each of their matches.</p>}
      {props.pendingNote && nextIsMine && <p role="status">{props.pendingNote}</p>}
      {view.next && (
        <p data-testid="tournament-next">
          Next: match {view.next.matchNumber}, {STAGE_LABELS[view.next.stage]}, {teamName(view.next.homeTeamId)} v{" "}
          {teamName(view.next.awayTeamId)} at {groundNames[view.next.groundId] ?? view.next.groundId}.
        </p>
      )}
      {view.tables.map((table) => (
        <table key={table.stage} className="career-table" aria-label={`${STAGE_LABELS[table.stage]} table`}>
          <caption>{STAGE_LABELS[table.stage]}</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">P</th>
              <th scope="col">W</th>
              <th scope="col">L</th>
              <th scope="col">T</th>
              <th scope="col">Pts</th>
              <th scope="col">NRR</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.teamId}>
                <th scope="row">
                  <TeamCrest teamId={row.teamId} name={teamName(row.teamId)} colours={teamColours(row.teamId)} size={18} decorative />
                  {teamName(row.teamId)}
                </th>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.lost}</td>
                <td>{row.tied}</td>
                <td>{row.points}</td>
                <td>{row.netRunRate.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <h3>Fixtures and results</h3>
      <ol aria-label="Fixtures and results" data-testid="tournament-fixtures">
        {view.fixtures.map((f) => {
          const r = resultFor(f.fixtureId);
          return (
            <li key={f.fixtureId}>
              {STAGE_LABELS[f.stage]}: {teamName(f.homeTeamId)} v {teamName(f.awayTeamId)}, {groundNames[f.groundId] ?? f.groundId}.{" "}
              {r ? r.resultText : "Not played yet."}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const STRUCTURES: { value: StructureChoice; label: string }[] = [
  { value: "ROUND_ROBIN", label: "Round robin" },
  { value: "DOUBLE_ROUND_ROBIN", label: "Double round robin" },
  { value: "ROUND_ROBIN_FINAL", label: "Round robin, then a final" },
  { value: "GROUPS_KNOCKOUT", label: "Two groups, semi-finals and a final (6 to 8 teams)" },
  { value: "SERIES", label: "Series between two teams" },
];

/** Stage 15 user-authored tournaments: the form. Teams and grounds come from the fictional world only. */
function UserCompetitionForm(props: { draft: UserCompetitionDraft; busy: boolean; onChange: (draft: UserCompetitionDraft) => void; onCreate: () => void }) {
  const { draft, onChange } = props;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <section className="career-panel" aria-label="Make your own tournament">
      <h2>Make your own tournament</h2>
      <div className="action-row">
        <label>
          Name <input value={draft.title} maxLength={80} onChange={(e) => onChange({ ...draft, title: e.currentTarget.value })} />
        </label>
        <label>
          Format{" "}
          <select value={draft.format} onChange={(e) => onChange({ ...draft, format: e.currentTarget.value as "T20" | "ODI" })}>
            <option value="T20">T20</option>
            <option value="ODI">One-day</option>
          </select>
        </label>
        <label>
          Structure{" "}
          <select value={draft.structure} onChange={(e) => onChange({ ...draft, structure: e.currentTarget.value as StructureChoice })}>
            {STRUCTURES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {draft.structure === "SERIES" && (
          <label>
            Matches{" "}
            <select value={draft.seriesMatches} onChange={(e) => onChange({ ...draft, seriesMatches: Number(e.currentTarget.value) as 1 | 3 | 5 | 7 })}>
              {[1, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset>
        <legend>Teams</legend>
        {world.teams.map((t) => (
          <label key={t.teamId}>
            <input type="checkbox" checked={draft.teamIds.includes(t.teamId)} onChange={() => onChange({ ...draft, teamIds: toggle(draft.teamIds, t.teamId) })} /> {t.name}{" "}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Grounds</legend>
        {world.grounds.map((g) => (
          <label key={g.groundId}>
            <input type="checkbox" checked={draft.groundIds.includes(g.groundId)} onChange={() => onChange({ ...draft, groundIds: toggle(draft.groundIds, g.groundId) })} /> {g.name}{" "}
          </label>
        ))}
      </fieldset>
      <button type="button" className="primary" disabled={props.busy} onClick={props.onCreate}>
        Make tournament
      </button>
    </section>
  );
}

/**
 * Stage 15 tours (owner decisions A1a and A2a): a touring side, picked automatically from the other seven clubs by a
 * fixed rating rule, plays a series against one host club. Tournament only; the player can play either side.
 */
function TourForm(props: { draft: TourDraft; busy: boolean; onChange: (draft: TourDraft) => void; onCreate: () => void }) {
  const { draft, onChange } = props;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <section className="career-panel" aria-label="Arrange a tour">
      <h2>Arrange a tour</h2>
      <p>A touring side, made of the best players from the other seven clubs, plays a series against your chosen host. Pick either side as your team to play its matches yourself.</p>
      <div className="action-row">
        <label>
          Tour name <input value={draft.title} maxLength={80} onChange={(e) => onChange({ ...draft, title: e.currentTarget.value })} />
        </label>
        <label>
          Touring side <input value={draft.touringName} maxLength={40} onChange={(e) => onChange({ ...draft, touringName: e.currentTarget.value })} />
        </label>
        <label>
          Host{" "}
          <select value={draft.hostTeamId} onChange={(e) => onChange({ ...draft, hostTeamId: e.currentTarget.value })}>
            {world.teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Format{" "}
          <select value={draft.format} onChange={(e) => onChange({ ...draft, format: e.currentTarget.value as "T20" | "ODI" })}>
            <option value="T20">T20</option>
            <option value="ODI">One-day</option>
          </select>
        </label>
        <label>
          Matches{" "}
          <select value={draft.matches} onChange={(e) => onChange({ ...draft, matches: Number(e.currentTarget.value) as 1 | 3 | 5 | 7 })}>
            {[1, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Tour grounds</legend>
        {world.grounds.map((g) => (
          <label key={g.groundId}>
            <input type="checkbox" checked={draft.groundIds.includes(g.groundId)} onChange={() => onChange({ ...draft, groundIds: toggle(draft.groundIds, g.groundId) })} /> {g.name}{" "}
          </label>
        ))}
      </fieldset>
      <button type="button" className="primary" disabled={props.busy} onClick={props.onCreate}>
        Arrange tour
      </button>
    </section>
  );
}

/**
 * Stage 15 tournament auctions (owner decisions B2b, B3a and B4a). The player bids for one team (the "Your team"
 * choice; none means the AI bids for every team) by setting a maximum bid or passing on each player who comes up.
 */
function AuctionPanel(props: {
  competition: Competition;
  state: AuctionState;
  busy: boolean;
  onDecide: (decision: AuctionDecision) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { state, competition } = props;
  const lotPlayer = !state.complete ? fullWorld.players.find((p) => p.playerId === state.order[state.nextLot]) ?? null : null;
  const yours = state.playerTeamId ? state.teams.find((t) => t.teamId === state.playerTeamId)! : null;
  const deciding = !!lotPlayer && awaitingPlayer(fullWorld, state);
  const reserve = lotPlayer ? reservePrice(lotPlayer, state.format) : 0;
  const [bid, setBid] = useState<string>("");
  const roleName = (role: string) => ({ BATTER: "Batter", BOWLER: "Bowler", ALLROUNDER: "All-rounder", KEEPER: "Keeper" })[role] ?? role;
  const recent = state.lots.slice(-8).reverse();
  const strengths = lotPlayer ? playerStrengths(lotPlayer, state.format) : null;
  const lotTeamKit = lotPlayer ? (fullWorld.teams.find((t) => t.squadIds.includes(lotPlayer.playerId))?.colours ?? []) : [];
  const myPlayers = yours ? yours.squadIds.map((id) => fullWorld.players.find((p) => p.playerId === id)!).filter(Boolean) : [];
  const roleCount = (role: string) => myPlayers.filter((p) => p.role === role).length;
  const mySpend = yours ? AUCTION_BUDGET - yours.budget : 0;
  const lastLot = recent[0];
  return (
    <section className="career-panel auction-room" aria-label="Auction" data-testid="auction">
      <header className="auction-room-head">
        <p className="eyebrow">Auction room</p>
        <h2>Auction for {competition.title}</h2>
        <p>
          Every team rebuilds its squad of {AUCTION_SQUAD_SIZE} from the fictional players, best rated first. The highest maximum bid wins, paying one credit more
          than the next. Every squad must be able to field a keeper and five bowlers.
        </p>
      </header>
      <div className="auction-grid">
        <div className="auction-col auction-teams">
          <h3>Teams</h3>
          <table aria-label="Auction budgets">
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Credits left</th>
                <th scope="col">Squad</th>
              </tr>
            </thead>
            <tbody>
              {state.teams.map((t) => (
                <tr key={t.teamId} data-mine={t.teamId === state.playerTeamId ? "true" : undefined}>
                  <th scope="row">
                    <TeamCrest teamId={t.teamId} name={teamName(t.teamId)} colours={teamColours(t.teamId)} size={22} decorative />
                    {teamName(t.teamId)}
                    {t.teamId === state.playerTeamId && <span className="auction-mine-tag">Your team</span>}
                  </th>
                  <td className="auction-wallet">{t.budget}</td>
                  <td>
                    {t.squadIds.length} of {AUCTION_SQUAD_SIZE}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="auction-col auction-block">
          <h3>Current player</h3>
          {lotPlayer && strengths ? (
            <div className="auction-lot-card">
              <div className="auction-lot-top">
                <RatingBadge rating={playerRating(lotPlayer, state.format)} decorative />
                <PlayerPortrait playerId={lotPlayer.playerId} role={lotPlayer.role} kit={lotTeamKit} size={124} />
                <div className="auction-lot-stats" aria-hidden="true">
                  <span><strong>{strengths.batting}</strong>BAT</span>
                  <span><strong>{strengths.bowling || "–"}</strong>BOWL</span>
                  <span><strong>{strengths.fielding}</strong>FIELD</span>
                </div>
              </div>
              <p className="auction-lot-name">{lotPlayer.name}</p>
              <RoleChip role={lotPlayer.role} />
              <p className="auction-reserve">Reserve <strong>{reserve}</strong></p>
            </div>
          ) : (
            <p className="auction-done">{state.complete ? "Every player has gone under the hammer." : "Waiting for the next lot."}</p>
          )}
          {lastLot && (
            <p className="auction-last">
              Last lot: {playerNames.get(lastLot.playerId)}, {lastLot.winnerTeamId ? `${teamName(lastLot.winnerTeamId)} for ${lastLot.price}` : "unsold"}
            </p>
          )}
          {deciding && lotPlayer && yours && (
            <div data-testid="auction-lot" className="auction-bid">
              <h3 className="sr-only">
                {lotPlayer.name}, {roleName(lotPlayer.role)}, rated {playerRating(lotPlayer, state.format)}. Reserve {reserve}.
              </h3>
              <label className="auction-bid-field">
                Your maximum bid{" "}
                <input type="number" min={reserve} max={maxAffordable(fullWorld, yours)} value={bid} placeholder={String(reserve)} onChange={(e) => setBid(e.currentTarget.value)} />
              </label>
              <div className="action-row">
                <button type="button" className="primary auction-bid-button" disabled={props.busy} onClick={() => { props.onDecide({ kind: "BID", max: Number(bid || reserve) }); setBid(""); }}>
                  Bid
                </button>
                <button type="button" disabled={props.busy} onClick={() => props.onDecide({ kind: "PASS" })}>
                  Pass
                </button>
                <button type="button" disabled={props.busy} onClick={() => props.onDecide({ kind: "AUTO" })}>
                  Let the AI bid for me
                </button>
              </div>
              <p>You can bid up to {maxAffordable(fullWorld, yours)} on this player.</p>
            </div>
          )}
        </div>
        <div className="auction-col auction-mine">
          <h3>Your squad</h3>
          {yours ? (
            <>
              <p data-testid="auction-yours">
                You bid for {teamName(yours.teamId)}: {yours.budget} credits left, {AUCTION_SQUAD_SIZE - yours.squadIds.length} places to fill.
              </p>
              <div className="auction-purse" aria-hidden="true">
                <TeamCrest teamId={yours.teamId} name={teamName(yours.teamId)} colours={teamColours(yours.teamId)} size={40} decorative />
                <span><strong>{yours.budget}</strong>credits left</span>
                <span><strong>{mySpend}</strong>spent</span>
              </div>
              <dl className="auction-makeup">
                <dt>Batters</dt><dd>{roleCount("BATTER")}</dd>
                <dt>All-rounders</dt><dd>{roleCount("ALLROUNDER")}</dd>
                <dt>Keepers</dt><dd>{roleCount("KEEPER")}</dd>
                <dt>Bowlers</dt><dd>{roleCount("BOWLER")}</dd>
                <dt>Total</dt><dd>{myPlayers.length} of {AUCTION_SQUAD_SIZE}</dd>
              </dl>
            </>
          ) : (
            <p>The AI bids for every team.</p>
          )}
          {recent.length > 0 && (
            <>
              <h3>Latest lots</h3>
              <ul aria-label="Latest lots" className="auction-lots">
                {recent.map((l) => (
                  <li key={l.playerId}>
                    {playerNames.get(l.playerId)}: {l.winnerTeamId ? `${teamName(l.winnerTeamId)} for ${l.price}` : "unsold"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {state.complete && (
        <>
          <h3>Squads</h3>
          {state.teams.map((t) => (
            <p key={t.teamId} data-testid={`auction-squad-${t.teamId}`}>
              <strong>{teamName(t.teamId)}:</strong> {t.squadIds.map((id) => playerNames.get(id)).join(", ")}.
            </p>
          ))}
        </>
      )}
      <div className="action-row">
        {state.complete && (
          <button type="button" className="primary" disabled={props.busy} onClick={props.onStart}>
            Start {competition.title} with these squads
          </button>
        )}
        <button type="button" disabled={props.busy} onClick={props.onCancel}>
          Cancel the auction
        </button>
      </div>
    </section>
  );
}
