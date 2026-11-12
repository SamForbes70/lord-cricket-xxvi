import React, { useEffect, useState } from "react";
import type { RosterSeasonState, SeasonSaveSummary, StagedRosterPack } from "@lcxxvi/contracts";
import { RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { IndexedDbSeasonRepository, createRosterSeasonPortableArchive, readRosterSeasonPortableArchive } from "@lcxxvi/persistence";
import { createStagedRosterPack } from "@lcxxvi/simulation";
import { changeRosterSeasonTraining, completeRosterManagedFixture, createRosterSeason, hasAcceptedRosterManagedFixture, prepareRosterManagedFixture, simulateNextRosterSeasonFixture, validateRosterSeasonState } from "./roster-season.js";
import { careerWorld, type CareerUserMatchLaunch } from "./service.js";
import { managedMatchGameId } from "./managed-game-id.js";
import { managedBindings, recordManagedLaunch, settleManagedMatches } from "./managed-match.js";
import "./career.css";

const repo = new IndexedDbSeasonRepository();
const owner = sessionStorage.getItem("lcxxvi-roster-career-owner") ?? `roster-career-${crypto.randomUUID()}`;
sessionStorage.setItem("lcxxvi-roster-career-owner", owner);
const launchKey = "lcxxvi-career-match-launch";
const resultKey = "lcxxvi-roster-career-match-result";
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
type OpenCareer = { saveId: string; state: RosterSeasonState; pack: StagedRosterPack; recovered: boolean };

export function RosterCareerApp({ inspectionOnly = false }: { inspectionOnly?: boolean } = {}) {
  const [pack, setPack] = useState<StagedRosterPack | null>(null);
  const [teamId, setTeamId] = useState("");
  const [copyName, setCopyName] = useState("");
  const [active, setActive] = useState<OpenCareer | null>(null);
  const [saves, setSaves] = useState<SeasonSaveSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRound, setPendingRound] = useState<number | null>(null);
  const awaitedState = React.useRef<RosterSeasonState | null>(null);
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem("lcxxvi-career-scale");
    return saved && ["90", "100", "115", "125", "150"].includes(saved) ? saved : "100";
  });
  async function refresh() { setSaves(await repo.listRoster()); }
  async function run(work: () => Promise<void>, startup = false) {
    if (inspectionOnly && !startup) { setError("Return to the active match before changing the career."); return; }
    setBusy(true); setError("");
    try { await work(); await refresh(); }
    catch (reason) { setError(reason instanceof Error && reason.name !== "ZodError" ? reason.message : "The file or career is invalid."); }
    finally { setBusy(false); }
  }
  async function open(saveId: string): Promise<OpenCareer> {
    const loaded = await repo.loadRoster(saveId);
    if (!loaded) throw new Error("Career save not found.");
    awaitedState.current = validateRosterSeasonState(loaded.state, loaded.rosterPack);
    return { saveId, state: validateRosterSeasonState(loaded.state, loaded.rosterPack), pack: loaded.rosterPack, recovered: loaded.recovered };
  }
  async function save(current: OpenCareer | null, state: RosterSeasonState, rosterPack: StagedRosterPack, kind: "AUTO" | "IMPORTED" = "AUTO"): Promise<OpenCareer> {
    const saveId = current?.saveId ?? id("roster-career"), now = Date.now();
    if (current?.recovered) throw new Error("Create a copy of the recovered career before continuing.");
    if (!await repo.acquireLease(saveId, owner, now)) throw new Error("This career is open in another tab.");
    const command = current ? { commandId: id("career-command"), requestCanonical: "{}", responseJson: "{}", committedRevision: state.revision } : null;
    await repo.commitRoster({ saveId, kind, title: `Roster career: ${rosterPack.world.teams.find(t => t.teamId === state.controlledTeamId)?.name ?? state.controlledTeamId}`,
      expectedRevision: current?.state.revision ?? null, state, rosterPack, command, ownerId: owner, now, updatedAt: new Date().toISOString() });
    awaitedState.current = state;
    return { saveId, state, pack: rosterPack, recovered: false };
  }
  /** Applies a completed roster match to its career. A completion already accepted with the same result is a no-op. */
  async function applyRosterResult(launch: CareerUserMatchLaunch, result: unknown): Promise<void> {
    if (launch.launchVersion !== "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER") throw new Error("The pending match is not a roster career fixture.");
    const current = await open(launch.saveId);
    if (current.state.stateSha256 !== launch.careerStateSha256) {
      if (!current.state.outcomes.some(outcome => "version" in outcome && outcome.completion.fixtureId === launch.fixtureId && outcome.completion.matchId === launch.matchId) || !hasAcceptedRosterManagedFixture(current.state, current.pack, result)) throw new Error("The career changed after the match started. Its result has been retained.");
      setActive(current);
    } else {
      const state = completeRosterManagedFixture(current.state, current.pack, result);
      setActive(await save(current, state, current.pack));
    }
  }
  function clearLaunchCache() {
    try { sessionStorage.removeItem(resultKey); sessionStorage.removeItem(launchKey); } catch { /* storage unavailable */ }
  }
  async function settleCareer(careerSaveId: string) {
    const settle = () => settleManagedMatches({
      careerSaveId,
      careerKind: "ROSTER",
      isFixtureCompleted: (fixtureId) => { const state = awaitedState.current; return state ? state.outcomes.some(outcome => "version" in outcome && outcome.completion.fixtureId === fixtureId) : false; },
      apply: async ({ launch, result }) => {
        if (!result.rosterCareerSession) throw new Error("The completed match produced no roster result.");
        await applyRosterResult(launch as CareerUserMatchLaunch, result.rosterCareerSession);
      },
    });
    let settled = await settle();
    // The closed tab's writer lease can last up to 12 s. Retry for a bounded time instead of failing.
    for (let attempt = 0; attempt < 5 && settled.errors.some(message => /open in another tab/.test(message)); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      settled = await settle();
    }
    if (settled.applied.length) clearLaunchCache();
    if (settled.errors.length) setError(settled.errors.join(" "));
    setPendingRound(settled.pending.length ? ((settled.pending[0]!.launch as { roundNumber?: number }).roundNumber ?? null) : null);
  }
  useEffect(() => {
    void run(async () => {
      const saveId = await repo.activeRosterSaveId();
      if (saveId) setActive(await open(saveId));
      if (!inspectionOnly && saveId) {
        // Durable path first: a completed pending match is applied from its saved checkpoint and binding.
        await settleCareer(saveId);
      }
      // Legacy in-session handoff for launches that predate bindings. A repeat of an accepted result is a no-op.
      let pending: string | null = null, rawLaunch: string | null = null;
      try { pending = sessionStorage.getItem(resultKey); rawLaunch = sessionStorage.getItem(launchKey); } catch { /* storage unavailable */ }
      if (pending && rawLaunch && !inspectionOnly) {
        const launch = JSON.parse(rawLaunch) as CareerUserMatchLaunch;
        await applyRosterResult(launch, JSON.parse(pending));
        clearLaunchCache();
        try { await managedBindings.resolve(launch.matchGameId, "APPLIED", "RESULT_APPLIED"); } catch { /* no binding for legacy launches */ }
      }
    }, true);
  }, []);
  async function recoverCareer() {
    if (!active || !active.recovered) return;
    const oldSaveId = active.saveId;
    const copied = await save(null, active.state, active.pack);
    await managedBindings.rekeyCareer(oldSaveId, copied.saveId);
    setActive(copied);
    await settleCareer(copied.saveId);
  }
  async function copyCareer() {
    if (!active || active.recovered) throw new Error("Open an intact career before creating a copy.");
    const title = copyName.trim();
    if (!title || title.length > 120) throw new Error("Enter a copy name of 1 to 120 characters.");
    const now = Date.now(), copyId = id("roster-career-copy");
    if (!await repo.acquireLease(active.saveId, owner, now)) throw new Error("This career is open in another tab.");
    if (!await repo.acquireLease(copyId, owner, now)) throw new Error("The copy slot is locked.");
    try {
      await repo.commitRoster({ saveId: copyId, kind: "MANUAL", title, expectedRevision: null, state: active.state, rosterPack: active.pack,
        command: null, ownerId: owner, now, updatedAt: new Date().toISOString(), setActive: false,
        copySource: { saveId: active.saveId, revision: active.state.revision, stateSha256: active.state.stateSha256, now: () => Date.now() } });
    } finally { await repo.releaseLease(copyId, owner); }
    setCopyName("");
  }
  async function play() {
    if (!active) return;
    let current = active;
    while (current.state.phase === "ACTIVE") {
      const fixture = current.state.schedule.fixtures[current.state.outcomes.length]!;
      if ([fixture.homeTeamId, fixture.awayTeamId].includes(current.state.controlledTeamId)) break;
      current = await save(current, simulateNextRosterSeasonFixture(current.state, current.pack), current.pack);
      setActive(current);
    }
    if (current.state.phase === "COMPLETE") return;
    const ready = prepareRosterManagedFixture(current.state, current.pack), fixture = ready.fixture;
    const launch: CareerUserMatchLaunch = { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER", rosterPack: current.pack,
      saveId: current.saveId, seasonId: current.state.schedule.request.seasonId, scheduleSha256: current.state.schedule.scheduleSha256,
      fixtureId: fixture.fixtureId, fixtureOrdinal: fixture.ordinal, roundNumber: fixture.roundNumber, matchDayDate: fixture.matchDayDate,
      homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, groundId: fixture.groundId, matchId: fixture.matchId,
      matchGameId: managedMatchGameId(current.saveId, fixture.fixtureId), matchSeed: fixture.matchSeed, selections: [...ready.selections],
      careerStateSha256: current.state.stateSha256, managedTeamId: current.state.controlledTeamId };
    // Persist the link before launching so it survives a closed tab or browser.
    const recorded = await recordManagedLaunch(launch) as CareerUserMatchLaunch;
    sessionStorage.setItem(launchKey, JSON.stringify(recorded)); window.location.hash = "#exhibition";
  }
  return <main className="career-shell" style={{ fontSize: `${Number(scale) / 100}rem` }}>
    {inspectionOnly && <p role="status">Career inspection only. <a href="#exhibition">Return to match</a> before changing the career.</p>}
    <header className="career-masthead"><div><p className="eyebrow">LORD CRICKET XXVI</p><h1>Imported roster career</h1></div><a href="#career">Standard career</a></header>
    <p>One fictional T20 season. Missing ratings use the synthetic prior of 50. New roster packs can be up to 8 MiB; complete archives can be up to 20 MiB.</p>
    <label>Text scale <select value={scale} onChange={event => { setScale(event.target.value); localStorage.setItem("lcxxvi-career-scale", event.target.value); }}><option value="90">90%</option><option value="100">100%</option><option value="115">115%</option><option value="125">125%</option><option value="150">150%</option></select></label>
    {error && <p role="alert" className="career-error">{error}</p>}
    <section className="career-panel"><h2>Import roster</h2><label>Roster JSON <input type="file" accept=".json,application/json" disabled={busy || inspectionOnly} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void run(async () => { const next = createStagedRosterPack(await file.text(), RULE_MANIFESTS.map(rule => rule.rulesId), SYNTHETIC_ALPHA_PACK.manifest.variationIds); setPack(next); setTeamId(next.world.teams[0]?.teamId ?? ""); }); }} /></label>
      <button type="button" onClick={() => { const players = careerWorld.players.map(player => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance"))); const blob = new Blob([JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "my-roster", world: { ...careerWorld, players } }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "lord-cricket-roster-template.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }}>Download roster template</button>
      {pack && <><label>Team <select value={teamId} onChange={event => setTeamId(event.target.value)}>{pack.world.teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</select></label><button disabled={busy || inspectionOnly} onClick={() => void run(async () => { const state = createRosterSeason(pack, { careerId: id("career"), controlledTeamId: teamId, seasonId: id("season"), gameId: id("game"), seasonSeed: id("seed"), startDate: new Date().toISOString().slice(0, 10) }); setPendingRound(null); setActive(await save(null, state, pack)); })}>Start roster career</button></>}
    </section>
    <section className="career-panel"><h2>Saved roster careers</h2>{saves.map(item => <button key={item.saveId} disabled={busy || inspectionOnly} onClick={() => void run(async () => { const opened = await open(item.saveId); setActive(opened); if (!opened.recovered) await settleCareer(opened.saveId); else setPendingRound(null); })}>{item.title} · {item.completedFixtures}/56</button>)}
      <label>Import career archive <input type="file" accept=".lcxxvi,application/zip" disabled={busy || inspectionOnly} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void run(async () => { const parsed = await readRosterSeasonPortableArchive(new Uint8Array(await file.arrayBuffer())); const state = validateRosterSeasonState(parsed.state, parsed.rosterPack); setPendingRound(null); setActive(await save(null, state, parsed.rosterPack, "IMPORTED")); }); }} /></label>
    </section>
    {active && <section className="career-panel"><h2>{active.pack.world.teams.find(team => team.teamId === active.state.controlledTeamId)?.name}</h2><p>{active.state.outcomes.length}/56 fixtures · {active.state.phase} · {active.state.careerState.currentDate}</p>
      {active.recovered && <p role="status">An older checkpoint was recovered. Create a copy to continue.</p>}
      {active.recovered && <button disabled={busy || inspectionOnly} onClick={() => void run(recoverCareer)}>Create recovered copy</button>}
      <label>Copy name <input value={copyName} maxLength={120} disabled={inspectionOnly} onChange={event => setCopyName(event.currentTarget.value)} /></label>
      <button disabled={busy || inspectionOnly || active.recovered || !copyName.trim()} onClick={() => void run(copyCareer)}>Save career copy</button>
      {pendingRound !== null && <p role="status" data-testid="pending-career-match">A match for round {pendingRound} is already in progress. Play next managed match resumes it.</p>}
      <button disabled={busy || inspectionOnly || active.recovered || active.state.phase === "COMPLETE"} onClick={() => void run(play)}>Play next managed match</button>
      <button disabled={busy || inspectionOnly || active.recovered || active.state.phase === "COMPLETE"} onClick={() => void run(async () => setActive(await save(active, simulateNextRosterSeasonFixture(active.state, active.pack), active.pack)))}>Simulate next fixture</button>
      <button disabled={busy || inspectionOnly} onClick={() => void run(async () => { const loaded = await repo.loadRoster(active.saveId); if (!loaded) throw new Error("Career save not found."); const bytes = await createRosterSeasonPortableArchive(active.state, active.pack, loaded.summary, new Date().toISOString()); const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "lord-cricket-roster-career.lcxxvi"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); })}>Export career</button>
      <h3>League table</h3><ol>{active.state.projection.table.map(row => <li key={row.teamId}>{active.pack.world.teams.find(team => team.teamId === row.teamId)?.name}: {row.points} points, {row.played} played</li>)}</ol>
      <h3>Fixtures</h3><ol>{active.state.schedule.fixtures.filter(fixture => [fixture.homeTeamId, fixture.awayTeamId].includes(active.state.controlledTeamId)).map(fixture => <li key={fixture.fixtureId}>Round {fixture.roundNumber}, {fixture.matchDayDate}: {active.pack.world.teams.find(team => team.teamId === fixture.homeTeamId)?.name} v {active.pack.world.teams.find(team => team.teamId === fixture.awayTeamId)?.name} · {active.state.projection.appliedMatches.some(match => match.fixtureId === fixture.fixtureId) ? "Complete" : "Scheduled"}</li>)}</ol>
      <h3>Player statistics</h3>{active.state.projection.players.length ? <ul>{active.state.projection.players.filter(player => player.teamId === active.state.controlledTeamId).map(player => <li key={player.playerId}>{active.pack.world.players.find(item => item.playerId === player.playerId)?.name}: {player.runs} runs, {player.bowlingWickets} wickets in {player.matches} matches</li>)}</ul> : <p>Statistics appear after a match is complete.</p>}
      <h3>Squad training</h3>{active.pack.world.players.filter(player => active.pack.world.teams.find(team => team.teamId === active.state.controlledTeamId)?.squadIds.includes(player.playerId)).map(player => {
        const assignment = active.state.careerState.trainingAssignments.find(item => item.playerId === player.playerId)!;
        return <label key={player.playerId}>{player.name} <select aria-label={`${player.name} training`} value={assignment.directive} disabled={busy || inspectionOnly || active.recovered || active.state.phase === "COMPLETE"} onChange={event => { const directive = event.target.value; void run(async () => { const state = changeRosterSeasonTraining(active.state, active.pack, { command: "SET_TRAINING_DIRECTIVE", playerId: player.playerId, directive, effectiveDate: active.state.careerState.currentDate, expectedRevision: active.state.careerState.revision }); if (state.revision !== active.state.revision) setActive(await save(active, state, active.pack)); }); }}><option value="REST">Rest</option><option value="BATTING_PRACTICE">Batting practice</option><option value="BOWLING_PRACTICE">Bowling practice</option><option value="FIELDING_PRACTICE">Fielding practice</option></select></label>;
      })}
    </section>}
  </main>;
}
