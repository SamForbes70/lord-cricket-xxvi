/**
 * Project Pavilion P04: why the T20 model scores what it does. Read-only measurement, no change to any model.
 *
 * Replays the frozen 100-seed Pass 07B corpus under four set-ups and reports first-innings scoring, and the runs
 * that innings went on to add from the start of over 11 by wickets lost:
 *   corpus    the corpus XI (keeper, first six bowlers, then squad order) with the fixture autopilot, as frozen;
 *   balanced  keeper, four best batters, three all-rounders, three best bowlers, batting in batting-skill order;
 *   and each of those with the existing tactical captain (apps/batch tacticalT20Step) making both sides' choices.
 * Also reports the per-legal-ball outcome mix by phase for the frozen corpus.
 *
 *   node --import tsx scripts/pavilion-p04-counterfactuals.ts [output.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep, validateT20MatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import { tacticalT20Step } from "../apps/batch/src/tactical-match.js";

type Skills = { timing: number; power: number; defence: number; rotation: number; control: number; movement: number };
type WorldPlayer = { playerId: string; role: string; bowlingStyle: string | null; skills: { T20: Skills } };
type Selection = { teamId: string; playerIds: string[]; captainId: string; keeperId: string };
type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; boundary: string; dismissal: unknown; extras: Record<string, number> };

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as { players: WorldPlayer[]; teams: { teamId: string; squadIds: string[] }[] };
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const batting = (p: WorldPlayer) => p.skills.T20.timing + p.skills.T20.power + p.skills.T20.defence + p.skills.T20.rotation;
const bowling = (p: WorldPlayer) => p.skills.T20.control + p.skills.T20.movement;
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function balancedXI(teamId: string): Selection {
  const squad = world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!);
  const top = (role: string, n: number, score: (p: WorldPlayer) => number, extra: (p: WorldPlayer) => boolean = () => true) =>
    squad.filter((p) => p.role === role && extra(p)).sort((a, b) => score(b) - score(a) || order(a.playerId, b.playerId)).slice(0, n);
  const keeper = top("KEEPER", 1, batting)[0]!;
  const xi = [keeper, ...top("BATTER", 4, batting), ...squad.filter((p) => p.role === "ALLROUNDER").slice(0, 3), ...top("BOWLER", 3, bowling, (p) => Boolean(p.bowlingStyle))]
    .sort((a, b) => batting(b) - batting(a) || order(a.playerId, b.playerId));
  return { teamId, playerIds: xi.map((p) => p.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
}

type Result = { setUp: string; runs: number; runsPerOver: number; wickets: number; allOutPercent: number; fromOver11ByWicketsDown: Record<string, { innings: number; meanRuns: number }> };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const band = (w: number) => (w <= 1 ? "0-1" : w <= 3 ? "2-3" : w <= 5 ? "4-5" : "6+");
const phaseMix: Record<string, Record<string, number>> = {};

function run(xi: "corpus" | "balanced", captain: boolean): Result {
  const runs: number[] = [], wickets: number[] = [], rest: Record<string, number[]> = {};
  let legal = 0, allOut = 0;
  for (const raw of corpus.cases) {
    const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: Selection[] };
    if (xi === "balanced") request.selectedTeams = request.selectedTeams.map((s) => balancedXI(s.teamId));
    let session: T20Session = createT20Session(validateT20MatchSetup(request, bytes, manifest));
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 2000) throw new Error("NO_PROGRESS");
      session = executeT20Command(session, captain ? tacticalT20Step(session) : fixtureAutopilotStep(session)).session;
    }
    let r = 0, w = 0, balls = 0, at60: [number, number] | null = null;
    for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex !== 0) continue;
      const extras = Object.values(e.extras).reduce((a, b) => a + b, 0);
      r += e.batRuns + extras;
      if (e.dismissal) w += 1;
      if (e.legalBall) {
        if (xi === "corpus" && !captain) {
          const phase = balls < 36 ? "powerplay" : balls < 90 ? "middle" : "death";
          const kind = e.dismissal ? "wicket" : e.boundary === "SIX" ? "six" : e.boundary === "FOUR" ? "four" : e.batRuns > 0 ? `${e.batRuns}` : extras > 0 ? "byes" : "dot";
          for (const key of [phase, "all"]) { const m = (phaseMix[key] ??= {}); m[kind] = (m[kind] ?? 0) + 1; m.balls = (m.balls ?? 0) + 1; }
        }
        balls += 1;
        if (balls === 60) at60 = [r, w];
      }
    }
    runs.push(r); wickets.push(w); legal += balls; if (w === 10) allOut += 1;
    if (at60) (rest[band(at60[1])] ??= []).push(r - at60[0]);
  }
  return {
    setUp: `${xi} XI, ${captain ? "tactical captain" : "fixture autopilot"}`,
    runs: +mean(runs).toFixed(1), runsPerOver: +((runs.reduce((a, b) => a + b, 0) / legal) * 6).toFixed(2),
    wickets: +mean(wickets).toFixed(2), allOutPercent: allOut,
    fromOver11ByWicketsDown: Object.fromEntries(Object.entries(rest).sort().map(([k, v]) => [k, { innings: v.length, meanRuns: +mean(v).toFixed(1) }])),
  };
}

const results = [run("corpus", false), run("corpus", true), run("balanced", false), run("balanced", true)];
const outcomeMixPercent = Object.fromEntries(Object.entries(phaseMix).map(([phase, m]) =>
  [phase, Object.fromEntries(Object.entries(m).filter(([k]) => k !== "balls").sort().map(([k, v]) => [k, +((100 * v) / m.balls!).toFixed(1)]))]));
const output = { version: "LC_PAVILION_P04_COUNTERFACTUALS_V1", model: "synthetic-alpha-01", innings: "first innings of the 100-seed Pass 07B corpus", results, frozenCorpusOutcomeMixPercentPerLegalBall: outcomeMixPercent };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
