/**
 * Project Pavilion: who bowls the death overs? Measures the T20 tactical captain's bowler deployment.
 *
 * Frozen 100-seed Pass 07B T20 corpus, suggested elevens, both sides on the tactical captain. Two captains are run:
 *   - "captain": the captain in the code at this revision (adviseT20Captain through the same steps as
 *     apps/batch tacticalT20Step; the script checks its event hashes equal tacticalT20Step's);
 *   - "v3": captain V3's bowler choice and effort (V2's score, kept here unchanged so the comparison stays
 *     reproducible), every other choice from adviseT20Captain, whose batting policy V3 and V4 share.
 * On the revision where the code's captain is V3 the two runs must be identical, which checks the copy.
 *
 * Reported per captain: the share of each bowler-rating quarter's overs in the powerplay (overs 1 to 6), middle
 * (7 to 15) and death (16 to 20); the same by rank within the eleven; economy by phase; first-innings runs; and a
 * head to head (each seed twice, the code's captain on one side then the other).
 * Rating = control + movement + variation (T20), as packages/data eleven.ts. Quarters are of the distinct bowlers who
 * bowl in the corpus, ranked by rating (ties by playerId), and each player is in one quarter.
 * Read-only. Deterministic: the same command gives the same output.
 *
 *   node --import tsx scripts/pavilion-captain-death-overs-measure.ts [output.json] [--no-h2h]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import { adviseT20Captain, bowlersWithOversLeft, feasibleBowlerChoice, type T20TacticalAdvice, type T20TacticalPublicView } from "@lcxxvi/ai";
import { createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import type { T20Command, WorldPack } from "@lcxxvi/contracts";
import { publicT20CaptainView, tacticalT20Step } from "../apps/batch/src/tactical-match.js";

type Player = WorldPack["players"][number];
type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; bowlerId: string; extras: Record<string, number> };
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const rating = (p: Player) => p.skills.T20.control + p.skills.T20.movement + p.skills.T20.variation;
const PHASES = ["powerplay", "middle", "death"] as const;
const phaseOf = (legalBallsBefore: number) => (legalBallsBefore < 36 ? 0 : legalBallsBefore < 90 ? 1 : 2);

/** Captain V3's bowler choice and effort, unchanged from packages/ai/src/t20-captain.ts at 4e29882. */
function adviseV3(view: T20TacticalPublicView): T20TacticalAdvice {
  const advice = adviseT20Captain(view);
  const remaining = Math.max(1, 120 - view.inningsLegalBalls);
  const phase = view.inningsLegalBalls < 36 ? "EARLY" : view.inningsLegalBalls < 90 ? "MIDDLE" : "DEATH";
  const valid = view.bowlingCandidates.filter((p) => p.quotaRemaining > 0 && p.fatigueBp <= 10000);
  const scores = valid.map((p) => ({
    id: p.playerId,
    score: 2 * p.control + 2 * p.movement + p.variation + p.stamina / 2 - p.fatigueBp / 90 - (phase !== "DEATH" && p.quotaRemaining <= 6 ? 30 : 0),
  }));
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const chosenId = feasibleBowlerChoice(scores.map((s) => s.id), Math.ceil(remaining / 6), bowlersWithOversLeft(view, 6), view.previousOverBowler?.playerId ?? null);
  const chosen = valid.find((p) => p.playerId === chosenId);
  const bowlingEffort = chosen && chosen.fatigueBp >= 7000 ? "CONSERVE" : phase === "DEATH" && chosen && chosen.fatigueBp < 4000 ? "MAXIMUM" : "NORMAL";
  return { ...advice, preferredBowlerId: chosen?.playerId ?? null, bowlingEffort };
}

type Advisor = (view: T20TacticalPublicView) => T20TacticalAdvice;
/** The same steps as apps/batch tacticalT20Step, with the advisor as a parameter. */
function step(session: T20Session, advisorFor: (teamId: string) => Advisor): T20Command {
  const fallback = fixtureAutopilotStep(session);
  const view = publicT20CaptainView(session);
  if (!view) return fallback;
  const i = session.core.innings[session.core.activeInningsIndex]!.innings;
  const bowlingAdvice = advisorFor(i.bowlingTeamId)(view);
  const battingAdvice = advisorFor(i.battingTeamId)(view);
  const base = { expectedRevision: session.revision, commandId: `tactical-${String(session.revision + 1).padStart(6, "0")}` };
  if (session.core.phase === "AWAITING_BOWLER" && bowlingAdvice.preferredBowlerId) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: bowlingAdvice.preferredBowlerId } };
  }
  if (session.core.phase !== "READY") return fallback;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  const plan = striker ? session.core.battingPlans[striker] : undefined;
  if (striker && ((plan?.aggression ?? 2) !== battingAdvice.aggression || (plan?.intent ?? "NORMAL") !== battingAdvice.battingIntent)) {
    return { ...base, actorId: `AI:${i.battingTeamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: striker, aggression: battingAdvice.aggression, intent: battingAdvice.battingIntent } };
  }
  const current = session.core.bowlingPlan;
  if (current && (current.length !== bowlingAdvice.bowlingLength || current.effort !== bowlingAdvice.bowlingEffort)) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLING_PLAN", payload: { ...current, length: bowlingAdvice.bowlingLength, effort: bowlingAdvice.bowlingEffort } };
  }
  return fallback;
}

function setupFor(raw: unknown) {
  const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
  request.selectedTeams = request.selectedTeams.map((s) => ({
    teamId: s.teamId,
    ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
  }));
  return { setup: validateT20MatchSetup(request, bytes, manifest), teams: request.selectedTeams.map((t) => t.teamId) };
}

function play(raw: unknown, advisorFor: (teamId: string, teams: string[]) => Advisor, useBatchStep = false) {
  const { setup, teams } = setupFor(raw);
  let session: T20Session = createT20Session(setup);
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 3000) throw new Error("NO_PROGRESS");
    session = executeT20Command(session, useBatchStep ? tacticalT20Step(session) : step(session, (t) => advisorFor(t, teams))).session;
  }
  return { session, teams };
}

const deliveries = (session: T20Session) =>
  (session.events as unknown as { payload?: { event?: Delivery } }[]).map((r) => r.payload?.event).filter((e): e is Delivery => e?.type === "DELIVERY_RECORDED");

function deployment(inner: Advisor, label: string) {
  const policyIds = new Set<string>();
  const advisor: Advisor = (view) => { const a = inner(view); policyIds.add(a.policyId); return a; };
  const sessions = corpus.cases.map((raw) => play(raw, () => advisor).session);
  // Balls and runs per bowler and phase; legal balls are counted, so an over is 6 of them.
  const balls = new Map<string, number[]>(), runs = [0, 0, 0], legal = [0, 0, 0];
  const rankBalls = new Map<number, number[]>();
  let firstInningsRuns = 0;
  for (const session of sessions) {
    for (const inningsIndex of [0, 1]) {
      const ledger = session.core.innings[inningsIndex];
      if (!ledger) continue;
      const team = session.setup.teams.find((t) => t.teamId === ledger.innings.bowlingTeamId)!;
      const ranked = team.xi.filter((p) => p.bowlingStyle !== null && p.playerId !== team.keeperId).map((p) => byId.get(p.playerId)!)
        .sort((a, b) => rating(b) - rating(a) || (a.playerId < b.playerId ? -1 : 1)).map((p) => p.playerId);
      let before = 0;
      for (const e of deliveries(session).filter((d) => d.inningsIndex === inningsIndex)) {
        const ph = phaseOf(before);
        const total = e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
        runs[ph]! += total;
        if (inningsIndex === 0) firstInningsRuns += total;
        if (e.legalBall) {
          legal[ph]! += 1; before += 1;
          const b = balls.get(e.bowlerId) ?? [0, 0, 0]; b[ph]! += 1; balls.set(e.bowlerId, b);
          const rank = ranked.indexOf(e.bowlerId) + 1;
          const rb = rankBalls.get(rank) ?? [0, 0, 0]; rb[ph]! += 1; rankBalls.set(rank, rb);
        }
      }
    }
  }
  const bowlers = [...balls.keys()].map((id) => byId.get(id)!).sort((a, b) => rating(a) - rating(b) || (a.playerId < b.playerId ? -1 : 1));
  const share = (v: number[]): Record<string, number> => { const t = v.reduce((a, b) => a + b, 0); return { overs: +(t / 6).toFixed(1), ...Object.fromEntries(PHASES.map((p, n) => [p, +((100 * v[n]!) / t).toFixed(1)])) }; };
  const quarters = [0, 1, 2, 3].map((q) => {
    const members = bowlers.slice(Math.floor((q * bowlers.length) / 4), Math.floor(((q + 1) * bowlers.length) / 4));
    const v = [0, 0, 0];
    for (const p of members) balls.get(p.playerId)!.forEach((x, n) => (v[n]! += x));
    return { quarter: ["lowest", "second", "third", "highest"][q], bowlers: members.length, ratingRange: [rating(members[0]!), rating(members.at(-1)!)], ...share(v) };
  });
  const byRank = [...rankBalls.keys()].sort((a, b) => a - b).map((rank): Record<string, number> => ({ rankInEleven: rank, ...share(rankBalls.get(rank)!) }));
  const deathOversByRank = byRank.map((r) => ({ rank: r.rankInEleven!, deathOversPerInnings: +((r.overs! * r.death!) / 100 / sessions.reduce((a, s) => a + s.core.innings.filter(Boolean).length, 0)).toFixed(2) }));
  return {
    captain: label,
    policyIdsReported: [...policyIds],
    bowlersWhoBowled: bowlers.length,
    quarters,
    byRankInEleven: byRank,
    deathOversByRank,
    economy: Object.fromEntries(PHASES.map((p, n) => [p, +((runs[n]! * 6) / legal[n]!).toFixed(2)])),
    meanFirstInningsRuns: +(firstInningsRuns / sessions.length).toFixed(1),
    eventHashes: sessions.map((s) => s.lastEventHash),
  };
}

function wilson(k: number, n: number) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(100 * (centre - half)).toFixed(1), +(100 * (centre + half)).toFixed(1)];
}

function headToHead() {
  let wins = 0, losses = 0, other = 0;
  for (const raw of corpus.cases) {
    for (const side of [0, 1]) {
      const { session, teams } = play(raw, (t, ts) => (t === ts[side] ? adviseT20Captain : adviseV3));
      const winner = (session.core.result as { winnerTeamId?: string | null } | null)?.winnerTeamId ?? null;
      if (!winner) other += 1; else if (winner === teams[side]) wins += 1; else losses += 1;
    }
  }
  return { matches: wins + losses + other, codeCaptainWins: wins, v3Wins: losses, tiesOrNoResult: other, codeCaptainWinPercentOfDecided: +((100 * wins) / (wins + losses)).toFixed(1), interval95: wilson(wins, wins + losses) };
}

// The in-script steps must reproduce apps/batch tacticalT20Step exactly.
for (const raw of corpus.cases.slice(0, 5)) {
  if (play(raw, () => adviseT20Captain).session.lastEventHash !== play(raw, () => adviseT20Captain, true).session.lastEventHash) throw new Error("STEP_COPY_DIFFERS");
}
const captain = deployment(adviseT20Captain, "adviseT20Captain at this revision");
const v3 = deployment(adviseV3, "captain V3 bowler choice (copy in this script)");
const identical = captain.eventHashes.every((h, n) => h === v3.eventHashes[n]);
const strip = (d: typeof captain) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "eventHashes"));
const output = {
  version: "LC_PAVILION_CAPTAIN_DEATH_OVERS_MEASURE_V1",
  model: "synthetic-alpha-01",
  corpus: "100-seed Pass 07B T20 corpus, suggested elevens, both sides on the captain",
  codeCaptainIdenticalToV3Copy: identical,
  captain: strip(captain),
  v3: strip(v3),
  headToHead: process.argv.includes("--no-h2h") || identical ? null : headToHead(),
};
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (file) writeFileSync(file, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
