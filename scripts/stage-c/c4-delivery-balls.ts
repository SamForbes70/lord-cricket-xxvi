/**
 * Stage C slice C4: the game's deliveries with the delivery-model branch that produced each one, for the dot and
 * wicket decomposition (scripts/stage-c/c4-analyse.py). RESEARCH ONLY: no game file is changed, nothing is persisted.
 *
 * Set-up as scripts/stage-c/c1-game-balls.ts: the frozen 100-seed Pass 07B corpus, suggested elevens, the tactical
 * captain (`tacticalT20Step`) on both sides. Repeat 0 uses the corpus seeds as frozen; repeat r > 0 appends `-c1r<r>`.
 *
 * Each delivery records the striker's aggression and intent at the time (the batting plan in force when the ADVANCE
 * command ran), the bat-contact branch (`trajectory`: GROUND, AERIAL, EDGE, or none for a miss, pad or hit wicket),
 * the field outcome (STOP, CATCH, DROP, NONE, RUN_OUT), runs and dismissal kind.
 *
 *   node --import tsx scripts/stage-c/c4-delivery-balls.ts <output.json> [repeats=5] [firstRepeat=0]
 *        [--model=calibrated-t20-01|synthetic-alpha-01] [--aggression=0..4] [--length=GOOD|FULL|YORKER]
 *        [--effort=CONSERVE|NORMAL|MAXIMUM]
 *
 * `--aggression=k` replaces every batting plan the captain sets with aggression k and intent NORMAL (both sides,
 * every ball), for the aggression trade-off. C5: `--length` and `--effort` likewise hold that part of every bowling
 * plan (both sides, every ball; the other part stays the captain's), for the bowling-plan levers. Each delivery also
 * records the plan's intended length and effort. Deterministic: the same command gives the same file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, validateT20ResearchMatchSetup, validateT20MatchSetup, type T20Session,
} from "@lcxxvi/simulation";
import type { T20Command, WorldPack } from "@lcxxvi/contracts";
import { adviseT20Captain } from "@lcxxvi/ai";
import { publicT20CaptainView, tacticalT20Step } from "../../apps/batch/src/tactical-match.js";

type Delivery = {
  type: string; inningsIndex: number; strikerId: string; legality: string; legalBall: boolean; batRuns: number;
  extras: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
  boundary: string; trajectory: string | null; fieldOutcome: string; executedLength: string | null;
  dismissal: { kind: string; playerId: string } | null;
};
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: { seed: string; caseId: string }[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const MODEL = process.argv.find((a) => a.startsWith("--model="))?.slice(8) ?? "calibrated-t20-01";
if (MODEL !== "synthetic-alpha-01" && MODEL !== "calibrated-t20-01") throw new Error(`unknown model ${MODEL}`);
const FORCED = process.argv.find((a) => a.startsWith("--aggression="))?.slice(13);
const forced = FORCED === undefined ? null : Number(FORCED);
if (forced !== null && !(Number.isInteger(forced) && forced >= 0 && forced <= 4)) throw new Error("aggression must be 0 to 4");
const FORCED_LENGTH = process.argv.find((a) => a.startsWith("--length="))?.slice(9);
const FORCED_EFFORT = process.argv.find((a) => a.startsWith("--effort="))?.slice(9);
if (FORCED_LENGTH !== undefined && !["GOOD", "FULL", "YORKER"].includes(FORCED_LENGTH)) throw new Error("length must be GOOD, FULL or YORKER");
if (FORCED_EFFORT !== undefined && !["CONSERVE", "NORMAL", "MAXIMUM"].includes(FORCED_EFFORT)) throw new Error("effort must be CONSERVE, NORMAL or MAXIMUM");
const forcedPlan = { ...(FORCED_LENGTH ? { length: FORCED_LENGTH } : {}), ...(FORCED_EFFORT ? { effort: FORCED_EFFORT } : {}) };
const ARGS = process.argv.filter((a) => !a.startsWith("--"));
const setupFor = (request: unknown) => MODEL === "calibrated-t20-01"
  ? validateT20ResearchMatchSetup(request, bytes, manifest, "calibrated-t20-01")
  : validateT20MatchSetup(request, bytes, manifest);
const out = ARGS[2];
const repeats = Number(ARGS[3] ?? 5);
const first = Number(ARGS[4] ?? 0);
if (!out || !Number.isInteger(repeats) || repeats < 1 || !Number.isInteger(first) || first < 0) throw new Error("usage: c4-delivery-balls.ts <output.json> [repeats] [firstRepeat]");

const INTENT: Record<string, number> = { NORMAL: 0, ROTATE: 1, PROTECT: 2 };
const cols: Record<string, (string | number)[]> = Object.fromEntries(
  ["match", "inn", "legalBefore", "aggression", "intent", "legality", "trajectory", "fieldOutcome", "length",
    "batRuns", "extras", "boundary", "outKind", "plannedLength", "effort"].map((k) => [k, []]));

function step(session: T20Session): T20Command {
  const command = planStep(session);
  if (forced === null || command.kind !== "SET_BATTING_PLAN") return command;
  const striker = command.payload.playerId, plan = session.core.battingPlans[striker];
  if (plan?.aggression !== forced || plan?.intent !== "NORMAL")
    return { ...command, payload: { ...command.payload, aggression: forced, intent: "NORMAL" } } as T20Command;
  // The forced plan is already set: let the captain make its other choices as if its own plan were in force.
  const advice = adviseT20Captain(publicT20CaptainView(session)!);
  const view = { ...session, core: { ...session.core, battingPlans: { ...session.core.battingPlans,
    [striker]: { aggression: advice.aggression, intent: advice.battingIntent } } } } as T20Session;
  return tacticalT20Step(view);
}

/** C5: the captain's step with the forced parts of the bowling plan held (no-op without --length or --effort). */
function planStep(session: T20Session): T20Command {
  const command = tacticalT20Step(session);
  if (!Object.keys(forcedPlan).length || command.kind !== "SET_BOWLING_PLAN") return command;
  const want = { ...command.payload, ...forcedPlan } as typeof command.payload;
  const current = session.core.bowlingPlan!;
  if (current.length !== want.length || current.effort !== want.effort) return { ...command, payload: want } as T20Command;
  // The forced plan is already set: let the captain make its other choices as if its own plan were in force.
  const advice = adviseT20Captain(publicT20CaptainView(session)!);
  return tacticalT20Step({ ...session, core: { ...session.core, bowlingPlan: { ...current, length: advice.bowlingLength, effort: advice.bowlingEffort } } } as T20Session);
}

const started = Date.now();
for (let r = first; r < first + repeats; r += 1) {
  for (const raw of corpus.cases) {
    const seeded = r === 0 ? raw : { ...raw, seed: `${raw.seed}-c1r${r}` };
    const request = createT20CorpusRequest(seeded, base, world as never) as { selectedTeams: { teamId: string }[] };
    request.selectedTeams = request.selectedTeams.map((s) => ({
      teamId: s.teamId,
      ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
    }));
    let session: T20Session = createT20Session(setupFor(request));
    const matchId = `${raw.caseId}-r${r}`;
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 3000) throw new Error("NO_PROGRESS");
      const plans = session.core.battingPlans, bowlingPlan = session.core.bowlingPlan;
      const before = session.events.length;
      const legal = session.core.innings.map((l) => l.innings.legalBalls);
      session = executeT20Command(session, step(session)).session;
      for (const record of session.events.slice(before) as unknown as { payload?: { event?: Delivery } }[]) {
        const e = record.payload?.event;
        if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex > 1) continue;
        const plan = plans[e.strikerId];
        const ex = e.extras;
        cols.match!.push(matchId); cols.inn!.push(e.inningsIndex); cols.legalBefore!.push(legal[e.inningsIndex] ?? 0);
        cols.aggression!.push(plan?.aggression ?? 2); cols.intent!.push(INTENT[plan?.intent ?? "NORMAL"]!);
        cols.legality!.push(e.legality); cols.trajectory!.push(e.trajectory ?? "NONE"); cols.fieldOutcome!.push(e.fieldOutcome);
        cols.length!.push(e.executedLength ?? ""); cols.batRuns!.push(e.batRuns);
        cols.extras!.push(ex.wides + ex.noBalls + ex.byes + ex.legByes + ex.penalties);
        cols.boundary!.push(e.boundary); cols.outKind!.push(e.dismissal?.kind ?? "");
        cols.plannedLength!.push(bowlingPlan?.length ?? ""); cols.effort!.push(bowlingPlan?.effort ?? "");
        if (e.legalBall) legal[e.inningsIndex] = (legal[e.inningsIndex] ?? 0) + 1;
      }
    }
  }
  console.error(`repeat ${r} done, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
writeFileSync(out, JSON.stringify({
  version: "LC_STAGE_C_C4_DELIVERY_BALLS_V2", model: MODEL, forcedAggression: forced, forcedPlan, repeats, firstRepeat: first,
  setUp: "frozen 100-seed corpus, suggested elevens, tactical captain both sides; repeat r>0 seeds suffixed -c1r<r>",
  columns: cols,
}));
console.error(`wrote ${cols.match!.length} deliveries`);
