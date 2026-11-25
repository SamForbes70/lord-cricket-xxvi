import { describe, expect, test } from "vitest";
import { marginText } from "../../apps/web/src/match/margin-text.js";

describe("result margin wording", () => {
  test("uses the singular for a margin of one", () => {
    expect(marginText({ marginType: "RUNS", marginRuns: 1 })).toBe("1 run");
    expect(marginText({ marginType: "WICKETS", marginWickets: 1 })).toBe("1 wicket");
  });
  test("uses the plural otherwise", () => {
    expect(marginText({ marginType: "RUNS", marginRuns: 23 })).toBe("23 runs");
    expect(marginText({ marginType: "WICKETS", marginRuns: null, marginWickets: 4 })).toBe("4 wickets");
  });
});
