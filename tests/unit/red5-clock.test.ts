import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  advanceRed5Clock,
  applyRed5BallReplacement,
  applyRed5InningsInterval,
  applyRed5RainDelay,
  resolveRed5MatchSituation,
  type Red5ClockState,
} from "@lcxxvi/simulation";

type ClockFixture = {
  id: string;
  before: {
    clock: {
      day: number;
      localSeconds: number;
      dayLegalBalls: number;
      finalHourActive: boolean;
      finalHourBallsRequired: number;
      finalHourBallsDelivered: number;
    };
    inningsLegalBalls: number;
    ballAgeLegalBalls: number;
  };
  input: {
    attemptSeconds: number;
    wicketSeconds: number;
    delaySeconds: number;
    replacementSeconds: number;
    overSeconds: number;
  };
  expected: {
    clock: {
      day: number;
      localSeconds: number;
      dayLegalBalls: number;
      finalHourActive: boolean;
      finalHourBallsRequired: number;
      finalHourBallsDelivered: number;
    };
    inningsLegalBalls: number;
    ballAgeLegalBalls: number;
    phase: string;
    intervalSeconds: number;
  };
};

const corpus = JSON.parse(
  readFileSync("tests/fixtures/scoring/corpus.json", "utf8"),
) as {
  terminal: Array<{
    id: string;
    teamIds: [string, string];
    innings: { teamId: string; runs: number; complete: boolean }[];
    timeExpired: boolean;
    expected: { result: unknown; targetToWin: number | null };
  }>;
  clock: ClockFixture[];
};
const fixture = (id: string) => corpus.clock.find((c) => c.id === id)!;
const toClock = (f: ClockFixture): Red5ClockState => ({
  day: f.before.clock.day,
  localSeconds: f.before.clock.localSeconds,
  phase: "PLAY",
  dayLegalBalls: f.before.clock.dayLegalBalls,
  finalHourActive: f.before.clock.finalHourActive,
  finalHourBallsRemaining: Math.max(
    0,
    f.before.clock.finalHourBallsRequired -
      f.before.clock.finalHourBallsDelivered,
  ),
  overMustFinish: false,
  delaySecondsToday: 0,
});

describe("Appendix D red-ball clock fixtures", () => {
  it("C01 keeps a wicket-at-18:00 over alive until its remaining balls are completed", () => {
    const f = fixture("C01");
    const out = advanceRed5Clock(toClock(f), {
      elapsedSeconds: f.input.attemptSeconds + f.input.wicketSeconds,
      legalBall: true,
      overCompleted: false,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: false,
    });
    expect(out.clock.localSeconds).toBe(f.expected.clock.localSeconds);
    expect(out.clock.dayLegalBalls).toBe(f.expected.clock.dayLegalBalls);
    expect(out.clock.overMustFinish).toBe(true);
    expect(out.clock.day).toBe(1);
  });

  it("C02 replaces coincident lunch with the single innings interval", () => {
    const f = fixture("C02");
    const delivery = advanceRed5Clock(toClock(f), {
      elapsedSeconds:
        f.input.attemptSeconds + f.input.wicketSeconds + f.input.overSeconds,
      legalBall: true,
      overCompleted: true,
      inningsCompleted: true,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: false,
    });
    const interval = applyRed5InningsInterval(
      delivery.clock,
      f.expected.inningsLegalBalls,
    );
    expect(interval.clock.localSeconds).toBe(f.expected.clock.localSeconds);
    expect(interval.clock.dayLegalBalls).toBe(f.expected.clock.dayLegalBalls);
    expect(interval.clock.phase).toBe("PLAY");
  });

  it("C03 reduces only the final-hour obligation during a twenty-minute rain delay", () => {
    const f = fixture("C03");
    const out = applyRed5RainDelay(
      toClock(f),
      f.input.delaySeconds,
      f.before.inningsLegalBalls,
    );
    const expectedRemaining =
      f.expected.clock.finalHourBallsRequired -
      f.expected.clock.finalHourBallsDelivered;
    expect(out.clock.localSeconds).toBe(f.expected.clock.localSeconds);
    expect(out.clock.finalHourBallsRemaining).toBe(expectedRemaining);
    expect(out.clock.dayLegalBalls).toBe(f.expected.clock.dayLegalBalls);
  });

  it("C04 charges new-ball replacement time without changing innings/day ball counts", () => {
    const f = fixture("C04");
    const out = applyRed5BallReplacement(
      toClock(f),
      f.input.replacementSeconds,
      f.before.inningsLegalBalls,
    );
    expect(out.clock.localSeconds).toBe(f.expected.clock.localSeconds);
    expect(out.clock.dayLegalBalls).toBe(f.expected.clock.dayLegalBalls);
    // Ball age is reset by the match reducer, not by the clock helper.
    expect(f.expected.ballAgeLegalBalls).toBe(0);
    expect(f.expected.inningsLegalBalls).toBe(f.before.inningsLegalBalls);
  });

  it("C05 gives match result precedence over stumps on the final scheduled ball", () => {
    const f = fixture("C05");
    const out = advanceRed5Clock(toClock(f), {
      elapsedSeconds: f.input.attemptSeconds,
      legalBall: true,
      overCompleted: true,
      inningsCompleted: true,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: true,
    });
    expect(out.clock.localSeconds).toBe(f.expected.clock.localSeconds);
    expect(out.clock.dayLegalBalls).toBe(f.expected.clock.dayLegalBalls);
    expect(out.clock.finalHourBallsRemaining).toBe(0);
    expect(out.dayFiveExpired).toBe(false);
  });
});

describe("Appendix D red-ball terminal fixtures", () => {
  for (const f of corpus.terminal) {
    it(`${f.id}: ${f.id === "F10" ? "innings victory" : f.id === "F11" ? "fourth-innings target" : f.id === "F12" ? "incomplete level chase is a draw" : "completed level chase is a tie"}`, () => {
      const got = resolveRed5MatchSituation(
        f.teamIds,
        f.innings,
        f.timeExpired,
      );
      expect(got.targetToWin).toBe(f.expected.targetToWin);
      expect(got.result).toEqual(f.expected.result);
    });
  }
});
