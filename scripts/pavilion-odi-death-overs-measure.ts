/**
 * Project Pavilion: does the one-day tactical captain (LC_ODI_TACTICAL_CAPTAIN_V2) leave its weakest bowlers the last
 * overs, as T20 captain V3 did? (docs/pavilion/CAPTAIN_V4_DEATH_OVERS.md)
 *
 * The frozen 100-seed T20 corpus's seeds, team pairs and grounds, each on the one-day template
 * (tests/fixtures/world/odi-valid-setup.json), suggested ODI elevens, both sides on apps/batch tacticalODIStep.
 * Reported: the share of each bowler-rating quarter's overs, and of each rank within the eleven, in overs 1 to 10,
 * 11 to 40 and 41 to 50, and economy by phase. Rating = control + movement + variation (ODI skills). Quarters are of
 * the distinct bowlers who bowl, ranked by rating (ties by playerId). Read-only and deterministic.
 *
 *   node --import tsx scripts/pavilion-odi-death-overs-measure.ts [output.json] [seeds]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import { createODISession, executeODICommand, validateODIMatchSetup, type ODISession } from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalODIStep } from "../apps/batch/src/tactical-match.js";

type Player = WorldPack["players"][number];
type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; bowlerId: string; extras: Record<string, number> };
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/odi-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: { caseId: string; seed: string; teamIds: string[]; groundId: string }[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const rating = (p: Player) => p.skills.ODI.control + p.skills.ODI.movement + p.skills.ODI.variation;
const PHASES = ["overs1to10", "overs11to40", "overs41to50"] as const;
const phaseOf = (before: number) => (before < 60 ? 0 : before < 240 ? 1 : 2);
const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100);

const balls = new Map<string, number[]>(), rankBalls = new Map<number, number[]>(), runs = [0, 0, 0], legal = [0, 0, 0];
for (const c of corpus.cases.slice(0, seeds)) {
  const request = structuredClone(template);
  request.setup = { ...request.setup, gameId: `g-odi-${c.caseId}`, matchId: `m-odi-${c.caseId}`, seed: c.seed, teamIds: c.teamIds, groundId: c.groundId };
  request.selectedTeams = c.teamIds.map((teamId) => ({ teamId, ...suggestedEleven(world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!), "ODI") }));
  let session: ODISession = createODISession(validateODIMatchSetup(request, bytes, manifest));
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 6000) throw new Error("NO_PROGRESS");
    session = executeODICommand(session, tacticalODIStep(session)).session;
  }
  const events = (session.events as unknown as { payload?: { event?: Delivery } }[]).map((r) => r.payload?.event).filter((e): e is Delivery => e?.type === "DELIVERY_RECORDED");
  for (const inningsIndex of [0, 1]) {
    const ledger = session.core.innings[inningsIndex];
    if (!ledger) continue;
    const team = session.setup.teams.find((t) => t.teamId === ledger.innings.bowlingTeamId)!;
    const ranked = team.xi.filter((p) => p.bowlingStyle !== null && p.playerId !== team.keeperId).map((p) => byId.get(p.playerId)!)
      .sort((a, b) => rating(b) - rating(a) || (a.playerId < b.playerId ? -1 : 1)).map((p) => p.playerId);
    let before = 0;
    for (const e of events.filter((d) => d.inningsIndex === inningsIndex)) {
      const ph = phaseOf(before);
      runs[ph]! += e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
      if (!e.legalBall) continue;
      legal[ph]! += 1; before += 1;
      const b = balls.get(e.bowlerId) ?? [0, 0, 0]; b[ph]! += 1; balls.set(e.bowlerId, b);
      const rank = ranked.indexOf(e.bowlerId) + 1;
      const rb = rankBalls.get(rank) ?? [0, 0, 0]; rb[ph]! += 1; rankBalls.set(rank, rb);
    }
  }
}
const share = (v: number[]) => { const t = v.reduce((a, b) => a + b, 0); return { overs: +(t / 6).toFixed(1), ...Object.fromEntries(PHASES.map((p, n) => [p, +((100 * v[n]!) / t).toFixed(1)])) }; };
const bowlers = [...balls.keys()].map((id) => byId.get(id)!).sort((a, b) => rating(a) - rating(b) || (a.playerId < b.playerId ? -1 : 1));
const output = {
  version: "LC_PAVILION_ODI_DEATH_OVERS_MEASURE_V1",
  model: "synthetic-alpha-01",
  captain: "LC_ODI_TACTICAL_CAPTAIN_V2 (apps/batch tacticalODIStep), both sides",
  matches: Math.min(seeds, corpus.cases.length),
  quarters: [0, 1, 2, 3].map((q) => {
    const members = bowlers.slice(Math.floor((q * bowlers.length) / 4), Math.floor(((q + 1) * bowlers.length) / 4));
    const v = [0, 0, 0];
    for (const p of members) balls.get(p.playerId)!.forEach((x, n) => (v[n]! += x));
    return { quarter: ["lowest", "second", "third", "highest"][q], bowlers: members.length, ratingRange: [rating(members[0]!), rating(members.at(-1)!)], ...share(v) };
  }),
  byRankInEleven: [...rankBalls.keys()].sort((a, b) => a - b).map((rank) => ({ rankInEleven: rank, ...share(rankBalls.get(rank)!) })),
  economy: Object.fromEntries(PHASES.map((p, n) => [p, +((runs[n]! * 6) / legal[n]!).toFixed(2)])),
};
const file = process.argv.slice(2).find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
if (file) writeFileSync(file, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
