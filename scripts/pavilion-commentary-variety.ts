/**
 * Project Pavilion P07: how repetitive the commentary reads, on the 100-match T20 corpus (fixture autopilot).
 * For each template family, the share of lines whose template was also used for one of the previous three lines
 * of that family in the same match (the "repeat rate"), and the number of templates seen. Also checks every feed
 * against the commentary contract.
 *   node --import tsx scripts/pavilion-commentary-variety.ts
 */
import { readFileSync } from "node:fs";
import { validateT20MatchSetup, createT20CorpusRequest, runFixtureT20 } from "@lcxxvi/simulation";
import { projectMatchCommentary, type CommittedCommentarySourceEvent } from "@lcxxvi/projections";
import { MatchCommentaryFeedSchema } from "@lcxxvi/contracts";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8"));
const names = Object.fromEntries((world.players as { playerId: string; name: string }[]).map((p) => [p.playerId, p.name]));
const teams = Object.fromEntries((world.teams as { teamId: string; name: string }[]).map((t) => [t.teamId, t.name]));
const families: Record<string, { lines: number; repeats: number; templates: Set<string> }> = {};
let lines = 0, repeats = 0;
for (const raw of corpus.cases) {
  const game = runFixtureT20(validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest));
  const feed = projectMatchCommentary({ format: "T20", events: game.events as unknown as CommittedCommentarySourceEvent[], playerNames: names, teamNames: teams, teamIds: (raw as { teamIds: [string, string] }).teamIds });
  MatchCommentaryFeedSchema.parse(feed);
  const recent: Record<string, string[]> = {};
  for (const e of feed.entries) {
    const f = (families[e.templateFamily] ??= { lines: 0, repeats: 0, templates: new Set() });
    const prior = (recent[e.templateFamily] ??= []);
    const repeat = prior.slice(-3).includes(e.templateId);
    f.lines += 1; f.templates.add(e.templateId); lines += 1;
    if (repeat) { f.repeats += 1; repeats += 1; }
    prior.push(e.templateId);
  }
}
const top = Object.entries(families).sort((a, b) => b[1].lines - a[1].lines).slice(0, 8)
  .map(([family, f]) => ({ family, lines: f.lines, templates: f.templates.size, repeatRate: +(f.repeats / f.lines).toFixed(3) }));
console.log(JSON.stringify({ contract: "every feed parses with MatchCommentaryFeedSchema", lines, repeatRate: +(repeats / lines).toFixed(3), top }, null, 2));
