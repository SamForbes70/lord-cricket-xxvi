/**
 * Captain V5: replay compatibility (docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md, "Compatibility").
 *
 * The tactical captain's choices reach a match only as commands (SET_BOWLER, SET_BATTING_PLAN, SET_BOWLING_PLAN), and
 * a saved match is rebuilt from its commands (rehydrateT20Session), never by asking the captain again. This script
 * shows it on saved matches:
 *
 *   generate <out.json>   run at an OLD revision (captain V3 or V4): plays three corpus seeds with the batch tactical
 *                         captain and with each computer-opponent mode, and saves each session as the game stores it
 *                         (the session object, JSON). Also saves one opponent match stopped part-way (in progress).
 *   check <in.json>       run at THIS revision: rehydrates every saved session and requires identical revision, events,
 *                         state and hash chain; plays each saved in-progress match on to the end under the current
 *                         captain; and replays each finished match's setup live under the current captain, reporting
 *                         whether the live result differs (it should, where the captain's choices changed).
 *
 *   node --import tsx scripts/pavilion-captain-v5-replay-check.ts generate|check <file.json>
 *
 * Read-only for the game: nothing is persisted except the named file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createT20Session, executeT20Command, fixtureAutopilotStep, rehydrateT20Session, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import { runTacticalT20 } from "../apps/batch/src/tactical-match.js";
import { proposeOpponentT20Command } from "../apps/web/src/match/ai-opponent.js";

const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const [mode, file] = process.argv.slice(2);
const SEEDS = ["v5-replay-1", "v5-replay-2", "v5-replay-3"];
const MODES = [["opponent-default", false, false], ["opponent-club-style", false, true], ["opponent-match-aware", true, true]] as const;

function setupFor(seed: string) {
  const request = structuredClone(template);
  request.setup.seed = seed;
  return validateT20MatchSetup(request, worldBytes, manifest);
}
/** Both sides on the computer opponent; the ball is advanced by the autopilot, as the person would. */
function playOpponent(session: T20Session, matchAware: boolean, clubStyle: boolean, stopAt: [number, number] | null = null): T20Session {
  const stop = (s: T20Session) => stopAt !== null && s.core.activeInningsIndex === stopAt[0] && (s.core.innings[stopAt[0]]?.innings.legalBalls ?? 0) >= stopAt[1];
  while (session.core.phase !== "COMPLETE" && !stop(session)) {
    if (session.revision >= 900) throw new Error("OPPONENT_STALLED");
    const proposed = session.setup.teams.map((t) => proposeOpponentT20Command(session, t.teamId, undefined, matchAware, clubStyle)).find((c) => c !== null);
    session = executeT20Command(session, proposed ?? fixtureAutopilotStep(session)).session;
  }
  return session;
}
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

if (mode === "generate") {
  const failedAtOldRevision: string[] = [];
  const saved: { id: string; kind: string; seed: string; matchAware?: boolean; clubStyle?: boolean; complete: boolean; session: unknown }[] = [];
  for (const seed of SEEDS) {
    saved.push({ id: `batch-${seed}`, kind: "batch", seed, complete: true, session: JSON.parse(JSON.stringify(runTacticalT20(setupFor(seed)))) });
    for (const [name, matchAware, clubStyle] of MODES) {
      try {
        const s = playOpponent(createT20Session(setupFor(seed)), matchAware, clubStyle);
        saved.push({ id: `${name}-${seed}`, kind: "opponent", seed, matchAware, clubStyle, complete: true, session: JSON.parse(JSON.stringify(s)) });
      } catch (e) {
        // Captain V3's revision has a known opponent defect (a second bowling-plan change in one over), fixed with V4.
        failedAtOldRevision.push(`${name}-${seed}: ${String(e).replace(/\s+/g, " ").slice(0, 200)}`);
      }
    }
  }
  // In progress (default opponent mode): saved at over 11 of the first innings and over 17 of the second (the death).
  for (const stopAt of [[0, 60], [1, 96]] as [number, number][]) {
    const s = playOpponent(createT20Session(setupFor(SEEDS[0]!)), false, false, stopAt);
    saved.push({ id: `in-progress-innings${stopAt[0] + 1}-ball${stopAt[1]}`, kind: "opponent", seed: SEEDS[0]!, matchAware: false, clubStyle: false, complete: s.core.phase === "COMPLETE", session: JSON.parse(JSON.stringify(s)) });
  }
  writeFileSync(file!, JSON.stringify({ version: "LC_PAVILION_CAPTAIN_V5_REPLAY_FIXTURE_V1", saved, failedAtOldRevision }));
  console.error(`could not play at this revision: ${JSON.stringify(failedAtOldRevision)}`);
  console.error(`saved ${saved.length} sessions`);
} else if (mode === "check") {
  const { saved } = JSON.parse(readFileSync(file!, "utf8")) as { saved: { id: string; kind: string; seed: string; matchAware?: boolean; clubStyle?: boolean; complete: boolean; session: T20Session }[] };
  const rows = [];
  let failures = 0;
  for (const entry of saved) {
    const stored = entry.session;
    let replayIdentical = false, error: string | null = null;
    try {
      const rebuilt = rehydrateT20Session(stored, worldBytes, manifest); // asserts revision, events, core, receipts, manifest and chain
      replayIdentical = rebuilt.lastEventHash === stored.lastEventHash && sha(rebuilt.events) === sha(stored.events) && sha(rebuilt.commands) === sha(stored.commands);
      if (!entry.complete) {
        const finished = playOpponent(rebuilt, entry.matchAware!, entry.clubStyle!);
        if (finished.core.phase !== "COMPLETE") throw new Error("NOT_FINISHED");
        if (sha(finished.commands.slice(0, stored.commands.length)) !== sha(stored.commands)) throw new Error("RECORDED_COMMANDS_CHANGED");
      }
    } catch (e) { error = String(e); }
    let liveDiffers: boolean | null = null;
    if (entry.complete) {
      const live = entry.kind === "batch" ? runTacticalT20(setupFor(entry.seed)) : playOpponent(createT20Session(setupFor(entry.seed)), entry.matchAware!, entry.clubStyle!);
      liveDiffers = live.lastEventHash !== stored.lastEventHash;
    }
    if (!replayIdentical || error) failures += 1;
    rows.push({ id: entry.id, revision: stored.revision, complete: entry.complete, replayIdentical, error, liveUnderCurrentCaptainDiffers: liveDiffers, storedLastEventHash: stored.lastEventHash });
  }
  console.log(JSON.stringify({ failures, rows }, null, 2));
  if (failures) process.exit(1);
} else throw new Error("usage: pavilion-captain-v5-replay-check.ts generate|check <file.json>");
