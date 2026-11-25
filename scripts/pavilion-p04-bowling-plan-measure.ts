/**
 * Pavilion P04 (owner direction of 25 November 2026, item 3): does the computer captain run out of eligible bowlers?
 *
 * Plays the frozen 100-seed T20 corpus with elevens that carry exactly five bowling-capable players (the fewest the
 * rules allow), both sides on the tactical captain (apps/batch tacticalT20Step), and counts matches that stop with
 * LC_T20_NO_ELIGIBLE_BOWLER. Read-only.
 *
 *   node --import tsx scripts/pavilion-p04-bowling-plan-measure.ts [output.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isBowlingCapable } from "@lcxxvi/data";
import { createT20CorpusRequest, createT20Session, executeT20Command, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalT20Step } from "../apps/batch/src/tactical-match.js";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
type P = WorldPack["players"][number];
const s = (p: P) => p.skills.T20;
const byIdOrder = (a: P, b: P) => (a.playerId < b.playerId ? -1 : 1);

/** Keeper, the five best bowling-capable players, the five best batters who cannot bowl. */
function fiveBowlerEleven(teamId: string) {
  const squad = world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!);
  const keeper = squad.find((p) => p.role === "KEEPER")!;
  const bowlers = squad.filter(isBowlingCapable).sort((a, b) => s(b).control + s(b).movement - s(a).control - s(a).movement || byIdOrder(a, b)).slice(0, 5);
  const batters = squad.filter((p) => p !== keeper && !isBowlingCapable(p)).sort((a, b) => s(b).timing + s(b).power - s(a).timing - s(a).power || byIdOrder(a, b)).slice(0, 5);
  const xi = [keeper, ...batters, ...bowlers];
  return { teamId, playerIds: xi.map((p) => p.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
}

let completed = 0, stranded = 0;
const strandedCases: string[] = [];
for (const raw of corpus.cases) {
  const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[]; setup: { matchId: string } };
  request.selectedTeams = request.selectedTeams.map((t) => fiveBowlerEleven(t.teamId));
  let session: T20Session = createT20Session(validateT20MatchSetup(request, bytes, manifest));
  try {
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 2000) throw new Error("NO_PROGRESS");
      session = executeT20Command(session, tacticalT20Step(session)).session;
    }
    completed += 1;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("NO_ELIGIBLE_BOWLER")) throw error;
    stranded += 1;
    strandedCases.push(request.setup.matchId);
  }
}
const output = { version: "LC_PAVILION_P04_BOWLING_PLAN_MEASURE_V1", corpus: "100-seed Pass 07B T20 corpus", elevens: "five bowling-capable players each", captain: "tacticalT20Step, both sides", completed, stranded, strandedCases };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output));
