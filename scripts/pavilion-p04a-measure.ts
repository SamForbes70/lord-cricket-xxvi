/**
 * Project Pavilion P04 stage A: first-innings scoring with the suggested eleven (`suggestedEleven`) on the frozen
 * 100-seed Pass 07B corpus, against the corpus's own eleven. Read-only measurement; the frozen corpus selector is not
 * changed.
 *
 *   node --import tsx scripts/pavilion-p04a-measure.ts [output.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep, validateT20MatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalT20Step } from "../apps/batch/src/tactical-match.js";

type Delivery = { type: string; inningsIndex: number; legalBall: boolean; batRuns: number; boundary: string; dismissal: unknown; extras: Record<string, number> };
const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function run(eleven: "corpus" | "suggested", captain: boolean) {
  const runs: number[] = [], wickets: number[] = [];
  let legal = 0, allOut = 0, dots = 0, boundaries = 0;
  for (const raw of corpus.cases) {
    const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
    if (eleven === "suggested")
      request.selectedTeams = request.selectedTeams.map((s) => ({
        teamId: s.teamId,
        ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
      }));
    let session: T20Session = createT20Session(validateT20MatchSetup(request, bytes, manifest));
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 2000) throw new Error("NO_PROGRESS");
      session = executeT20Command(session, captain ? tacticalT20Step(session) : fixtureAutopilotStep(session)).session;
    }
    let r = 0, w = 0;
    for (const record of session.events as unknown as { payload?: { event?: Delivery } }[]) {
      const e = record.payload?.event;
      if (!e || e.type !== "DELIVERY_RECORDED" || e.inningsIndex !== 0) continue;
      r += e.batRuns + Object.values(e.extras).reduce((a, b) => a + b, 0);
      if (e.dismissal) w += 1;
      if (e.legalBall) {
        legal += 1;
        if (!e.dismissal && e.batRuns === 0 && Object.values(e.extras).every((x) => x === 0)) dots += 1;
        if (e.boundary === "FOUR" || e.boundary === "SIX") boundaries += 1;
      }
    }
    runs.push(r); wickets.push(w); if (w === 10) allOut += 1;
  }
  return {
    setUp: `${eleven} eleven, ${captain ? "tactical captain" : "fixture autopilot"}`,
    runs: +mean(runs).toFixed(1), wickets: +mean(wickets).toFixed(2), allOutOf100: allOut,
    dotPercent: +((100 * dots) / legal).toFixed(1), boundaryPercent: +((100 * boundaries) / legal).toFixed(1),
  };
}

const output = {
  version: "LC_PAVILION_P04A_MEASURE_V1",
  model: "synthetic-alpha-01",
  innings: "first innings of the 100-seed Pass 07B corpus",
  results: [run("corpus", false), run("suggested", false), run("corpus", true), run("suggested", true)],
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
