/**
 * Project Pavilion P07: how often each context line (over, wicket, innings) fires across the 100-match T20 corpus
 * (fixture autopilot), and that every commentary feed still satisfies the commentary contract.
 *   node --import tsx scripts/pavilion-commentary-context-frequency.ts
 * In-model measurement only.
 */
import { readFileSync } from "node:fs";
import { validateT20MatchSetup, createT20CorpusRequest, runFixtureT20 } from "@lcxxvi/simulation";
import { projectMatchCommentary, type CommittedCommentarySourceEvent } from "@lcxxvi/projections";
import { MatchCommentaryFeedSchema } from "@lcxxvi/contracts";
const root = "";
const bytes = readFileSync(root + "packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync(root + "packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync(root + "tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync(root + "tests/fixtures/t20/seed_corpus.json", "utf8"));
const names = Object.fromEntries((world.players as { playerId: string; name: string }[]).map((p) => [p.playerId, p.name]));
const teams = Object.fromEntries((world.teams as { teamId: string; name: string }[]).map((t) => [t.teamId, t.name]));
let overs = 0, wickets = 0, inningsEnds = 0; const slots: Record<string, number> = {}; const examples: Record<string, string> = {};
const CONTEXT_SLOTS = ["bowledOut", "collapse", "deathOvers", "askingRate", "expensiveOver", "boundaryDrought", "standBroken", "newBatterTask", "wicketsLeft", "inningsSummary"];
for (const raw of corpus.cases) {
  const setup = validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest);
  const game = runFixtureT20(setup);
  const feed = projectMatchCommentary({ format: "T20", events: game.events as unknown as CommittedCommentarySourceEvent[], playerNames: names, teamNames: teams, teamIds: (raw as { teamIds: [string, string] }).teamIds });
  MatchCommentaryFeedSchema.parse(feed);
  for (const e of feed.entries) {
    if (e.category === "OVER") overs += 1;
    if (e.category === "DISMISSAL") wickets += 1;
    if (e.category === "INNINGS" && e.eventType === "INNINGS_COMPLETED") inningsEnds += 1;
    const s = e.factSlots.find((f) => CONTEXT_SLOTS.includes(f.slot));
    if (s) { slots[s.slot] = (slots[s.slot] ?? 0) + 1; examples[s.slot] ??= e.text; }
  }
}
const overSlots = ["bowledOut", "collapse", "deathOvers", "askingRate", "expensiveOver", "boundaryDrought"];
const wicketSlots = ["standBroken", "newBatterTask", "wicketsLeft"];
const count = (keys: string[]) => keys.reduce((n, k) => n + (slots[k] ?? 0), 0);
console.log(JSON.stringify({
  contract: "every feed parses with MatchCommentaryFeedSchema",
  overs, oversWithContext: count(overSlots), overShare: +(count(overSlots) / overs).toFixed(3),
  wickets, wicketsWithContext: count(wicketSlots), wicketShare: +(count(wicketSlots) / wickets).toFixed(3),
  inningsEnds, inningsWithSummary: slots.inningsSummary ?? 0,
  slots, examples,
}, null, 2));
