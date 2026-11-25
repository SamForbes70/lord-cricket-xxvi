/**
 * Stage C research slice C1: the game's skill slope measured directly (a controlled experiment, not a regression).
 *
 * For each condition, every player in both elevens has the named skills set to one level inside an in-memory copy of
 * the validated match set-up, swapped into the session after it is created (research only; the world pack, its hash and the corpus are not changed and nothing is
 * persisted). Batting conditions set timing, power, defence, rotation, vsPace and vsSpin; bowling conditions set
 * control, movement and variation; the other group is held at 50. Elevens are `suggestedEleven` and both sides use
 * the tactical captain (`tacticalT20Step`), as in c1-game-balls.ts. With every player alike, the captain's choices no
 * longer depend on skill, so differences between conditions are the model's own response to the rating.
 *
 *   node --import tsx scripts/stage-c/c1-game-dose-response.ts <output.json> [condition ...]
 * Conditions: bat30 bat50 bat70 bowl30 bowl70 var30 var70 (bat50 is also bowl50). Add --model=calibrated-t20-01 for
 * the Stage C research model. Deterministic.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, validateT20ResearchMatchSetup, validateT20MatchSetup, type T20Session,
} from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalT20Step } from "../../apps/batch/src/tactical-match.js";

type Delivery = { type: string; inningsIndex: number; strikerId: string; legalBall: boolean; batRuns: number; boundary: string; extras: { wides: number }; dismissal: { playerId: string } | null };
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
const BAT = ["timing", "power", "defence", "rotation", "vsPace", "vsSpin"] as const;
const BOWL = ["control", "movement", "variation"] as const;
const CONDITIONS: Record<string, { bat: number; bowl: number; variation?: number }> = {
  bat30: { bat: 30, bowl: 50 }, bat50: { bat: 50, bowl: 50 }, bat70: { bat: 70, bowl: 50 },
  bowl30: { bat: 50, bowl: 30 }, bowl70: { bat: 50, bowl: 70 },
  // Stage C: variation alone (control and movement held at 50), for the wicket-taking against economy trade-off.
  var30: { bat: 50, bowl: 50, variation: 30 }, var70: { bat: 50, bowl: 50, variation: 70 },
};

function setSkills(node: unknown, level: { bat: number; bowl: number; variation?: number }): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const skills = o.skills as Record<string, Record<string, number>> | undefined;
  if (skills && skills.T20 && typeof skills.T20.timing === "number") {
    for (const k of BAT) skills.T20[k] = level.bat;
    for (const k of BOWL) skills.T20[k] = level.bowl;
    if (level.variation !== undefined) skills.T20.variation = level.variation;
  }
  for (const v of Object.values(o)) setSkills(v, level);
}

function run(name: string) {
  const level = CONDITIONS[name]!;
  let faced = 0, runs = 0, outs = 0, fours = 0, dots = 0, inningsRuns = 0, innings = 0, inningsWkts = 0;
  for (const raw of corpus.cases) {
    const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
    request.selectedTeams = request.selectedTeams.map((s) => ({
      teamId: s.teamId,
      ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
    }));
    // The engine accepts only a verified, frozen set-up, so the session is created from the real one and its set-up
    // reference is then replaced by an edited copy, in memory only, for this experiment.
    const created = createT20Session(setupFor(request));
    const setup = JSON.parse(JSON.stringify(created.setup));
    setSkills(setup, level);
    let session: T20Session = { ...created, setup };
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 3000) throw new Error("NO_PROGRESS");
      session = executeT20Command(session, tacticalT20Step(session)).session;
    }
    for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex > 1) continue;
      if (e.inningsIndex === 0) { inningsRuns += e.batRuns; if (e.dismissal) inningsWkts += 1; }
      if (e.extras.wides > 0) continue;
      faced += 1; runs += e.batRuns;
      if (e.dismissal?.playerId === e.strikerId) outs += 1;
      if (e.boundary !== "NONE") fours += 1;
      if (e.batRuns === 0) dots += 1;
    }
    innings += 1;
  }
  const r = {
    condition: name, battingSkills: level.bat, bowlingSkills: level.bowl, matches: innings, ballsFaced: faced,
    runsPerBall: runs / faced, strikerDismissalPerBall: outs / faced, boundaryPerBall: fours / faced, dotPerBall: dots / faced,
    firstInningsBatRuns: inningsRuns / innings, firstInningsWickets: inningsWkts / innings,
  };
  console.error(JSON.stringify(r));
  return r;
}

const out = ARGS[2];
if (!out) throw new Error("usage: c1-game-dose-response.ts <output.json> [condition ...]");
const chosen = ARGS.slice(3).length ? ARGS.slice(3) : Object.keys(CONDITIONS);
writeFileSync(out, JSON.stringify({
  version: "LC_STAGE_C_C1_DOSE_RESPONSE_V1", model: MODEL,
  setUp: "frozen 100-seed corpus, suggested elevens, tactical captain both sides, every player's batting or bowling skills set to one level in an in-memory set-up copy",
  results: chosen.map(run),
}, null, 1) + "\n");
