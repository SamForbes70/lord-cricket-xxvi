import { useEffect, useRef, useState } from "react";
import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson, TOURNAMENT_RUN_SCHEMA_ID, type CustomCompetition, type TournamentFixture, type TournamentResult, type TournamentRun, type TournamentStage } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, competitionById } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { IndexedDbSaveRepository, sha256Text } from "@lcxxvi/persistence";
import { rehydrateODISession, rehydrateT20Session, verifySuperOverRecord } from "@lcxxvi/simulation";
import { isKnockoutStage, tournamentMatchIdentity, tournamentResultFromSession } from "./runner.js";
import type { TournamentWorkerRequest, TournamentWorkerResponse } from "./tournament.worker.js";
import "../career/career.css";

/**
 * Stage 15 Tournaments (owner decision 17 November 2026, answer 5a). Curated fictional competitions played match by
 * match on the authoritative engines. Runs are stored apart from every career and every match save.
 */
const worldBytes = new TextEncoder().encode(worldText);

/** sessionStorage key the match screen reads once to start the player's tournament fixture. */
export const TOURNAMENT_LAUNCH_KEY = "lcxxvi-tournament-launch";
export type TournamentLaunch = { format: "T20" | "ODI"; runId: string; runSeed: string; fixture: TournamentFixture; playerTeamId: string };

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
function simulateInWorker(worker: Worker, run: TournamentRun): Promise<TournamentResult> {
  const id = ++workerSerial;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<TournamentWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "The match could not be played."));
    };
    worker.addEventListener("message", onMessage);
    const request: TournamentWorkerRequest = { id, competitionId: run.competitionId, runId: run.runId, runSeed: run.seed, results: run.results };
    worker.postMessage(request);
  });
}
const world = JSON.parse(worldText) as { teams: { teamId: string; name: string }[]; grounds: { groundId: string; name: string }[] };
const teamNames = Object.fromEntries(world.teams.map((t) => [t.teamId, t.name]));
const groundNames = Object.fromEntries(world.grounds.map((g) => [g.groundId, g.name]));
const teamName = (id: string) => teamNames[id] ?? id;

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
  useEffect(() => {
    worker.current = new Worker(new URL("./tournament.worker.ts", import.meta.url), { type: "module" });
    return () => worker.current?.terminate();
  }, []);

  async function reload() {
    try {
      const { runs: stored, damaged } = await repository.current.listTournamentRuns();
      setRuns(stored);
      setPlayerTeams(Object.fromEntries(stored.flatMap((r) => {
        const team = readPlayerTeam(r.runId);
        return team ? [[r.runId, team]] : [];
      })));
      if (damaged.length) setProblem(`${damaged.length} stored tournament${damaged.length === 1 ? " is" : "s are"} damaged and not shown.`);
    } catch {
      setRuns([]);
      setProblem("Tournament records are unavailable in this browser.");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function start(competition: CustomCompetition) {
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
    const competition = competitionById(run.competitionId);
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
        current = await store(current, await simulateInWorker(worker.current, current));
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
    const competition = competitionById(run.competitionId);
    const team = playerTeams[run.runId];
    if (!competition || !team) return;
    const launch: TournamentLaunch = { format: competition.format, runId: run.runId, runSeed: run.seed, fixture, playerTeamId: team };
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
    const competition = competitionById(run.competitionId);
    if (!competition) return null;
    const { gameId } = tournamentMatchIdentity(run.runId, fixture.matchNumber);
    const loaded = await repository.current.load(`auto:${gameId}`);
    if (!loaded) return null;
    const session = competition.format === "T20" ? rehydrateT20Session(loaded.session, worldBytes, worldManifest) : rehydrateODISession(loaded.session, worldBytes, worldManifest);
    if (session.core.phase !== "COMPLETE") return "Your match is not finished yet.";
    let superOverWinnerTeamId: string | null = null;
    if (session.core.result?.kind === "TIE" && isKnockoutStage(fixture.stage)) {
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
    const competition = run ? competitionById(run.competitionId) : null;
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
  }, [activeRunId, runs, playerTeams, busy]);

  const active = runs?.find((r) => r.runId === activeRunId) ?? null;
  const activeCompetition = active ? competitionById(active.competitionId) : null;

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
      {runs === null ? (
        <p role="status">Loading tournaments…</p>
      ) : active && activeCompetition ? (
        <TournamentRunView
          run={active}
          competition={activeCompetition}
          busy={busy}
          playerTeamId={playerTeams[active.runId] ?? null}
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
            {TOURNAMENT_PACK.competitions.map((c) => {
              const mine = (runs ?? []).filter((r) => r.competitionId === c.competitionId);
              return (
                <li key={c.competitionId} className="career-panel" data-testid={`tournament-${c.competitionId}`}>
                  <h2>{c.title}</h2>
                  <p>
                    <small>{c.format === "T20" ? "T20" : "One-day"}</small>
                  </p>
                  <p>{c.summary}</p>
                  <div className="action-row">
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
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </main>
  );
}

function TournamentRunView(props: {
  run: TournamentRun;
  competition: CustomCompetition;
  busy: boolean;
  playerTeamId: string | null;
  pendingNote: string | null;
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
                <th scope="row">{teamName(row.teamId)}</th>
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
