/**
 * Project Pavilion P04 stage B: what the context-aware batting policy (LC_T20_BATTING_POLICY_V1) changes.
 *
 * Frozen 100-seed Pass 07B T20 corpus, suggested elevens, bowling and field on the tactical captain (tacticalT20Step,
 * captain V3, whose bowling choices are V2's). Two measures:
 *   1. Both sides batting on the old rule (captain V2: fixed phase aggression, intent NORMAL) and both on the new
 *      policy: first-innings runs, wickets, phase run rates, runs added from over 11 by wickets lost at over 10.
 *   2. Head to head: each seed played twice, the new policy batting for one side and then the other; the share of
 *      decided matches won by the side on the new policy.
 * Read-only. Deterministic: the same command gives the same output.
 *
 *   node --import tsx scripts/pavilion-p04b-measure.ts [output.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import { adviseT20Captain } from "@lcxxvi/ai";
import { createT20CorpusRequest, createT20Session, executeT20Command, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import type { T20Command, WorldPack } from "@lcxxvi/contracts";
import { publicT20CaptainView, tacticalT20Step } from "../apps/batch/src/tactical-match.js";

type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; dismissal: unknown; extras: Record<string, number> };
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r1 = (x: number) => +x.toFixed(1);

/** Captain V2's batting rule, kept here unchanged so the comparison stays reproducible: fixed aggression by phase or
 * required rate, intent always NORMAL. */
function oldRuleAggression(legalBalls: number, runs: number, wickets: number, target: number | null): number {
  const remaining = Math.max(1, 120 - legalBalls);
  const requiredRate = target === null ? null : (Math.max(0, target - runs) * 6) / remaining;
  const phase = legalBalls < 36 ? "EARLY" : legalBalls < 90 ? "MIDDLE" : "DEATH";
  let aggression = phase === "DEATH" ? 3 : 2;
  if (requiredRate !== null) aggression = requiredRate > 12 ? 4 : requiredRate > 9 ? 3 : requiredRate < 5 ? 1 : 2;
  if (wickets >= 7 && remaining > 24 && (requiredRate === null || requiredRate <= 9)) aggression = Math.min(aggression, 1);
  return aggression;
}

/** Captain V3 (the new batting policy) for teams in `newPolicy`; the old rule for the others. */
function step(session: T20Session, newPolicy: ReadonlySet<string>): T20Command {
  const i = session.core.innings[session.core.activeInningsIndex]?.innings;
  if (!i || session.core.phase !== "READY" || newPolicy.has(i.battingTeamId)) return tacticalT20Step(session);
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  if (!strikerId) return tacticalT20Step(session);
  const aggression = oldRuleAggression(i.legalBalls, i.runs, i.wickets, i.targetToWin);
  const plan = session.core.battingPlans[strikerId];
  if ((plan?.aggression ?? 2) !== aggression || (plan?.intent ?? "NORMAL") !== "NORMAL") {
    return {
      expectedRevision: session.revision, commandId: `tactical-${String(session.revision + 1).padStart(6, "0")}`,
      actorId: `AI:${i.battingTeamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: strikerId, aggression, intent: "NORMAL" },
    } as T20Command;
  }
  // The striker's plan is already the old rule's: let the captain make its other choices (bowling plan) unprompted
  // to re-set the batting plan, by showing it a striker plan that matches its own advice.
  const advice = adviseT20Captain(publicT20CaptainView(session)!);
  return tacticalT20Step({ ...session, core: { ...session.core, battingPlans: { ...session.core.battingPlans, [strikerId]: { aggression: advice.aggression, intent: advice.battingIntent } } } } as T20Session);
}

function play(raw: unknown, newPolicySide: "none" | "both" | 0 | 1) {
  const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
  request.selectedTeams = request.selectedTeams.map((s) => ({
    teamId: s.teamId,
    ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
  }));
  const teams = request.selectedTeams.map((t) => t.teamId);
  const newPolicy = new Set(newPolicySide === "none" ? [] : newPolicySide === "both" ? teams : [teams[newPolicySide]!]);
  let session: T20Session = createT20Session(validateT20MatchSetup(request, bytes, manifest));
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 3000) throw new Error("NO_PROGRESS");
    session = executeT20Command(session, step(session, newPolicy)).session;
  }
  return { session, teams, newPolicy };
}

function firstInnings(policy: "none" | "both") {
  const runs: number[] = [], wickets: number[] = [];
  const phase = { powerplay: [0, 0, 0], middle: [0, 0, 0], death: [0, 0, 0] } as Record<string, number[]>; // runs, balls, wickets
  const added: number[][] = [[], [], [], []];
  for (const raw of corpus.cases) {
    const { session } = play(raw, policy);
    let r = 0, w = 0, legal = 0, at10: [number, number] | null = null;
    for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex !== 0) continue;
      const p = legal < 36 ? "powerplay" : legal < 90 ? "middle" : "death";
      const total = e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
      r += total; phase[p]![0]! += total;
      if (e.dismissal) { w += 1; phase[p]![2]! += 1; }
      if (e.legalBall) { legal += 1; phase[p]![1]! += 1; if (legal === 60) at10 = [r, w]; }
    }
    runs.push(r); wickets.push(w);
    if (at10) added[at10[1] <= 1 ? 0 : at10[1] <= 3 ? 1 : at10[1] <= 5 ? 2 : 3]!.push(r - at10[0]);
  }
  return {
    batting: policy === "none" ? "old rule (captain V2 batting)" : "captain V3 (LC_T20_BATTING_POLICY_V1)",
    runs: r1(mean(runs)), wickets: +mean(wickets).toFixed(2), allOutOf100: wickets.filter((w) => w === 10).length,
    runsPerOver: Object.fromEntries(Object.entries(phase).map(([k, [r, b]]) => [k, +((r! * 6) / b!).toFixed(2)])),
    wicketsPerPhase: Object.fromEntries(Object.entries(phase).map(([k, v]) => [k, +(v[2]! / 100).toFixed(2)])),
    runsAddedFromOver11ByWicketsDownAtOver10: { "0-1": r1(mean(added[0]!)), "2-3": r1(mean(added[1]!)), "4-5": r1(mean(added[2]!)), "6+": r1(mean(added[3]!)), counts: added.map((a) => a.length) },
  };
}

function headToHead() {
  let wins = 0, losses = 0, ties = 0, chaseWins = 0, chases = 0;
  for (const raw of corpus.cases) {
    for (const side of [0, 1] as const) {
      const { session, newPolicy } = play(raw, side);
      const result = session.core.result as { winnerTeamId?: string | null } | null;
      const winner = result?.winnerTeamId ?? null;
      const secondBatting = session.core.innings[1]?.innings.battingTeamId;
      if (secondBatting && newPolicy.has(secondBatting)) { chases += 1; if (winner === secondBatting) chaseWins += 1; }
      if (!winner) ties += 1; else if (newPolicy.has(winner)) wins += 1; else losses += 1;
    }
  }
  return { matches: wins + losses + ties, newPolicyWins: wins, oldRuleWins: losses, noResultOrTie: ties, newPolicyChasesWon: `${chaseWins} of ${chases}` };
}

const output = {
  version: "LC_PAVILION_P04B_MEASURE_V1",
  model: "synthetic-alpha-01",
  corpus: "100-seed Pass 07B T20 corpus, suggested elevens, bowling on the tactical captain",
  firstInnings: [firstInnings("none"), firstInnings("both")],
  headToHead: headToHead(),
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
