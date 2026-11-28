/**
 * CP10 (commentary), Studio Production Directive 05: the ball-by-ball commentary is deterministic for a given event
 * sequence, varied, specific to what each delivery records, free of en and em dashes, and laid out with the
 * captain's notes apart from the play.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DeliveryRecordedSchema,
  MatchCommentaryFeedSchema,
  type CommentaryEntry,
  type DeliveryRecorded,
} from "@lcxxvi/contracts";
import { createT20CorpusRequest, runFixtureT20, validateT20MatchSetup } from "@lcxxvi/simulation";
import { projectMatchCommentary, type CommittedCommentarySourceEvent } from "@lcxxvi/projections";
import { SECTOR_NAMES, battingPlanText, bowlingPlanText, choose } from "../../packages/projections/src/commentary-phrases.js";
import { overContext } from "../../packages/projections/src/commentary-context.js";
import { SECTOR_REGIONS } from "../../apps/web/src/match/chart-layout.js";
import { milestoneLabel, splitBallLine, splitCommentary } from "../../apps/web/src/match/commentary-view.js";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8"));
const names: Record<string, string> = Object.fromEntries((world.players as { playerId: string; name: string }[]).map((p) => [p.playerId, p.name]));
const teams: Record<string, string> = Object.fromEntries((world.teams as { teamId: string; name: string }[]).map((t) => [t.teamId, t.name]));

function corpusMatch(index: number) {
  const raw = corpus.cases[index];
  const game = runFixtureT20(validateT20MatchSetup(createT20CorpusRequest(raw, base, world), bytes, manifest));
  return { events: game.events as unknown as CommittedCommentarySourceEvent[], teamIds: raw.teamIds as [string, string] };
}
const project = (events: readonly CommittedCommentarySourceEvent[], teamIds: [string, string], key = "cp10:test") =>
  projectMatchCommentary({ format: "T20", events, playerNames: names, teamNames: teams, teamIds, presentationKey: key });

const sample = [0, 7, 23, 41, 77].map(corpusMatch);
const DASHES = new RegExp("[\\u2013\\u2014]");
const escapeRe = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRe = new RegExp([...Object.values(names), ...Object.values(teams)].sort((a, b) => b.length - a.length).map(escapeRe).join("|"), "g");

function delivery(overrides: Partial<DeliveryRecorded> & { deliveryIndex: number }): DeliveryRecorded {
  const batRuns = overrides.batRuns ?? 0;
  return DeliveryRecordedSchema.parse({
    type: "DELIVERY_RECORDED", inningsIndex: 0, strikerId: "s", nonStrikerId: "n", bowlerId: "b",
    legality: "LEGAL", legalBall: true, countsAsBallFaced: true, batRuns,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
    completedRuns: batRuns === 4 || batRuns === 6 ? 0 : batRuns,
    boundary: batRuns === 6 ? "SIX" : batRuns === 4 ? "FOUR" : "NONE",
    dismissal: null, endsAfter: { north: "s", south: "n" }, shotSector: 2, trajectory: "GROUND",
    executedLength: "FULL", fieldOutcome: "NONE", elapsedSeconds: 30, freeHitNext: false, ...overrides,
  });
}
const smallNames = { s: "Ava Striker", n: "Bea Partner", b: "Cal Bowler", k: "Dee Keeper", x: "Eli Batter" };
function feedOf(deliveries: DeliveryRecorded[], extra: CommittedCommentarySourceEvent[] = [], key = "cp10:unit") {
  const events: CommittedCommentarySourceEvent[] = [
    { sequence: 1, type: "INNINGS_STARTED", payload: { inningsIndex: 0, battingTeamId: "h" }, eventHash: "a1" },
    ...extra,
    ...deliveries.map((event, i) => ({ sequence: 10 + i, type: "DELIVERY_RECORDED", payload: { event }, eventHash: `d${i}` })),
  ];
  return MatchCommentaryFeedSchema.parse(projectMatchCommentary({ format: "T20", events, playerNames: smallNames, teamNames: { h: "Home", a: "Away" }, teamIds: ["h", "a"], presentationKey: key }));
}
const deliveryText = (e: CommentaryEntry) => e.text.replace(/^Innings \d+, \d+\.\d+: /, "");

describe("CP10 commentary: determinism", () => {
  it("projects the same text for the same events, and a replay of the same match gives the same feed", () => {
    for (const m of sample) {
      expect(project(m.events, m.teamIds)).toEqual(project(m.events, m.teamIds));
    }
    // The engine run itself is repeatable, so a replay of the match projects identical commentary.
    const again = corpusMatch(7);
    expect(project(again.events, again.teamIds)).toEqual(project(sample[1]!.events, sample[1]!.teamIds));
  });

  it("never rewrites a line already shown: every prefix of the events projects the same leading entries", () => {
    const { events, teamIds } = sample[2]!;
    const full = project(events, teamIds).entries;
    // Cut after any event except a delivery whose over summary is committed with it (the two arrive together).
    for (let cut = 1; cut <= events.length; cut += 7) {
      if (events[cut - 1]!.type === "DELIVERY_RECORDED" && events[cut]?.type === "OVER_COMPLETED") continue;
      expect(project(events.slice(0, cut), teamIds).entries).toEqual(full.slice(0, cut));
    }
  });

  it("uses no Math.random or clock in the commentary sources", () => {
    for (const file of ["packages/projections/src/commentary.ts", "packages/projections/src/commentary-phrases.ts", "packages/projections/src/commentary-context.ts", "apps/web/src/match/commentary-view.ts", "apps/web/src/match/CommentaryPanel.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now|crypto\./);
    }
  });

  it("chooses phrase variants by hashing the key only", () => {
    expect(choose("match|1|abc", ["a", "b", "c", "d"])).toBe(choose("match|1|abc", ["a", "b", "c", "d"]));
  });
});

describe("CP10 commentary: variety and style", () => {
  it("has no en or em dashes in any line, in any mode", () => {
    for (const m of sample) {
      for (const e of project(m.events, m.teamIds).entries) {
        expect(e.text).not.toMatch(DASHES);
        expect(e.short).not.toMatch(DASHES);
        expect(e.detailed).not.toMatch(DASHES);
      }
    }
    expect(battingPlanText("A", 3, "ROTATE") + bowlingPlanText("B", "OFF", "GOOD", "MAXIMUM")).not.toMatch(DASHES);
  });

  it("does not repeat a delivery template within its family's last three lines, nor a line's shape back to back", () => {
    let deliveries = 0, openingRepeats = 0;
    for (const m of sample) {
      const recent = new Map<string, string[]>();
      let prevShape = "";
      const openings: string[] = [];
      for (const e of project(m.events, m.teamIds).entries) {
        const history = recent.get(e.templateFamily) ?? [];
        if (e.eventType === "DELIVERY_RECORDED") {
          expect(history.slice(-3)).not.toContain(e.templateId);
          const shape = deliveryText(e).replace(/\d+/g, "#");
          expect(shape).not.toBe(prevShape);
          prevShape = shape;
          // As scripts/cp10-commentary-variety.ts measures it: names replaced, the first three words.
          const opening = shape.replace(nameRe, "N").split(/\s+/).slice(0, 3).join(" ");
          deliveries += 1;
          if (openings.slice(-3).includes(opening)) openingRepeats += 1;
          openings.push(opening);
        }
        history.push(e.templateId);
        recent.set(e.templateFamily, history);
      }
    }
    // Before CP10 the same corpus measured 0.087 on the scripted metric (scripts/cp10-commentary-variety.ts).
    expect(openingRepeats / deliveries).toBeLessThan(0.06);
  });

  it("uses the same region names as the wagon wheel for every recorded sector", () => {
    expect(SECTOR_NAMES.map((n) => n.toLowerCase())).toEqual(SECTOR_REGIONS.map((r) => r.name.toLowerCase()));
  });
});

describe("CP10 commentary: specific to what the delivery records", () => {
  it("names the stroke and the region of a boundary, and a straight six's deep region", () => {
    const four = feedOf([delivery({ deliveryIndex: 0, batRuns: 4, shotSector: 2, trajectory: "GROUND", executedLength: "FULL" })]).entries[1]!;
    expect(deliveryText(four)).toMatch(/cover/);
    expect(deliveryText(four)).toMatch(/drive|caress/i);
    const six = feedOf([delivery({ deliveryIndex: 0, batRuns: 6, shotSector: 3, trajectory: "AERIAL", executedLength: "FULL" })]).entries[1]!;
    expect(deliveryText(six)).toMatch(/long-off/);
    const pull = feedOf([delivery({ deliveryIndex: 0, batRuns: 4, shotSector: 5, trajectory: "GROUND", executedLength: "SHORT" })]).entries[1]!;
    expect(deliveryText(pull)).toMatch(/midwicket/);
    expect(deliveryText(pull)).toMatch(/pull|swat/i);
  });

  it("does not invent a stroke for a ball with no bat contact", () => {
    const keys = ["k1", "k2", "k3", "k4", "k5", "k6"];
    for (const key of keys) {
      const dot = feedOf([delivery({ deliveryIndex: 0, shotSector: null, trajectory: null, executedLength: "GOOD" })], [], key).entries[1]!;
      expect(deliveryText(dot)).not.toMatch(/drive|cut|pull|edge|defend|block|push|third man|point|cover|mid-|midwicket|square leg|fine leg/);
    }
  });

  it("says caught and bowled when the bowler takes the catch, and marks ducks", () => {
    const cb = feedOf([delivery({ deliveryIndex: 0, trajectory: "AERIAL", shotSector: 3, fieldOutcome: "CATCH", dismissal: { kind: "CAUGHT", playerId: "s", creditedBowlerId: "b", fielderId: "b", wicketEnd: "NORTH" } })]).entries[1]!;
    expect(cb.text.toLowerCase()).toContain("caught and bowled");
    expect(cb.text).toContain("A golden duck");
    const diamond = feedOf([delivery({ deliveryIndex: 0, fieldOutcome: "RUN_OUT", shotSector: 1, dismissal: { kind: "RUN_OUT", playerId: "n", creditedBowlerId: null, fielderId: "k", wicketEnd: "SOUTH" } })]).entries[1]!;
    expect(diamond.text).toContain("non-striker");
    expect(diamond.text).toContain("diamond duck");
  });

  it("writes bowling figures as overs-maidens-runs-wickets without a trailing .0", () => {
    const six = Array.from({ length: 6 }, (_, i) => delivery({ deliveryIndex: i, shotSector: null, trajectory: null }));
    const feed = feedOf(six, [{ sequence: 2, type: "BOWLER_SELECTED", payload: { playerId: "b" }, eventHash: "b1" }]);
    expect(feed.entries.at(-1)!.factSlots.find((f) => f.slot === "bowlerFigures")!.value).toBe("1-0-0-0");
  });

  it("introduces the opening bowler with the new ball and the openers as openers", () => {
    const feed = feedOf([], [
      { sequence: 2, type: "BATTER_SELECTED", payload: { playerId: "s" }, eventHash: "s1" },
      { sequence: 3, type: "BOWLER_SELECTED", payload: { playerId: "b" }, eventHash: "b1" },
    ]);
    expect(feed.entries[1]!.text).toMatch(/open/);
    expect(feed.entries[2]!.text).toMatch(/open the bowling|new ball|First over/);
  });

  it("gives no chase equation once the overs are used up", () => {
    for (const m of sample) {
      for (const e of project(m.events, m.teamIds).entries) expect(e.text).not.toMatch(/from 0 balls|off 0b/);
    }
  });

  it("marks the end of the powerplay with the score", () => {
    const overs = Array.from({ length: 6 }, () => ({ runs: 5, wickets: 0 }));
    expect(overContext({ format: "T20", overs, runs: 30, wickets: 1, legalBalls: 36, targetToWin: null, bowlerName: "B", bowlerFigures: "1-0-5-0", bowlerLegalBalls: 6, ballsSinceBoundary: 2 }))
      .toEqual({ slot: "powerplayEnd", text: "That ends the powerplay: 30/1 from the first 6 overs." });
  });

  it("writes captain's plans in words", () => {
    expect(bowlingPlanText("Cal Bowler", "STUMPS", "FULL", "CONSERVE")).toBe("Cal Bowler will bowl full at the stumps, within themselves.");
    expect(bowlingPlanText("Cal Bowler", "OFF", "YORKER", "NORMAL")).toBe("Cal Bowler will bowl yorkers outside off stump.");
    expect(battingPlanText("Ava Striker", 4, "NORMAL")).toBe("Ava Striker will bat aggressively.");
    expect(battingPlanText("Ava Striker", 1, "PROTECT")).toBe("Ava Striker will bat cautiously, protecting the wicket.");
  });
});

describe("CP10 commentary panel layout", () => {
  it("separates captain's notes from the play and says when each was made", () => {
    const events: CommittedCommentarySourceEvent[] = [
      { sequence: 1, type: "INNINGS_STARTED", payload: { inningsIndex: 0, battingTeamId: "h" }, eventHash: "a" },
      { sequence: 2, type: "BOWLING_PLAN_CHANGED", payload: { bowlerId: "b", line: "OFF", length: "GOOD", effort: "NORMAL" }, eventHash: "p1" },
      { sequence: 3, type: "DELIVERY_RECORDED", payload: { event: delivery({ deliveryIndex: 0 }) }, eventHash: "d1" },
      { sequence: 4, type: "BATTING_PLAN_CHANGED", payload: { playerId: "s", aggression: 3, intent: "NORMAL" }, eventHash: "p2" },
      { sequence: 5, type: "FIELD_CHANGED", payload: { fieldSlots: [{ slotId: "slip-1" }] }, eventHash: "p3" },
    ];
    const feed = projectMatchCommentary({ format: "T20", events, playerNames: smallNames, teamNames: { h: "Home" }, teamIds: ["h", "a"], presentationKey: "k" });
    expect(feed.entries).toHaveLength(events.length);
    const { play, notes } = splitCommentary(feed.entries);
    expect(play.map((e) => e.eventType)).toEqual(["INNINGS_STARTED", "DELIVERY_RECORDED"]);
    expect(notes.map((n) => n.when)).toEqual(["Before the first ball", "After 0.1", "After 0.1"]);
    expect(notes[0]!.entry.text).toBe("Cal Bowler will bowl a good length outside off stump.");
  });

  it("splits a ball line without changing its text", () => {
    const text = "Innings 2, 14.3: Four! Ava Striker drives Cal Bowler through the covers.";
    const parts = splitBallLine(text)!;
    expect(parts.ball).toBe("14.3");
    expect(parts.innings + parts.ball + parts.separator + parts.rest).toBe(text);
    expect(splitBallLine("End of over 5: 7 runs. Home 40/1.")).toBeNull();
    expect(milestoneLabel("PARTNERSHIP_FIFTY")).toBe("50 stand");
  });
});
