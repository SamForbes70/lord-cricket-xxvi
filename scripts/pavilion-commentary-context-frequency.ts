/**
 * Project Pavilion P07: how often each over-context line fires across the 100-match T20 corpus (fixture autopilot).
 *   node --import tsx scripts/pavilion-commentary-context-frequency.ts
 * In-model measurement only.
 */
import { readFileSync } from "node:fs";
import { validateT20MatchSetup, createT20CorpusRequest, runFixtureT20 } from "@lcxxvi/simulation";
import { projectMatchCommentary, type CommittedCommentarySourceEvent } from "@lcxxvi/projections";
const root = "";
const bytes = readFileSync(root + "packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync(root + "packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync(root + "tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync(root + "tests/fixtures/t20/seed_corpus.json", "utf8"));
const names = Object.fromEntries((world.players as { playerId: string; name: string }[]).map((p) => [p.playerId, p.name]));
const teams = Object.fromEntries((world.teams as { teamId: string; name: string }[]).map((t) => [t.teamId, t.name]));
let overs = 0; const slots: Record<string, number> = {}; const examples: Record<string, string> = {};
for (const raw of corpus.cases) {
  const setup = validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest);
  const game = runFixtureT20(setup);
  const feed = projectMatchCommentary({ format: "T20", events: game.events as unknown as CommittedCommentarySourceEvent[], playerNames: names, teamNames: teams, teamIds: (raw as { teamIds: [string, string] }).teamIds });
  for (const e of feed.entries) if (e.category === "OVER") {
    overs += 1;
    const s = e.factSlots.find((f) => ["bowledOut","collapse","deathOvers","askingRate","expensiveOver","boundaryDrought"].includes(f.slot));
    if (s) { slots[s.slot] = (slots[s.slot] ?? 0) + 1; examples[s.slot] ??= e.text; }
  }
}
const withContext = Object.values(slots).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ overs, withContext, share: +(withContext / overs).toFixed(3), slots, examples }, null, 2));
