/**
 * Project Pavilion: does good management beat deliberately poor management? (owner direction of 25 November 2026,
 * "Tactical validation").
 *
 * Each experiment changes ONE decision area. The "good" side is the tactical captain (captain V2, as on main) with the
 * suggested eleven. The "poor" side is identical except in that one area. Each of the 100 frozen corpus seeds is
 * played twice, the poor management on one side and then on the other, so team strength, toss and seed cancel out.
 *
 * Reported per experiment (with the poor side's commands per match, to show the manipulation took effect): the good side's share of decided matches with a 95% Wilson interval, the mean runs per
 * innings by each side, and the mean difference with a 95% interval (paired by match, normal approximation).
 * Deterministic: the same command gives the same output. Read-only: no game file is changed.
 *
 *   node --import tsx scripts/pavilion-tactical-validation.ts [output.json] [experiment ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isBowlingCapable, suggestedEleven } from "@lcxxvi/data";
import { adviseT20Captain, feasibleBowlerChoice, bowlersWithOversLeft } from "@lcxxvi/ai";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, validateT20ResearchMatchSetup, fixtureAutopilotStep, validateT20MatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import type { T20Command, WorldPack } from "@lcxxvi/contracts";
import { publicT20CaptainView } from "../apps/batch/src/tactical-match.js";

type Player = WorldPack["players"][number];
type Delivery = { type: string; inningsIndex: number; batRuns: number; extras: Record<string, number> };
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
/** Research model selection (Stage C): `--model=calibrated-t20-01` uses validateT20ResearchMatchSetup; default synthetic-alpha-01. */
const MODEL = process.argv.find((a) => a.startsWith("--model="))?.slice(8) ?? "synthetic-alpha-01";
if (MODEL !== "synthetic-alpha-01" && MODEL !== "calibrated-t20-01") throw new Error(`unknown model ${MODEL}`);
const ARGS = process.argv.filter((a) => !a.startsWith("--model="));
const setupFor = (request: unknown) => MODEL === "calibrated-t20-01"
  ? validateT20ResearchMatchSetup(request, bytes, manifest, "calibrated-t20-01")
  : validateT20MatchSetup(request, bytes, manifest);
const squadOf = (teamId: string) => world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!);
const bat = (p: Player) => { const s = p.skills.T20; return s.timing + s.power + s.defence + s.rotation; };
const bowl = (p: Player) => { const s = p.skills.T20; return s.control + s.movement + s.variation; };
const tie = (a: Player, b: Player) => (a.playerId < b.playerId ? -1 : 1);

type Eleven = { playerIds: string[]; captainId: string; keeperId: string };
/** A manager's choices. Anything left undefined is the good default. */
interface Management {
  eleven?: (squad: Player[]) => Eleven;
  /** Fixed striker aggression instead of the captain's. */
  aggression?: 0 | 1 | 2 | 3 | 4;
  /** Choose bowlers worst first (still never leaving the innings unbowlable). */
  worstBowlerFirst?: boolean;
  /** Bowling plan held all innings instead of the captain's by phase. */
  bowlingPlan?: { length: "GOOD" | "FULL" | "YORKER"; effort: "CONSERVE" | "NORMAL" | "MAXIMUM" };
  /** Field held all innings instead of the engine's default by phase. */
  field?: readonly string[];
}

const good = (squad: Player[]) => suggestedEleven(squad, "T20");
const EXPERIMENTS: Record<string, { area: string; poor: string; management: Management }> = {
  "selection-weakest": {
    area: "Selection",
    poor: "Weakest eleven: the weaker keeper, the five weakest bowlers and the five weakest other players, batting in skill order",
    management: {
      eleven: (squad) => {
        const keeper = squad.filter((p) => p.role === "KEEPER").sort((a, b) => bat(a) - bat(b) || tie(a, b))[0]!;
        const bowlers = squad.filter((p) => p !== keeper && isBowlingCapable(p)).sort((a, b) => bowl(a) - bowl(b) || tie(a, b)).slice(0, 5);
        const others = squad.filter((p) => p !== keeper && !isBowlingCapable(p)).sort((a, b) => bat(a) - bat(b) || tie(a, b)).slice(0, 5);
        const xi = [keeper, ...bowlers, ...others].sort((a, b) => bat(b) - bat(a) || tie(a, b));
        return { playerIds: xi.map((p) => p.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
      },
    },
  },
  "selection-old-rule": {
    area: "Selection",
    poor: "The pre-stage-A rule: keeper, the first six bowling-capable players, then squad order (no specialist batters)",
    management: {
      eleven: (squad) => {
        const keeper = squad.find((p) => p.role === "KEEPER")!;
        const bowlers = squad.filter((p) => p !== keeper && isBowlingCapable(p)).slice(0, 6);
        const rest = squad.filter((p) => p !== keeper && !bowlers.includes(p)).slice(0, 4);
        const xi = [keeper, ...bowlers, ...rest];
        return { playerIds: xi.map((p) => p.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
      },
    },
  },
  "batting-order-reversed": {
    area: "Selection (batting order)",
    poor: "The suggested eleven batting in reverse order (tail first)",
    management: { eleven: (squad) => { const e = good(squad); return { ...e, playerIds: [...e.playerIds].reverse() }; } },
  },
  "aggression-all-out": { area: "Batting aggression", poor: "Aggression 4 every ball", management: { aggression: 4 } },
  "aggression-blocking": { area: "Batting aggression", poor: "Aggression 0 every ball", management: { aggression: 0 } },
  "bowling-worst-first": { area: "Bowling choice", poor: "Weakest available bowler first, every over (quota-safe)", management: { worstBowlerFirst: true } },
  "bowling-plan-full-max": { area: "Bowling plan", poor: "Full length at maximum effort all innings", management: { bowlingPlan: { length: "FULL", effort: "MAXIMUM" } } },
  "field-attacking-throughout": {
    area: "Field setting",
    poor: "The two-slip powerplay field held for all 20 overs",
    management: { field: ["slip-1", "slip-2", "point", "cover", "mid-off", "mid-on", "midwicket", "deep-square-leg", "fine-leg"] },
  },
};

function command(session: T20Session, actorTeam: string, kind: T20Command["kind"], payload: unknown): T20Command {
  return { expectedRevision: session.revision, commandId: `tv-${String(session.revision + 1).padStart(6, "0")}`, actorId: `AI:${actorTeam}`, kind, payload } as T20Command;
}

/** Good management is captain V2 for bowler, batting plan and bowling plan, and the engine's default field. */
function step(session: T20Session, managers: ReadonlyMap<string, Management>): T20Command {
  const phase = session.core.phase;
  const i = session.core.innings[session.core.activeInningsIndex]?.innings;
  const view = i ? publicT20CaptainView(session) : null;
  if (!i || !view || (phase !== "AWAITING_BOWLER" && phase !== "READY")) return fixtureAutopilotStep(session);
  const advice = adviseT20Captain(view);
  const batting = managers.get(i.battingTeamId)!, bowling = managers.get(i.bowlingTeamId)!;
  if (phase === "AWAITING_BOWLER") {
    let bowlerId = advice.preferredBowlerId;
    if (bowling.worstBowlerFirst) {
      const order = [...view.bowlingCandidates].sort((a, b) => a.control + a.movement + a.variation - (b.control + b.movement + b.variation) || a.playerId.localeCompare(b.playerId)).map((c) => c.playerId);
      bowlerId = feasibleBowlerChoice(order, Math.ceil((120 - i.legalBalls) / 6), bowlersWithOversLeft(view, 6), view.previousOverBowler?.playerId ?? null);
    }
    if (!bowlerId) return fixtureAutopilotStep(session);
    return command(session, i.bowlingTeamId, "SET_BOWLER", { teamId: i.bowlingTeamId, bowlerId });
  }
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const aggression = batting.aggression ?? advice.aggression;
  if (striker && (session.core.battingPlans[striker]?.aggression ?? 2) !== aggression)
    return command(session, i.battingTeamId, "SET_BATTING_PLAN", { playerId: striker, aggression, intent: "NORMAL" });
  const plan = bowling.bowlingPlan ?? { length: advice.bowlingLength, effort: advice.bowlingEffort };
  const current = session.core.bowlingPlan;
  if (current && (current.length !== plan.length || current.effort !== plan.effort))
    return command(session, i.bowlingTeamId, "SET_BOWLING_PLAN", { ...current, ...plan });
  if (bowling.field) {
    const slots = session.core.fieldSlots;
    const want = [...slots].map((s) => s.playerId).sort().map((playerId, n) => ({ slotId: bowling.field![n]!, playerId }));
    const same = (a: typeof want) => [...a].sort((x, y) => x.playerId.localeCompare(y.playerId)).map((s) => `${s.playerId}:${s.slotId}`).join("|");
    if (same(slots) !== same(want)) return command(session, i.bowlingTeamId, "SET_FIELD", { teamId: i.bowlingTeamId, fieldSlots: want });
  }
  return fixtureAutopilotStep(session);
}

function inningsRuns(session: T20Session, index: number) {
  let runs = 0;
  for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
    const e = record.payload?.event;
    if (e?.type === "DELIVERY_RECORDED" && e.inningsIndex === index) runs += e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
  }
  return runs;
}

function wilson(k: number, n: number) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(100 * (centre - half)).toFixed(1), +(100 * (centre + half)).toFixed(1)];
}

function experiment(name: string) {
  const { area, poor, management } = EXPERIMENTS[name]!;
  let goodWins = 0, poorWins = 0, other = 0;
  const goodRuns: number[] = [], poorRuns: number[] = [], diff: number[] = [];
  const poorCommands: Record<string, number> = {};
  for (const raw of corpus.cases) {
    for (const poorSide of [0, 1]) {
      const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
      const teams = request.selectedTeams.map((t) => t.teamId);
      const managers = new Map(teams.map((t, n) => [t, n === poorSide ? management : {}] as const));
      request.selectedTeams = teams.map((teamId) => ({ teamId, ...(managers.get(teamId)!.eleven ?? good)(squadOf(teamId)) }));
      let session: T20Session = createT20Session(setupFor(request));
      for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
        if (n > 3000) throw new Error("NO_PROGRESS");
        session = executeT20Command(session, step(session, managers)).session;
      }
      const poorTeam = teams[poorSide]!;
      for (const c of (session as unknown as { commands: { actorId: string; kind: string }[] }).commands)
        if (c.actorId === `AI:${poorTeam}`) poorCommands[c.kind] = (poorCommands[c.kind] ?? 0) + 1;
      const winner = (session.core.result as { winnerTeamId?: string | null } | null)?.winnerTeamId ?? null;
      if (!winner) other += 1; else if (winner === poorTeam) poorWins += 1; else goodWins += 1;
      const firstBat = session.core.innings[0]!.innings.battingTeamId;
      const [r0, r1] = [inningsRuns(session, 0), inningsRuns(session, 1)];
      const [g, p] = firstBat === poorTeam ? [r1, r0] : [r0, r1];
      goodRuns.push(g); poorRuns.push(p); diff.push(g - p);
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(diff.reduce((a, x) => a + (x - mean(diff)) ** 2, 0) / (diff.length - 1));
  const half = (1.96 * sd) / Math.sqrt(diff.length);
  const decided = goodWins + poorWins;
  return {
    experiment: name, area, poor, matches: diff.length, goodWins, poorWins, tiesOrNoResult: other,
    goodWinPercentOfDecided: +((100 * goodWins) / decided).toFixed(1), goodWinPercent95: wilson(goodWins, decided),
    meanRunsGood: +mean(goodRuns).toFixed(1), meanRunsPoor: +mean(poorRuns).toFixed(1),
    meanRunDifference: +mean(diff).toFixed(1), meanRunDifference95: [+(mean(diff) - half).toFixed(1), +(mean(diff) + half).toFixed(1)],
    poorSideCommandsPerMatch: Object.fromEntries(Object.entries(poorCommands).sort().map(([k, v]) => [k, +(v / diff.length).toFixed(1)])),
  };
}

const chosen = ARGS.slice(3).length ? ARGS.slice(3) : Object.keys(EXPERIMENTS);
const results = chosen.map((name) => { const r = experiment(name); console.error(JSON.stringify(r)); return r; });
const output = {
  version: "LC_PAVILION_TACTICAL_VALIDATION_V1",
  model: MODEL,
  design: "100 frozen corpus seeds, each played twice with the poor management on each side; good = tactical captain V2, suggested eleven, engine default field",
  note: "Second-innings runs stop when the target is reached, so the run difference understates the gap in matches the chasing side wins.",
  results,
};
if (ARGS[2]) writeFileSync(ARGS[2], JSON.stringify(output, null, 2) + "\n");
