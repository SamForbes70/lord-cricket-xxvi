/**
 * Stage C research slice C1: the game's own deliveries on current main, in the same column layout as
 * scripts/stage-c/c1-real-extract.py, so scripts/stage-c/c1-analyse.py computes both sides with one code path.
 *
 * Set-up: the frozen 100-seed Pass 07B corpus (tests/fixtures/t20/seed_corpus.json), each side the suggested eleven
 * (`suggestedEleven`, packages/data) and both sides driven by the tactical captain (`tacticalT20Step`,
 * apps/batch/src/tactical-match.ts). Repeat 0 uses the corpus seeds as frozen; repeat r > 0 appends `-c1r<r>` to each
 * seed (research only: the corpus file and its seeds are not changed). Model `synthetic-alpha-01`, unchanged.
 * Deterministic: the same command gives the same file. Read-only: no game file is changed.
 *
 *   node --import tsx scripts/stage-c/c1-game-balls.ts <output.json> [repeats=10] [firstRepeat=0]
 *
 * Repeats firstRepeat .. firstRepeat+repeats-1 are played, so several processes can share the work.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, validateT20MatchSetup, type T20Session,
} from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalT20Step } from "../../apps/batch/src/tactical-match.js";

type Delivery = {
  type: string; inningsIndex: number; strikerId: string; nonStrikerId: string; bowlerId: string; legalBall: boolean;
  batRuns: number; extras: { wides: number; noBalls: number; byes: number; legByes: number };
  dismissal: { kind: string; playerId: string } | null;
};
const KIND: Record<string, string> = {
  BOWLED: "bowled", LBW: "lbw", CAUGHT: "caught", RUN_OUT: "run out", STUMPED: "stumped", HIT_WICKET: "hit wicket",
};
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: { seed: string; caseId: string }[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const out = process.argv[2];
const repeats = Number(process.argv[3] ?? 10);
const first = Number(process.argv[4] ?? 0);
if (!out || !Number.isInteger(repeats) || repeats < 1 || !Number.isInteger(first) || first < 0) throw new Error("usage: c1-game-balls.ts <output.json> [repeats]");

const cols: Record<string, (string | number | boolean)[]> = Object.fromEntries(
  ["match", "inn", "over", "batter", "nonStriker", "bowler", "pos", "nsPos", "batRuns", "wides", "noballs", "byes", "legbyes", "out", "outKind", "battingTeam"]
    .map((k) => [k, []]));
const selected = new Set<string>();
const started = Date.now();
for (let r = first; r < first + repeats; r += 1) {
  for (const raw of corpus.cases) {
    const seeded = r === 0 ? raw : { ...raw, seed: `${raw.seed}-c1r${r}` };
    const request = createT20CorpusRequest(seeded, base, world as never) as { selectedTeams: { teamId: string }[] };
    request.selectedTeams = request.selectedTeams.map((s) => ({
      teamId: s.teamId,
      ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
    }));
    for (const s of request.selectedTeams as unknown as { playerIds: string[] }[]) s.playerIds.forEach((id) => selected.add(id));
    let session: T20Session = createT20Session(validateT20MatchSetup(request, bytes, manifest));
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 3000) throw new Error("NO_PROGRESS");
      session = executeT20Command(session, tacticalT20Step(session)).session;
    }
    const matchId = `${raw.caseId}-r${r}`;
    const legal = [0, 0], order: Map<string, number>[] = [new Map(), new Map()];
    for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex > 1) continue;
      const o = order[e.inningsIndex]!;
      for (const id of [e.strikerId, e.nonStrikerId]) if (!o.has(id)) o.set(id, o.size + 1);
      cols.match!.push(matchId); cols.inn!.push(e.inningsIndex); cols.over!.push(Math.floor(legal[e.inningsIndex]! / 6));
      cols.batter!.push(e.strikerId); cols.nonStriker!.push(e.nonStrikerId); cols.bowler!.push(e.bowlerId);
      cols.pos!.push(o.get(e.strikerId)!); cols.nsPos!.push(o.get(e.nonStrikerId)!); cols.batRuns!.push(e.batRuns);
      cols.wides!.push(e.extras.wides); cols.noballs!.push(e.extras.noBalls); cols.byes!.push(e.extras.byes); cols.legbyes!.push(e.extras.legByes);
      cols.out!.push(e.dismissal?.playerId ?? ""); cols.outKind!.push(e.dismissal ? KIND[e.dismissal.kind]! : "");
      cols.battingTeam!.push(session.core.innings[e.inningsIndex]!.innings.battingTeamId);
      if (e.legalBall) legal[e.inningsIndex]! += 1;
    }
  }
  console.error(`repeat ${r} done, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
const players = [...selected].sort().map((id) => {
  const p = byId.get(id)!, s = p.skills.T20;
  return {
    playerId: id, role: p.role, bowlingStyle: p.bowlingStyle,
    battingScore: s.timing + s.power + s.defence + s.rotation, bowlingScore: s.control + s.movement + s.variation,
    T20: { defence: s.defence, timing: s.timing, power: s.power, rotation: s.rotation, vsPace: s.vsPace, vsSpin: s.vsSpin, control: s.control, movement: s.movement, variation: s.variation },
  };
});
writeFileSync(out, JSON.stringify({
  version: "LC_STAGE_C_C1_GAME_BALLS_V1", model: "synthetic-alpha-01", repeats, firstRepeat: first,
  setUp: "frozen 100-seed corpus, suggested elevens, tactical captain both sides; repeat r>0 seeds suffixed -c1r<r>",
  players, columns: cols,
}));
console.error(`wrote ${cols.match!.length} deliveries`);
