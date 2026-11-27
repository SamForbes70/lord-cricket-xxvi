/**
 * CP10 (commentary): how varied and how specific the ball-by-ball commentary reads, on the 100-match T20 corpus
 * (fixture autopilot), for the record in docs/pavilion/creative/CP10_COMMENTARY.md.
 *
 * For each delivery line it takes the line's shape (every player and team name replaced by "N", every number by "#",
 * the "Innings 1, 4.3: " prefix removed) and reports:
 *   - shapeRepeatRate: the share of delivery lines whose shape matches one of the previous three delivery lines;
 *   - openingRepeatRate: the share whose first three words match one of the previous three delivery lines';
 *   - distinctShapes: how many different shapes the corpus produced;
 *   - specificShare: the share of lines off the bat (runs or a fielded stroke) that name a direction or a stroke;
 *   - dashes: en or em dashes in any line (target 0).
 * Also checks every feed against the commentary contract and that two projections of the same events are identical.
 *   node --import tsx scripts/cp10-commentary-variety.ts
 * CP10_PROJECTION=<path to a commentary.ts> measures another copy of the projection (used for the before figures).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateT20MatchSetup, createT20CorpusRequest, runFixtureT20 } from "@lcxxvi/simulation";
import { MatchCommentaryFeedSchema } from "@lcxxvi/contracts";
import type { CommittedCommentarySourceEvent, ProjectMatchCommentaryInput } from "@lcxxvi/projections";

const source = process.env.CP10_PROJECTION;
const mod = (source ? await import(pathToFileURL(resolve(source)).href) : await import("@lcxxvi/projections")) as {
  projectMatchCommentary: (input: ProjectMatchCommentaryInput) => { entries: { eventType: string; text: string }[] };
};

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8"));
const names = Object.fromEntries((world.players as { playerId: string; name: string }[]).map((p) => [p.playerId, p.name]));
const teams = Object.fromEntries((world.teams as { teamId: string; name: string }[]).map((t) => [t.teamId, t.name]));
const allNames = [...Object.values(names), ...Object.values(teams)].sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRe = new RegExp(allNames.map(escape).join("|"), "g");
const shapeOf = (text: string) => text.replace(/^Innings \d+, \d+\.\d+: /, "").replace(nameRe, "N").replace(/\d+/g, "#");
const opening = (shape: string) => shape.split(/\s+/).slice(0, 3).join(" ");
const DASHES = new RegExp("[\\u2013\\u2014]");
const DIRECTION = /third man|point|cover|mid-off|mid-on|midwicket|mid-wicket|square leg|fine leg|\bfine\b|long-off|long-on|leg side|down the ground|edge|in the air/;

let lines = 0, deliveries = 0, shapeRepeats = 0, openingRepeats = 0, offBat = 0, specific = 0, dashes = 0, unstable = 0;
const shapes = new Set<string>();
for (const raw of corpus.cases) {
  const game = runFixtureT20(validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest));
  const input: ProjectMatchCommentaryInput = { format: "T20", events: game.events as unknown as CommittedCommentarySourceEvent[], playerNames: names, teamNames: teams, teamIds: (raw as { teamIds: [string, string] }).teamIds, presentationKey: `cp10:${(raw as { matchId?: string }).matchId ?? lines}` };
  const feed = mod.projectMatchCommentary(input);
  MatchCommentaryFeedSchema.parse(feed);
  if (JSON.stringify(mod.projectMatchCommentary(input)) !== JSON.stringify(feed)) unstable += 1;
  const events = game.events as unknown as { type: string; payload: { event?: { batRuns: number; trajectory: string | null; dismissal: unknown; legality: string } } }[];
  const recentShapes: string[] = [], recentOpenings: string[] = [];
  feed.entries.forEach((e, i) => {
    lines += 1;
    if (DASHES.test(e.text)) dashes += 1;
    if (e.eventType !== "DELIVERY_RECORDED") return;
    deliveries += 1;
    const shape = shapeOf(e.text), open = opening(shape);
    shapes.add(shape);
    if (recentShapes.slice(-3).includes(shape)) shapeRepeats += 1;
    if (recentOpenings.slice(-3).includes(open)) openingRepeats += 1;
    recentShapes.push(shape); recentOpenings.push(open);
    const d = events[i]?.payload.event;
    if (d && !d.dismissal && d.legality === "LEGAL" && d.trajectory !== null) {
      offBat += 1;
      if (DIRECTION.test(e.text)) specific += 1;
    }
  });
}
const r = (n: number, d: number) => +(n / Math.max(1, d)).toFixed(3);
console.log(JSON.stringify({
  projection: source ?? "@lcxxvi/projections",
  contract: "every feed parses with MatchCommentaryFeedSchema",
  matches: corpus.cases.length, lines, deliveries,
  shapeRepeatRate: r(shapeRepeats, deliveries), openingRepeatRate: r(openingRepeats, deliveries),
  distinctShapes: shapes.size, specificShare: r(specific, offBat), dashes, unstableReplays: unstable,
}, null, 2));
