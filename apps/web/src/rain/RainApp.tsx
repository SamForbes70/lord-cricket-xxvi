import { useEffect, useRef, useState } from "react";
import type { ExhibitionRulesRecord } from "@lcxxvi/contracts";
import type { RainCommand } from "@lcxxvi/simulation";
import { IndexedDbSaveRepository } from "@lcxxvi/persistence";
import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import type { RainOpenMatch } from "./rain-runtime.js";
import type { RainWorkerRequest, RainWorkerResponse } from "./rain.worker.js";
import { TeamCrest } from "../world/TeamCrest.js";
import "../career/career.css";
import { ModeMasthead } from "../ModeMasthead.js";

/**
 * Stage 14 exhibitions with rain, player reviews or both (owner decisions A1a, A2a and B1a to B5a, 18 November 2026).
 * Opt-in, exhibitions only, kept apart from careers, tournaments and ordinary match saves. The player's side is the first
 * team chosen.
 */
const world = JSON.parse(worldText) as { teams: { teamId: string; name: string; colours: string[] }[]; grounds: { groundId: string; name: string }[] };
const teamColours = (id: string) => world.teams.find((t) => t.teamId === id)?.colours ?? [];
const teamName = (id: string) => world.teams.find((t) => t.teamId === id)?.name ?? id;

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

type WorkerCall = RainWorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;
let serial = 0;
function ask(worker: Worker, call: WorkerCall): Promise<RainOpenMatch> {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<RainWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.match) resolve(event.data.match);
      else reject(new Error(event.data.error ?? "The rain match could not continue."));
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ ...call, id } as RainWorkerRequest);
  });
}

export function RainApp() {
  const repository = useRef(new IndexedDbSaveRepository());
  const worker = useRef<Worker | null>(null);
  const [records, setRecords] = useState<ExhibitionRulesRecord[] | null>(null);
  const [match, setMatch] = useState<RainOpenMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [format, setFormat] = useState<"T20" | "ODI">("T20");
  const [yourTeam, setYourTeam] = useState(world.teams[0]!.teamId);
  const [opponent, setOpponent] = useState(world.teams[1]!.teamId);
  const [ground, setGround] = useState(world.grounds[0]!.groundId);
  const [rain, setRain] = useState(true);
  const [reviews, setReviews] = useState(false);

  useEffect(() => {
    worker.current = new Worker(new URL("./rain.worker.ts", import.meta.url), { type: "module" });
    return () => worker.current?.terminate();
  }, []);

  async function reload() {
    try {
      const { records: stored, damaged } = await repository.current.listRainMatches();
      setRecords(stored.sort((a, b) => (a.gameId < b.gameId ? 1 : -1)));
      if (damaged.length) setProblem(`${damaged.length} stored rain match${damaged.length === 1 ? " is" : "es are"} damaged and not shown.`);
    } catch {
      setRecords([]);
      setProblem("Rain match records are unavailable in this browser.");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  /** Runs one worker step and stores the new record (append-only against the record it started from). */
  async function step(call: WorkerCall, expectedCommands: number | null) {
    if (!worker.current) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = await ask(worker.current, call);
      await repository.current.saveRainMatch(next.record, expectedCommands ?? 0);
      setMatch(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The rain match could not continue.");
    } finally {
      setBusy(false);
    }
  }

  const playerTeamId = match?.record.selectedTeams[0]!.teamId ?? null;
  // The AI captain answers its own decisions as soon as they come up.
  useEffect(() => {
    if (!match || busy || !playerTeamId) return;
    const pending = match.view.pending;
    if (pending && pending.teamId !== playerTeamId) void step({ type: "AI", record: match.record, playerTeamId }, match.record.commands.length);
  }, [match, busy, playerTeamId]);

  function send(command: RainCommand) {
    if (match) void step({ type: "COMMAND", record: match.record, command }, match.record.commands.length);
  }

  async function start() {
    if (yourTeam === opponent) {
      setProblem("Choose two different teams.");
      return;
    }
    if (!rain && !reviews) {
      setProblem("Choose rain, player reviews or both.");
      return;
    }
    const token = randomToken();
    await step({ type: "START", format, gameId: `rain-${Date.now().toString(36)}-${token.slice(0, 6)}`, matchId: `rain-m-${token.slice(6)}`, seed: `rain-${token}`, groundId: ground, teamIds: [yourTeam, opponent], rules: { rain, reviews } }, null);
  }

  async function openRecord(record: ExhibitionRulesRecord) {
    if (!worker.current) return;
    setBusy(true);
    setProblem(null);
    try {
      setMatch(await ask(worker.current, { type: "OPEN", record }));
    } catch (error) {
      setProblem(error instanceof Error ? `This rain match failed its check and cannot be opened: ${error.message}` : "The rain match could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(gameId: string) {
    await repository.current.deleteRainMatch(gameId);
    await reload();
  }

  if (match) {
    const v = match.view;
    const yourTurn = v.pending && v.pending.teamId === playerTeamId;
    return (
      <main className="career-shell" aria-labelledby="rain-title">
        <ModeMasthead
          titleId="rain-title"
          eyebrow="Rain and player reviews"
          title={`${v.format === "T20" ? "T20" : "One-day"} exhibition: ${[v.rules.rain ? "rain" : null, v.rules.reviews ? "player reviews" : null].filter(Boolean).join(" and ")}`}
          back={{ label: "Back to rain matches", onClick: () => { setMatch(null); void reload(); }, disabled: busy }}
        />
        <p className="muted">Exhibition only: not part of any career or tournament. The weather is fixed by the match seed, and you only see a stoppage when it happens.</p>
        {problem && <p role="alert">{problem}</p>}
        <section aria-label="Scoreboard" data-testid="rain-scoreboard">
          <h2>{v.teams.map((t) => t.name).join(" v ")}</h2>
          {v.tossWinnerName && <p>{v.tossWinnerName} won the toss.</p>}
          {v.innings.map((i, index) => (
            <div key={index} data-testid={`rain-innings-${index}`}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <TeamCrest teamId={i.battingTeamId} name={i.battingName} colours={teamColours(i.battingTeamId)} size={22} decorative />
              <h3>{i.battingName}: {i.score} ({i.overs} of {i.allocationOvers} overs){i.target !== null ? `, target ${i.target}` : ""}</h3>
              </div>
              {v.phase !== "COMPLETE" && index === v.innings.length - 1 && (
                <p>
                  {i.batters.map((b) => `${b.name}${b.onStrike ? "*" : ""} ${b.runs} (${b.balls})`).join(", ")}
                  {i.bowler ? `. Bowling: ${i.bowler.name} ${i.bowler.figures}` : ""}
                </p>
              )}
            </div>
          ))}
          {v.parNow !== null && <p data-testid="rain-par">Par score now: {v.parNow}.</p>}
          {v.lastBall && <p aria-live="polite" data-testid="rain-last-ball">{v.lastBall}</p>}
        </section>
        {v.rules.rain && (
          <section aria-label="Rain" data-testid="rain-stoppages">
            <h2>Weather</h2>
            {v.stoppages.length ? <ul>{v.stoppages.map((s, index) => <li key={index}>{s}</li>)}</ul> : <p>No rain yet.</p>}
          </section>
        )}
        {v.reviews && (
          <section aria-label="Player reviews" data-testid="reviews">
            <h2>Player reviews</h2>
            <p data-testid="reviews-left">Reviews left this innings: {v.reviews.left.map((r) => `${r.teamName} ${r.left}`).join(", ")}.</p>
            {v.reviews.log.length ? <ul data-testid="reviews-log">{v.reviews.log.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p>No appeals yet.</p>}
          </section>
        )}
        {v.resultText && <p data-testid="rain-result"><strong>{v.resultText}</strong></p>}
        {v.phase !== "COMPLETE" && (
          <section aria-label="Your decision" data-testid="rain-controls" aria-busy={busy}>
            {yourTurn && v.pending!.decision === "TOSS" && (
              <p>
                Call the toss:{" "}
                <button type="button" disabled={busy} onClick={() => send({ kind: "CALL_TOSS", teamId: playerTeamId!, call: "HEADS" })}>Heads</button>{" "}
                <button type="button" disabled={busy} onClick={() => send({ kind: "CALL_TOSS", teamId: playerTeamId!, call: "TAILS" })}>Tails</button>
              </p>
            )}
            {yourTurn && v.pending!.decision === "INNINGS" && (
              <p>
                You won the toss:{" "}
                <button type="button" disabled={busy} onClick={() => send({ kind: "CHOOSE_INNINGS", teamId: playerTeamId!, choice: "BAT" })}>Bat first</button>{" "}
                <button type="button" disabled={busy} onClick={() => send({ kind: "CHOOSE_INNINGS", teamId: playerTeamId!, choice: "BOWL" })}>Bowl first</button>
              </p>
            )}
            {yourTurn && (v.pending!.decision === "BATTER" || v.pending!.decision === "BOWLER") && (
              <div>
                <p>{v.pending!.decision === "BATTER" ? "Send in a batter:" : "Choose the bowler for the next over:"}</p>
                <ul aria-label={v.pending!.decision === "BATTER" ? "Batters" : "Bowlers"}>
                  {v.options.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={busy}
                        data-rain-choice={o.id}
                        onClick={() => send(v.pending!.decision === "BATTER" ? { kind: "SET_BATTER", teamId: playerTeamId!, playerId: o.id } : { kind: "SET_BOWLER", teamId: playerTeamId!, playerId: o.id })}
                      >
                        {o.name}
                      </button>
                      {o.detail ? ` ${o.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {yourTurn && v.pending!.decision === "REVIEW" && v.reviews?.appeal && (
              <div data-testid="review-prompt">
                <p>{v.reviews.appeal.text}</p>
                <p>{v.reviews.appeal.feeling}</p>
                <p>
                  <button type="button" disabled={busy} onClick={() => send({ kind: "REVIEW_DECISION", teamId: playerTeamId!, review: true })}>Review</button>{" "}
                  <button type="button" disabled={busy} onClick={() => send({ kind: "REVIEW_DECISION", teamId: playerTeamId!, review: false })}>Accept the decision</button>
                </p>
              </div>
            )}
            {v.phase === "READY" && (
              <p>
                <button type="button" disabled={busy} onClick={() => send({ kind: "BOWL", scope: "BALL" })}>Next ball</button>{" "}
                <button type="button" disabled={busy} onClick={() => send({ kind: "BOWL", scope: "OVER" })}>Finish over</button>
              </p>
            )}
            {!yourTurn && v.pending && <p>{v.pending.teamName} are deciding.</p>}
            <p>
              <button type="button" disabled={busy} onClick={() => void step({ type: "SIMULATE", record: match.record }, match.record.commands.length)}>Simulate to the end</button>
            </p>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="career-shell" aria-labelledby="rain-title">
      {/* CD-027: the rain screen had no masthead and no way back. */}
      <ModeMasthead titleId="rain-title" title="Rain and player reviews" back={{ label: "Title screen", href: "#title" }} />
      <p className="muted">
        Opt-in exhibitions. With rain, the weather can stop play: overs lost shorten the innings, and the target is revised with this game&apos;s fictional resource
        table. With player reviews, umpires can get close leg-before and caught-behind decisions wrong, and each side has two unsuccessful reviews per innings. Not
        part of any career or tournament.
      </p>
      {problem && <p role="alert">{problem}</p>}
      <section aria-label="New rain match">
        <h2>New match</h2>
        <p>
          <label>Format <select value={format} onChange={(e) => setFormat(e.target.value as "T20" | "ODI")}><option value="T20">T20</option><option value="ODI">One-day</option></select></label>{" "}
          <label>Your team <select value={yourTeam} onChange={(e) => setYourTeam(e.target.value)}>{world.teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}</select></label>{" "}
          <label>Opponent <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>{world.teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}</select></label>{" "}
          <label>Ground <select value={ground} onChange={(e) => setGround(e.target.value)}>{world.grounds.map((g) => <option key={g.groundId} value={g.groundId}>{g.name}</option>)}</select></label>
        </p>
        <p>
          <label><input type="checkbox" checked={rain} onChange={(e) => setRain(e.target.checked)} /> Rain</label>{" "}
          <label><input type="checkbox" checked={reviews} onChange={(e) => setReviews(e.target.checked)} /> Player reviews (DRS)</label>
        </p>
        <p><button type="button" disabled={busy || records === null} onClick={() => void start()}>Start match</button></p>
      </section>
      <section aria-label="Saved rain matches">
        <h2>Saved matches</h2>
        {records === null ? <p>Loading.</p> : records.length === 0 ? <p>No rain matches yet.</p> : (
          <ul aria-label="Rain matches">
            {records.map((r) => (
              <li key={r.gameId} data-testid={`rain-record-${r.gameId}`}>
                {r.rulesId === "LC_T20_RAIN_01" ? "T20" : "One-day"}
                {r.schemaId === "LC_RAIN_MATCH_RECORD_V1" ? " with rain" : ` with ${[r.rain ? "rain" : null, r.reviewRulesId ? "player reviews" : null].filter(Boolean).join(" and ")}`}: {r.selectedTeams.map((t) => teamName(t.teamId)).join(" v ")} ({r.commands.length} actions){" "}
                <button type="button" disabled={busy} onClick={() => void openRecord(r)}>Open</button>{" "}
                <button type="button" disabled={busy} onClick={() => void remove(r.gameId)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
