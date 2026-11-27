/**
 * Batting policy V3 (captain V6, 27 November 2026): head to head, captain V6 against captain V5.
 * docs/pavilion/BATTING_POLICY_V3.md. Read-only: no game file is changed, nothing is persisted.
 *
 * Each of the 100 frozen corpus seeds (repeat 0, suggested elevens) is played twice, V6 on one side and V5 on the other,
 * then swapped, with the batch step asking before every ball (tacticalT20Step, advance DELIVERY). V5 and V6 differ only
 * in batting (bowler, bowling plan and field are identical; tests/unit/pavilion-batting-policy-v3.test.ts), so each
 * step takes the batting side's captain.
 *
 *   node --import tsx scripts/pavilion-batting-v3-h2h.ts <output.json> [--model=synthetic-alpha-01|calibrated-t20-01] [--candidate=V6|V6B]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { suggestedEleven } from "@lcxxvi/data";
import { createT20CorpusRequest, createT20Session, executeT20Command, validateT20MatchSetup, validateT20ResearchMatchSetup, type T20Session } from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";
import { tacticalT20Step } from "../apps/batch/src/tactical-match.js";
import { captainByName } from "./pavilion-batting-v3-candidates.js";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: { seed: string; caseId: string }[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const opt = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const MODEL = opt("model", "synthetic-alpha-01");
if (MODEL !== "synthetic-alpha-01" && MODEL !== "calibrated-t20-01") throw new Error(`unknown model ${MODEL}`);
const CANDIDATE = opt("candidate", "V6");
const out = process.argv.filter((a) => !a.startsWith("--"))[2];
if (!out) throw new Error("usage: pavilion-batting-v3-h2h.ts <output.json> [--model=...]");
const setupFor = (request: unknown) => MODEL === "calibrated-t20-01"
  ? validateT20ResearchMatchSetup(request, bytes, manifest, "calibrated-t20-01")
  : validateT20MatchSetup(request, bytes, manifest);
const newer = captainByName(CANDIDATE), older = captainByName("V5");

function wilson(k: number, n: number) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(100 * (centre - half)).toFixed(1), +(100 * (centre + half)).toFixed(1)];
}

let newWins = 0, oldWins = 0, other = 0;
const diff: number[] = [];
const started = Date.now();
for (const raw of corpus.cases) {
  for (const side of [0, 1]) {
    const request = createT20CorpusRequest(raw, base, world as never) as { selectedTeams: { teamId: string }[] };
    request.selectedTeams = request.selectedTeams.map((s) => ({
      teamId: s.teamId,
      ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
    }));
    const teams = request.selectedTeams.map((t) => t.teamId);
    let session: T20Session = createT20Session(setupFor(request));
    for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
      if (n > 3000) throw new Error("NO_PROGRESS");
      const ledger = session.core.innings[session.core.activeInningsIndex];
      const battingTeam = ledger?.innings.battingTeamId;
      session = executeT20Command(session, tacticalT20Step(session, { advise: battingTeam === teams[side] ? newer : older })).session;
    }
    const winner = (session.core.result as { winnerTeamId?: string | null } | null)?.winnerTeamId ?? null;
    if (!winner) other += 1; else if (winner === teams[side]) newWins += 1; else oldWins += 1;
    const runs = session.core.innings.map((l) => l.innings.runs);
    const firstBat = session.core.innings[0]!.innings.battingTeamId;
    diff.push(firstBat === teams[side] ? runs[0]! - runs[1]! : runs[1]! - runs[0]!);
  }
}
const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
const sd = Math.sqrt(diff.reduce((a, x) => a + (x - mean) ** 2, 0) / (diff.length - 1));
const half = (1.96 * sd) / Math.sqrt(diff.length);
writeFileSync(out, JSON.stringify({
  version: "LC_PAVILION_BATTING_V3_H2H_V1", model: MODEL, candidate: CANDIDATE, against: "V5", advance: "DELIVERY", matches: diff.length,
  candidateWins: newWins, v5Wins: oldWins, tiesOrNoResult: other,
  candidatePercentOfDecided: +((100 * newWins) / (newWins + oldWins)).toFixed(1), candidatePercentOfDecided95: wilson(newWins, newWins + oldWins),
  meanRunDifferenceCandidateMinusV5: +mean.toFixed(1), meanRunDifference95: [+(mean - half).toFixed(1), +(mean + half).toFixed(1)],
  design: "100 frozen corpus seeds (repeat 0), suggested elevens, each twice: the candidate on one side and V5 on the other, then swapped; each step takes the batting side's captain",
}, null, 2) + "\n");
console.error(`wrote ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
