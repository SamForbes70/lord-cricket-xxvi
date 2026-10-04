import React, { useEffect, useRef, useState } from "react";
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
} from "./match/protocol.js";
import "./styles.css";

type Body = Request extends infer R
  ? R extends Request
    ? Omit<R, "version" | "requestId" | "expectedRevision">
    : never
  : never;
const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
function App() {
  const worker = useRef<Worker | null>(null),
    serial = useRef(0),
    inflight = useRef<string | null>(null),
    currentRevision = useRef(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(true),
    [fatal, setFatal] = useState(false),
    [error, setError] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [persistence, setPersistence] = useState<PersistenceView | null>(null);
  const [scale, setScale] = useState("100"),
    [commentary, setCommentary] = useState("full"),
    [density, setDensity] = useState("comfortable");
  const decisionRef = useRef<HTMLHeadingElement>(null),
    lastPhase = useRef("");
  function send(body: Body) {
    if (inflight.current || fatal) return;
    const requestId = `ui-${++serial.current}`;
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
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    let owner =
      navigation?.type === "reload" ? sessionStorage.getItem(ownerKey) : null;
    if (!owner) {
      owner = `tab-${crypto.randomUUID()}`;
      sessionStorage.setItem(ownerKey, owner);
    }
    const w = new Worker(new URL("./match/match.worker.ts", import.meta.url), {
      type: "module",
      name: owner,
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<Response>) => {
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
      if (r.requestId !== inflight.current) return;
      inflight.current = null;
      currentRevision.current = r.revision;
      serial.current = Math.max(serial.current, 10000 + r.revision);
      setBusy(false);
      setError(r.error ?? "");
      if (r.catalog) setCatalog(r.catalog);
      setView(r.view);
      setVerification(r.verification);
      if (r.persistence) setPersistence(r.persistence);
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
      setFatal(true);
      setBusy(false);
      setError(
        "The match worker stopped. Reload to recover the last durable checkpoint.",
      );
    };
    w.onerror = failed;
    w.onmessageerror = failed;
    const id = `ui-${++serial.current}`;
    inflight.current = id;
    w.postMessage({
      version: UI_VERSION,
      requestId: id,
      expectedRevision: 0,
      type: "BOOT",
    });
    return () => w.terminate();
  }, []);
  useEffect(() => {
    if (view && lastPhase.current !== `${view.phase}:${view.decisionTeamId}`) {
      lastPhase.current = `${view.phase}:${view.decisionTeamId}`;
      decisionRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  function saveCopy() {
    if (!view) return;
    const title = `${view.teams[0]?.name ?? "Team 1"} v ${view.teams[1]?.name ?? "Team 2"} · ${new Date().toLocaleString()}`;
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
  function act(action: Action) {
    if (!view || inflight.current || fatal) return;
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
        actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${team}`,
      },
    });
  }
  useEffect(() => {
    if (error) document.querySelector<HTMLElement>("[role=alert]")?.focus();
  }, [error]);
  const ledger = view?.innings[view.activeIndex],
    i = ledger?.innings;
  const tn = (id: string) => view?.teams.find((t) => t.id === id)?.name ?? id;
  const striker =
    i?.strikerEnd === "NORTH" ? i.northBatterId : i?.southBatterId;
  return (
    <main
      style={{ fontSize: `${Number(scale) / 100}rem` }}
      className={`density-${density}`}
    >
      <a className="skip" href="#decision">
        Skip to next decision
      </a>
      <header className="masthead">
        <div>
          <p className="eyebrow">THE FICTIONAL TWENTY20 EXHIBITION</p>
          <h1>
            Lord Cricket <span>XXVI</span>
          </h1>
        </div>
        <span className="alpha">SYNTHETIC_ALPHA</span>
      </header>
      <div className="preferences">
        <label>
          Text scale{" "}
          <select
            aria-label="Text scale"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          >
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </label>
        <label>
          Commentary{" "}
          <select
            aria-label="Commentary"
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
          >
            <option value="full">Full</option>
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
        <span className="save-status" data-testid="save-status">
          {persistence?.readOnly
            ? "Read only · another tab owns this save"
            : persistence?.savedAt
              ? `Saved · ${new Date(persistence.savedAt).toLocaleTimeString()}`
              : "Local autosave ready"}
        </span>
      </div>
      {error && (
        <p className="error" role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      {persistence?.recovered && (
        <p className="recovery" role="status">
          Recovered from the previous valid checkpoint. The damaged source save
          was preserved.
        </p>
      )}
      {!view && (
        <>
          <section className="intro">
            <h2>Take the captain’s chair.</h2>
            <p>
              Select your side and an opponent. You make decisions for{" "}
              <strong>both teams</strong> in this manual exhibition. There is no
              opponent captain AI.
            </p>
          </section>
          {catalog ? (
            <Setup
              catalog={catalog}
              busy={busy || fatal}
              start={(selections, groundId) =>
                send({ type: "START", selections, groundId })
              }
            />
          ) : (
            <p role="status">Loading the approved fictional world…</p>
          )}
        </>
      )}
      {view && (
        <>
          <section
            className="scorestrip"
            aria-label="Match scoreboard"
            data-testid="scorestrip"
          >
            <div>
              <p>
                {view.ground} · T20 ·{" "}
                {i ? `Innings ${view.activeIndex + 1}` : "Pre-match"}
              </p>
              <h2>
                {i
                  ? tn(i.battingTeamId)
                  : view.teams.map((t) => t.name).join(" v ")}
              </h2>
              <strong className="score">
                {i ? `${i.runs}/${i.wickets}` : "Ready for the toss"}
              </strong>
              {i && (
                <span className="over">{overs(i.legalBalls)} / 20 overs</span>
              )}
            </div>
            <div className="target" data-testid="target">
              <span>Target</span>
              <strong>{i?.targetToWin ?? "Not set"}</strong>
              {i?.targetToWin != null && (
                <p>
                  {Math.max(0, i.targetToWin - i.runs)} needed ·{" "}
                  {Math.max(0, 120 - i.legalBalls)} balls left
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
          <section
            className="active"
            aria-label="Active players"
            data-testid="active"
          >
            <div>
              <span>Batters</span>
              {i ? (
                [i.northBatterId, i.southBatterId].map((id, n) => (
                  <p key={n}>
                    {id ? (
                      <>
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
              <p>
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
                  (i?.freeHitPending
                    ? "Free hit pending"
                    : i && i.legalBalls < 36
                      ? "Powerplay: at most 2 outside the circle"
                      : "Manual control of both teams")}
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
                {busy ? "Applying…" : "Up to date"}
              </span>
            </div>
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
                <span id="advance-reason">
                  {view.advanceReason ||
                    "Stops whenever a batter or bowler must be chosen."}
                </span>
              </div>
            </fieldset>
          </section>
          {view.phase === "READY" && (
            <Tactics
              key={`${view.revision}`}
              view={view}
              disabled={busy || fatal}
              act={act}
            />
          )}
          {view.resultText && (
            <section className="result">
              <h2>{view.resultText}</h2>
              <p>One complete fictional T20. Review both innings below.</p>
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
          <div className="details-grid">
            <section className="panel">
              <h2>Scorecard</h2>
              {view.innings.length === 0 && (
                <p>The scorecard starts with the first innings.</p>
              )}
              {view.innings.map((l, index) => (
                <article key={index}>
                  <h3>
                    {tn(l.innings.battingTeamId)} · {l.innings.runs}/
                    {l.innings.wickets} ({overs(l.innings.legalBalls)})
                  </h3>
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
            <section className="panel commentary">
              <h2>Commentary</h2>
              <p>From accepted match events only. Latest first.</p>
              {commentary === "off" ? (
                <p>Commentary hidden. Match decisions remain above.</p>
              ) : (
                <ol reversed>
                  {view.commentary
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={e.sequence} value={e.sequence}>
                        {commentary === "brief" ? e.short : e.text}
                      </li>
                    ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
      <section className="save-manager" aria-label="Save files">
        <div className="save-file-actions">
          {view && (
            <>
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
          Original world: 160 fictional players, 8 squads. Custom game rules; no
          certified ICC compliance or empirical realism. DLS, other formats,
          careers and tactical AI are unavailable.
        </p>
      </footer>
    </main>
  );
}
function Setup({
  catalog,
  busy,
  start,
}: {
  catalog: Catalog;
  busy: boolean;
  start: (teams: [Selection, Selection], ground: string) => void;
}) {
  const [teams, setTeams] = useState<[Selection, Selection]>([
    structuredClone(catalog.teams[0]!.suggested),
    structuredClone(catalog.teams[1]!.suggested),
  ]);
  const [ground, setGround] = useState(catalog.grounds[0]!.id);
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
  function update(index: number, s: Selection) {
    setTeams(
      (prev) =>
        prev.map((old, i) => (i === index ? s : old)) as [Selection, Selection],
    );
  }
  return (
    <section className="setup">
      <fieldset disabled={busy}>
        <legend>Choose teams and XIs</legend>
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
        <p>
          Suggested XIs are preselected for review. All match decisions remain
          manual.
        </p>
        <button
          className="primary"
          disabled={reasons.length > 0}
          aria-describedby="setup-reasons"
          onClick={() => start(teams, ground)}
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
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(<App />);
