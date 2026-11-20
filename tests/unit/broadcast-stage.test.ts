import { describe, expect, it } from "vitest";
import { ballCall } from "../../apps/web/src/match/BroadcastStage.js";

const base = { dismissalKind: null, boundary: "NONE", legality: "LEGAL", runsScored: 0 } as const;

describe("broadcast stage ball calls", () => {
  it("calls wickets first, then boundaries, extras, runs and dots", () => {
    expect(ballCall({ ...base, dismissalKind: "CAUGHT", runsScored: 0 })).toMatchObject({ kind: "WICKET", chip: "W" });
    // A run out off a boundary attempt is still a wicket.
    expect(ballCall({ ...base, dismissalKind: "RUN_OUT", runsScored: 1 }).kind).toBe("WICKET");
    expect(ballCall({ ...base, boundary: "SIX", runsScored: 6 })).toMatchObject({ kind: "SIX", word: "Six", chip: "6" });
    expect(ballCall({ ...base, boundary: "FOUR", runsScored: 4 })).toMatchObject({ kind: "FOUR", chip: "4" });
    expect(ballCall({ ...base, legality: "WIDE", runsScored: 1 })).toMatchObject({ kind: "EXTRA", word: "Wide", chip: "Wd" });
    expect(ballCall({ ...base, legality: "WIDE", runsScored: 5 }).word).toBe("Wide, 5 runs");
    expect(ballCall({ ...base, legality: "NO_BALL", runsScored: 1 })).toMatchObject({ kind: "EXTRA", chip: "Nb" });
    expect(ballCall({ ...base, runsScored: 1 })).toMatchObject({ kind: "RUNS", word: "1 run", chip: "1" });
    expect(ballCall({ ...base, runsScored: 3 }).word).toBe("3 runs");
    expect(ballCall(base)).toMatchObject({ kind: "DOT", chip: "·" });
  });
});
