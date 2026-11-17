import { useEffect, useRef, useState } from "react";
import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { canonicalJson, TOURNAMENT_RUN_SCHEMA_ID, type CustomCompetition, type TournamentRun, type TournamentStage } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, competitionById } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { IndexedDbSaveRepository, sha256Text } from "@lcxxvi/persistence";
import { playTournamentFixture } from "./runner.js";
import "../career/career.css";

/**
 * Stage 15 Tournaments (owner decision 17 November 2026, answer 5a). Curated fictional competitions played match by
 * match on the authoritative engines. Runs are stored apart from every career and every match save.
 */
const worldBytes = new TextEncoder().encode(worldText);
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

  async function reload() {
    try {
      const { runs: stored, damaged } = await repository.current.listTournamentRuns();
      setRuns(stored);
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
      await reload();
      setActiveRunId(run.runId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The tournament could not start.");
    } finally {
      setBusy(false);
    }
  }

  /** Plays the next fixture, or every remaining one, yielding to the page between matches. */
  async function play(run: TournamentRun, all: boolean) {
    const competition = competitionById(run.competitionId);
    if (!competition) return;
    setBusy(true);
    setProblem(null);
    stop.current = false;
    let current = run;
    try {
      for (;;) {
        const view = viewTournament(competition, current.results);
        if (!view.next) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = playTournamentFixture({
          competition,
          fixture: view.next,
          runId: current.runId,
          runSeed: current.seed,
          worldBytes,
          worldManifest,
          teamName,
        });
        const next = { ...current, results: [...current.results, result] };
        await repository.current.saveTournamentRun(next, current.results.length);
        current = next;
        setRuns((all) => (all ?? []).map((r) => (r.runId === current.runId ? current : r)));
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
          onBack={() => setActiveRunId(null)}
          onPlay={(all) => void play(active, all)}
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
  onBack: () => void;
  onPlay: (all: boolean) => void;
  onStop: () => void;
}) {
  const { run, competition, busy } = props;
  const view = viewTournament(competition, run.results);
  const resultFor = (fixtureId: string) => run.results.find((r) => r.fixtureId === fixtureId) ?? null;
  return (
    <section aria-labelledby="tournament-run-heading" data-testid="tournament-run">
      <h2 id="tournament-run-heading">{competition.title}</h2>
      <div className="action-row">
        <button type="button" onClick={props.onBack} disabled={busy}>
          All tournaments
        </button>
        {view.next && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => props.onPlay(false)}>
              Play next match
            </button>
            <button type="button" disabled={busy} onClick={() => props.onPlay(true)}>
              Play all remaining
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
