/**
 * Captain V5 (Pavilion, 26 November 2026): diagnosis and before/after measurement of the death overs.
 * docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md. Read-only: no game file is changed, nothing is persisted.
 *
 * Set-up as scripts/stage-c/c4-delivery-balls.ts: the frozen 100-seed corpus (tests/fixtures/t20/seed_corpus.json),
 * suggested elevens, the tactical captain on both sides, the batch step's public view. Repeat 0 uses the corpus seeds
 * as frozen; repeat r > 0 appends `-c1r<r>` (the stage C convention).
 *
 *   node --import tsx scripts/pavilion-captain-v5-measure.ts <output.json> [--model=synthetic-alpha-01|calibrated-t20-01]
 *        [--advance=OVER|DELIVERY] [--bowling=V4|V5] [--batting=V4|V5] [--repeats=5] [--first=0]
 *   node --import tsx scripts/pavilion-captain-v5-measure.ts <output.json> --h2h [--model=...]
 *
 * --advance: OVER bowls a whole over per ADVANCE (the batch step up to V4, so the captain is asked once an over and the
 * other batter keeps an old or default plan); DELIVERY bowls one ball, as the live game's passages do (default).
 *
 * Corpus mode: both sides use one captain made of two parts, so the causes can be separated (with --advance, 2 x 2 x 2):
 *   --bowling: V4 (yorker at maximum effort on almost every death ball) or V5 (t20DeathBowlingPlanV5);
 *   --batting: V4 (LC_T20_BATTING_POLICY_V1) or V5 (LC_T20_BATTING_POLICY_V2).
 * Bowler choice, the powerplay and middle-overs plans and the field are the same in V4 and V5. V4 + V4 is
 * adviseT20CaptainV4; V5 + V5 is adviseT20Captain. Reports first-innings runs and wickets, phase rates, the death
 * plan mix, aggression by phase and each one's share of death runs and wickets, with 95% match-bootstrap intervals.
 *
 * Head-to-head mode: each corpus seed (repeat 0) twice, V5 on one side and V4 on the other, then swapped.
 * Deterministic: the same command gives the same file (the bootstrap uses a fixed-seed generator in this script).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep, validateT20MatchSetup, validateT20ResearchMatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import type { T20Command, WorldPack } from "@lcxxvi/contracts";
import {
  adviseT20Batting, adviseT20BattingV2, adviseT20Captain, adviseT20CaptainV4, type T20TacticalAdvice, type T20TacticalPublicView,
} from "@lcxxvi/ai";
import { publicT20CaptainView } from "../apps/batch/src/tactical-match.js";

type Delivery = {
  type: string; inningsIndex: number; strikerId: string; legalBall: boolean; batRuns: number;
  extras: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
  executedLength: string | null; dismissal: { kind: string } | null;
};
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: { seed: string; caseId: string }[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const opt = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const MODEL = opt("model", "synthetic-alpha-01");
if (MODEL !== "synthetic-alpha-01" && MODEL !== "calibrated-t20-01") throw new Error(`unknown model ${MODEL}`);
const BOWLING = opt("bowling", "V5"), BATTING = opt("batting", "V5");
if (!["V4", "V5"].includes(BOWLING) || !["V4", "V5"].includes(BATTING)) throw new Error("--bowling and --batting take V4 or V5");
/** How the harness advances between the captain's decisions: a whole over per command (the batch step up to V4, and
 * C5's measurements) or one ball (as the live game's passages do, consulting the opponent before each ball). */
const ADVANCE = opt("advance", "DELIVERY");
if (ADVANCE !== "OVER" && ADVANCE !== "DELIVERY") throw new Error("--advance takes OVER or DELIVERY");
const REPEATS = Number(opt("repeats", "5")), FIRST = Number(opt("first", "0"));
const H2H = process.argv.includes("--h2h");
const out = process.argv.filter((a) => !a.startsWith("--"))[2];
if (!out) throw new Error("usage: pavilion-captain-v5-measure.ts <output.json> [options]");
const setupFor = (request: unknown) => MODEL === "calibrated-t20-01"
  ? validateT20ResearchMatchSetup(request, bytes, manifest, "calibrated-t20-01")
  : validateT20MatchSetup(request, bytes, manifest);

type Captain = (view: T20TacticalPublicView) => T20TacticalAdvice;
/** A captain made of V4's or V5's death bowling plan and V4's or V5's batting policy. */
function composed(bowling: string, batting: string): Captain {
  return (view) => {
    const v4 = adviseT20CaptainV4(view), v5 = adviseT20Captain(view);
    const bowl = bowling === "V5" ? v5 : v4, bat = batting === "V5" ? v5 : v4;
    if (v4.preferredBowlerId !== v5.preferredBowlerId || v4.fieldIntent !== v5.fieldIntent) throw new Error("V4_V5_BOWLER_OR_FIELD_DIFFER");
    return { ...bowl, aggression: bat.aggression, battingIntent: bat.battingIntent };
  };
}

/** The batch tactical step (apps/batch/src/tactical-match.ts, tacticalT20Step) with the captain as a parameter. */
function step(session: T20Session, captainOf: (teamId: string) => Captain): { command: T20Command; advice: T20TacticalAdvice | null } {
  const fallback = fixtureAutopilotStep(session);
  const view = publicT20CaptainView(session);
  if (!view) return { command: fallback, advice: null };
  const i = session.core.innings[session.core.activeInningsIndex]!.innings;
  const bowlAdvice = captainOf(i.bowlingTeamId)(view), batAdvice = captainOf(i.battingTeamId)(view);
  const advice = { ...bowlAdvice, aggression: batAdvice.aggression, battingIntent: batAdvice.battingIntent };
  const base = { expectedRevision: session.revision, commandId: `tactical-${String(session.revision + 1).padStart(6, "0")}` };
  if (session.core.phase === "AWAITING_BOWLER" && advice.preferredBowlerId)
    return { advice, command: { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: advice.preferredBowlerId } } };
  if (session.core.phase !== "READY") return { command: fallback, advice };
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const plan = striker ? session.core.battingPlans[striker] : undefined;
  if (striker && ((plan?.aggression ?? 2) !== advice.aggression || (plan?.intent ?? "NORMAL") !== advice.battingIntent))
    return { advice, command: { ...base, actorId: `AI:${i.battingTeamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: striker, aggression: advice.aggression, intent: advice.battingIntent } } };
  const current = session.core.bowlingPlan;
  if (current && (current.length !== advice.bowlingLength || current.effort !== advice.bowlingEffort))
    return { advice, command: { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLING_PLAN", payload: { bowlerId: current.bowlerId, line: current.line, length: advice.bowlingLength, variationId: current.variationId, effort: advice.bowlingEffort } } };
  if (ADVANCE === "OVER") return { command: fallback, advice };
  return { advice, command: { ...base, actorId: "SYSTEM", kind: "ADVANCE", payload: { scope: "DELIVERY" } } };
}

function requestFor(raw: { seed: string; caseId: string }, r: number) {
  const seeded = r === 0 ? raw : { ...raw, seed: `${raw.seed}-c1r${r}` };
  const request = createT20CorpusRequest(seeded, base, world as never) as { selectedTeams: { teamId: string }[] };
  request.selectedTeams = request.selectedTeams.map((s) => ({
    teamId: s.teamId,
    ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
  }));
  return request;
}

type Ball = {
  match: number; inn: number; over: number; legal: boolean; total: number; bat: number; out: boolean;
  aggression: number; intent: string; length: string; effort: string; executed: string; why: string;
};
/** Why the batting policy held a death ball at aggression 2 or lower: its own reason text, without the numbers. */
function whyLow(view: T20TacticalPublicView, aggression: number, battingPolicy: string): string {
  if (aggression > 2) return "";
  const bv = { inningsLegalBalls: view.inningsLegalBalls, inningsRuns: view.inningsRuns, wicketsLost: view.wicketsLost,
    targetToWin: view.targetToWin, striker: view.striker ?? null, partner: view.partner ?? null };
  const advice = battingPolicy === "V5" ? adviseT20BattingV2(bv) : adviseT20Batting(bv);
  const parts = advice.reason.split("; ");
  const rate = /rate ([\d.]+)/.exec(parts[0]!);
  const head = parts[0]!.startsWith("chasing") ? (rate && Number(rate[1]) < 8 ? "chase, required rate below 8" : "chase, required rate 8 or more") : "setting a total";
  return [head, ...parts.slice(1)].join("; ");
}

function play(request: unknown, captainOf: (teamId: string) => Captain, match: number, balls: Ball[] | null, battingPolicy = BATTING): T20Session {
  let session = createT20Session(setupFor(request));
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 3000) throw new Error("NO_PROGRESS");
    const { command, advice } = step(session, captainOf);
    const view = publicT20CaptainView(session);
    const plans = session.core.battingPlans, bowlingPlan = session.core.bowlingPlan;
    const before = session.events.length;
    const legal = session.core.innings.map((l) => l.innings.legalBalls);
    session = executeT20Command(session, command).session;
    if (!balls) continue;
    for (const record of session.events.slice(before) as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex > 1) continue;
      const plan = plans[e.strikerId];
      const ex = e.extras;
      const over = Math.floor((legal[e.inningsIndex] ?? 0) / 6);
      balls.push({
        match, inn: e.inningsIndex, over, legal: e.legalBall, bat: e.batRuns, out: e.dismissal !== null,
        total: e.batRuns + ex.wides + ex.noBalls + ex.byes + ex.legByes + ex.penalties,
        aggression: plan?.aggression ?? 2, intent: plan?.intent ?? "NORMAL",
        length: bowlingPlan?.length ?? "", effort: bowlingPlan?.effort ?? "", executed: e.executedLength ?? "",
        why: over >= 15 && view && advice ? whyLow(view, plan?.aggression ?? 2, battingPolicy) : "",
      });
      if (e.legalBall) legal[e.inningsIndex] = (legal[e.inningsIndex] ?? 0) + 1;
    }
  }
  return session;
}

// ---- statistics ----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Ratio of sums over matches, with a 95% match-bootstrap interval (1,000 resamples, fixed seed). */
function ratio(num: number[], den: number[], scale = 1) {
  const n = num.length, rnd = mulberry32(20261126), sims: number[] = [];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const point = (scale * sum(num)) / Math.max(1e-9, sum(den));
  for (let b = 0; b < 1000; b += 1) {
    let a = 0, d = 0;
    for (let k = 0; k < n; k += 1) { const j = Math.floor(rnd() * n); a += num[j]!; d += den[j]!; }
    sims.push((scale * a) / Math.max(1e-9, d));
  }
  sims.sort((x, y) => x - y);
  const r = (x: number) => +x.toFixed(3);
  return { value: r(point), ci95: [r(sims[24]!), r(sims[974]!)] };
}
const PHASES = [["powerplay", 0, 6], ["middle", 6, 15], ["death", 15, 20]] as const;

function summarise(balls: Ball[], matches: number) {
  const per = (pred: (b: Ball) => boolean, f: (b: Ball) => number) => {
    const xs = new Array<number>(matches).fill(0);
    for (const b of balls) if (pred(b)) xs[b.match]! += f(b);
    return xs;
  };
  const ones = new Array<number>(matches).fill(1);
  const first = (b: Ball) => b.inn === 0;
  const phaseBlock = (pred: (b: Ball) => boolean) => {
    const legal = per(pred, (b) => +b.legal);
    return {
      legalBalls: legal.reduce((a, b) => a + b, 0),
      runsPerOver: ratio(per(pred, (b) => b.total), legal, 6),
      wicketPercent: ratio(per(pred, (b) => +(b.out && b.legal)), legal, 100),
      dotPercentExcludingWicketBalls: ratio(per(pred, (b) => +(b.legal && b.total === 0 && !b.out)), legal, 100),
      fourPercent: ratio(per(pred, (b) => +(b.legal && b.bat === 4)), legal, 100),
      sixPercent: ratio(per(pred, (b) => +(b.legal && b.bat === 6)), legal, 100),
    };
  };
  const firstInnings = {
    innings: matches,
    runs: ratio(per(first, (b) => b.total), ones),
    wickets: ratio(per(first, (b) => +b.out), ones),
    dotPercentIncludingWicketBalls: ratio(per(first, (b) => +(b.legal && b.total === 0)), per(first, (b) => +b.legal), 100),
    ...Object.fromEntries(PHASES.map(([name, lo, hi]) => [name, phaseBlock((b) => first(b) && b.over >= lo && b.over < hi)])),
  };
  // Death plan mix and aggression, first innings and both innings.
  const deathDetail = (pred: (b: Ball) => boolean) => {
    const death = balls.filter((b) => pred(b) && b.over >= 15);
    const legal = death.filter((b) => b.legal).length;
    const runs = death.reduce((a, b) => a + b.total, 0), wkts = death.filter((b) => b.out && b.legal).length;
    const cell = (key: (b: Ball) => string) => {
      const groups = new Map<string, Ball[]>();
      for (const b of death) groups.set(key(b), [...(groups.get(key(b)) ?? []), b]);
      return Object.fromEntries([...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, bs]) => {
        const l = bs.filter((b) => b.legal).length, r = bs.reduce((a, b) => a + b.total, 0), w = bs.filter((b) => b.out && b.legal).length;
        return [k, {
          shareOfLegalBalls: +((100 * l) / legal).toFixed(2), runsPerOver: +((6 * r) / Math.max(1, l)).toFixed(2),
          wicketPercent: +((100 * w) / Math.max(1, l)).toFixed(2),
          dotPercent: +((100 * bs.filter((b) => b.legal && b.total === 0 && !b.out).length) / Math.max(1, l)).toFixed(1),
          shareOfDeathRuns: +((100 * r) / Math.max(1, runs)).toFixed(2), shareOfDeathWickets: +((100 * w) / Math.max(1, wkts)).toFixed(2),
        }];
      }));
    };
    return {
      legalBalls: legal, runsPerOver: +((6 * runs) / legal).toFixed(3), wicketPercent: +((100 * wkts) / legal).toFixed(3),
      byPlan: cell((b) => `${b.length}/${b.effort}`), byPlannedLength: cell((b) => b.length), byEffort: cell((b) => b.effort),
      byExecutedLength: cell((b) => b.executed || "none"), byAggression: cell((b) => String(b.aggression)),
      lowAggressionReasons: cell((b) => b.why || "aggression 3 or 4"),
    };
  };
  const aggressionByPhase = (inn: number) => Object.fromEntries(PHASES.map(([name, lo, hi]) => {
    const bs = balls.filter((b) => b.inn === inn && b.legal && b.over >= lo && b.over < hi);
    return [name, Object.fromEntries([0, 1, 2, 3, 4].map((a) => [a, +((100 * bs.filter((b) => b.aggression === a).length) / Math.max(1, bs.length)).toFixed(2)]))];
  }));
  return {
    firstInnings,
    deathFirstInnings: deathDetail(first),
    deathSecondInnings: deathDetail((b) => b.inn === 1),
    aggressionSharePercentByPhase: { firstInnings: aggressionByPhase(0), secondInnings: aggressionByPhase(1) },
  };
}

function wilson(k: number, n: number) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(100 * (centre - half)).toFixed(1), +(100 * (centre + half)).toFixed(1)];
}

const started = Date.now();
let output: Record<string, unknown>;
if (H2H) {
  const v4 = composed("V4", "V4"), v5 = composed("V5", "V5");
  let v5Wins = 0, v4Wins = 0, other = 0;
  const diff: number[] = [];
  for (const raw of corpus.cases) {
    for (const v5Side of [0, 1]) {
      const request = requestFor(raw, 0);
      const teams = request.selectedTeams.map((t) => t.teamId);
      const session = play(request, (t) => (t === teams[v5Side] ? v5 : v4), 0, null);
      const winner = (session.core.result as { winnerTeamId?: string | null } | null)?.winnerTeamId ?? null;
      if (!winner) other += 1; else if (winner === teams[v5Side]) v5Wins += 1; else v4Wins += 1;
      const runs = session.core.innings.map((l) => l.innings.runs);
      const firstBat = session.core.innings[0]!.innings.battingTeamId;
      diff.push(firstBat === teams[v5Side] ? runs[0]! - runs[1]! : runs[1]! - runs[0]!);
    }
  }
  const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
  const sd = Math.sqrt(diff.reduce((a, x) => a + (x - mean) ** 2, 0) / (diff.length - 1));
  output = {
    version: "LC_PAVILION_CAPTAIN_V5_H2H_V1", model: MODEL, advance: ADVANCE, matches: diff.length, v5Wins, v4Wins, tiesOrNoResult: other,
    v5PercentOfDecided: +((100 * v5Wins) / (v5Wins + v4Wins)).toFixed(1), v5PercentOfDecided95: wilson(v5Wins, v5Wins + v4Wins),
    meanRunDifferenceV5MinusV4: +mean.toFixed(1), meanRunDifference95: [+(mean - (1.96 * sd) / Math.sqrt(diff.length)).toFixed(1), +(mean + (1.96 * sd) / Math.sqrt(diff.length)).toFixed(1)],
    design: "100 frozen corpus seeds (repeat 0), each twice: V5 on one side and V4 on the other, then swapped",
  };
} else {
  const captain = composed(BOWLING, BATTING);
  const balls: Ball[] = [];
  let match = 0;
  for (let r = FIRST; r < FIRST + REPEATS; r += 1) {
    for (const raw of corpus.cases) { play(requestFor(raw, r), () => captain, match, balls); match += 1; }
    console.error(`repeat ${r} done, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  output = {
    version: "LC_PAVILION_CAPTAIN_V5_MEASURE_V1", model: MODEL, advance: ADVANCE, bowlingPlan: BOWLING, battingPolicy: BATTING, repeats: REPEATS, firstRepeat: FIRST, matches: match,
    design: "frozen 100-seed corpus, suggested elevens, the same captain on both sides; repeat r>0 seeds suffixed -c1r<r>; phases are overs 1-6, 7-15, 16-20",
    definitions: "runs an over include extras; dot = legal ball with no run of any kind and no wicket; wicket, four and six % are per legal ball; intervals are 95% match bootstrap",
    ...summarise(balls, match),
  };
}
writeFileSync(out, JSON.stringify(output, null, 2) + "\n");
console.error(`wrote ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
