import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateT20MatchSetup, createT20Session, executeT20Command, fixtureAutopilotStep,
} from "@lcxxvi/simulation";
import { pitchVerdict } from "@lcxxvi/projections";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";
import { recommendedPlayerId, withRecommendation } from "../../apps/web/src/match/recommendation.js";
import { formatGameDate } from "../../apps/web/src/career/format.js";

const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));

function fixture() {
  const request = structuredClone(template);
  request.setup.seed = "e5-recommended-fixture-seed";
  return createT20Session(validateT20MatchSetup(request, world, manifest));
}

describe("E5 recommended choices", () => {
  test("recommendedPlayerId reads only batter and bowler commands", () => {
    expect(recommendedPlayerId(null)).toBeNull();
    expect(recommendedPlayerId({ kind: "SET_BATTER", payload: { teamId: "t", playerId: "p1" } })).toBe("p1");
    expect(recommendedPlayerId({ kind: "SET_BOWLER", payload: { teamId: "t", bowlerId: "b1" } })).toBe("b1");
    expect(recommendedPlayerId({ kind: "CALL_TOSS", payload: { teamId: "t", call: "HEADS" } })).toBeNull();
  });

  test("withRecommendation marks one selectable candidate, skips other phases and survives an adviser refusal", () => {
    const candidates = [{ id: "a", reason: "" }, { id: "b", reason: "Bowled the previous over" }, { id: "c", reason: "" }];
    const bowl = (id: string) => () => ({ kind: "SET_BOWLER", payload: { bowlerId: id } });
    expect(withRecommendation("AWAITING_BOWLER", candidates, bowl("c")).map(c => c.recommended ?? false)).toEqual([false, false, true]);
    // A recommendation for an unavailable candidate is not shown.
    expect(withRecommendation("AWAITING_BOWLER", candidates, bowl("b")).some(c => c.recommended)).toBe(false);
    expect(withRecommendation("READY", candidates, bowl("a")).some(c => c.recommended)).toBe(false);
    expect(withRecommendation("AWAITING_BOWLER", candidates, () => { throw new Error("LC_T20_AI_INVALID"); })).toEqual(candidates);
  });

  test("asking the captain for a recommendation leaves the match unchanged, and the match plays out the same", () => {
    let withAdvice = fixture();
    let plain = fixture();
    let recommendations = 0;
    while (withAdvice.core.phase !== "COMPLETE") {
      if (withAdvice.revision >= 900) throw new Error("E5_MATCH_STALLED");
      const phase = withAdvice.core.phase;
      if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") {
        const innings = withAdvice.core.innings[withAdvice.core.activeInningsIndex]!.innings;
        const teamId = phase === "AWAITING_BATTER" ? innings.battingTeamId : innings.bowlingTeamId;
        const before = JSON.stringify(withAdvice);
        const id = recommendedPlayerId(proposeOpponentT20Command(withAdvice, teamId));
        expect(JSON.stringify(withAdvice)).toBe(before);
        if (id) recommendations += 1;
      }
      withAdvice = executeT20Command(withAdvice, fixtureAutopilotStep(withAdvice)).session;
      plain = executeT20Command(plain, fixtureAutopilotStep(plain)).session;
    }
    expect(recommendations).toBeGreaterThan(10);
    expect(JSON.stringify(withAdvice.events)).toBe(JSON.stringify(plain.events));
  }, 120000);
});

describe("E5 pitch verdict", () => {
  test("each tendency has a plain-words verdict", () => {
    expect(pitchVerdict(6200, 6000)).toMatchObject({ tendency: "LIVE_BOTH", headline: "A bowler's pitch" });
    expect(pitchVerdict(7000, 5000)).toMatchObject({ tendency: "SEAM_FRIENDLY", headline: "A seamer's pitch" });
    expect(pitchVerdict(5000, 7000)).toMatchObject({ tendency: "SPIN_FRIENDLY", headline: "A spinner's pitch" });
    expect(pitchVerdict(4000, 4200)).toMatchObject({ tendency: "FLAT", headline: "A batting pitch" });
    expect(pitchVerdict(5000, 5000)).toMatchObject({ tendency: "BALANCED", headline: "An even pitch" });
  });
});

describe("E5 game dates", () => {
  test("formats ISO game dates in words with the correct weekday", () => {
    expect(formatGameDate("2027-03-01")).toBe("Mon 1 March 2027");
    expect(formatGameDate("2027-05-30")).toBe("Sun 30 May 2027");
    expect(formatGameDate("2028-02-29")).toBe("Tue 29 February 2028");
  });

  test("returns anything that is not a valid date unchanged", () => {
    expect(formatGameDate("2027-02-30")).toBe("2027-02-30");
    expect(formatGameDate("not a date")).toBe("not a date");
  });
});
