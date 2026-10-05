import { readFileSync } from "node:fs";
import {
  advanceRed5Clock,
  applyRed5BallReplacement,
  applyRed5InningsInterval,
  applyRed5RainDelay,
  resolveRed5MatchSituation,
  type Red5ClockState,
  type Red5TerminalInnings,
} from "../packages/simulation/src/index.js";

type TerminalFixture = {
  id: string;
  teamIds: [string, string];
  innings: Red5TerminalInnings[];
  timeExpired: boolean;
  expected: { result: unknown; targetToWin: number | null };
};
type ClockSnapshot = {
  day: number;
  localSeconds: number;
  dayLegalBalls: number;
  finalHourActive: boolean;
  finalHourBallsRequired: number;
  finalHourBallsDelivered: number;
};
type ClockFixture = {
  id: string;
  before: {
    clock: ClockSnapshot;
    inningsLegalBalls: number;
  };
  input: {
    attemptSeconds: number;
    wicketSeconds: number;
    overSeconds: number;
    delaySeconds: number;
    replacementSeconds: number;
  };
  expected: {
    clock: ClockSnapshot;
    inningsLegalBalls: number;
    ballAgeLegalBalls: number;
  };
};
type ScoringCorpus = { terminal: TerminalFixture[]; clock: ClockFixture[] };
const corpus = JSON.parse(
  readFileSync("tests/fixtures/scoring/corpus.json", "utf8"),
) as ScoringCorpus;
const eq = (a: unknown, b: unknown, label: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(
      `${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`,
    );
};
const clockState = (f: ClockFixture): Red5ClockState => ({
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

const terminalResults: string[] = [];
for (const f of corpus.terminal) {
  const got = resolveRed5MatchSituation(f.teamIds, f.innings, f.timeExpired);
  eq(got.result, f.expected.result, `${f.id} result`);
  eq(got.targetToWin, f.expected.targetToWin, `${f.id} target`);
  terminalResults.push(f.id);
}

const clockResults: string[] = [];
for (const f of corpus.clock) {
  const c = clockState(f);
  if (f.id === "C01") {
    const got = advanceRed5Clock(c, {
      elapsedSeconds: f.input.attemptSeconds + f.input.wicketSeconds,
      legalBall: true,
      overCompleted: false,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: false,
    }).clock;
    eq(got.localSeconds, f.expected.clock.localSeconds, "C01 time");
    eq(got.dayLegalBalls, f.expected.clock.dayLegalBalls, "C01 day balls");
    eq(got.overMustFinish, true, "C01 finish over");
  } else if (f.id === "C02") {
    const afterDelivery = advanceRed5Clock(c, {
      elapsedSeconds:
        f.input.attemptSeconds + f.input.wicketSeconds + f.input.overSeconds,
      legalBall: true,
      overCompleted: true,
      inningsCompleted: true,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: false,
    }).clock;
    const got = applyRed5InningsInterval(
      afterDelivery,
      f.expected.inningsLegalBalls,
    ).clock;
    eq(got.localSeconds, f.expected.clock.localSeconds, "C02 time");
  } else if (f.id === "C03") {
    const got = applyRed5RainDelay(
      c,
      f.input.delaySeconds,
      f.before.inningsLegalBalls,
    ).clock;
    eq(got.localSeconds, f.expected.clock.localSeconds, "C03 time");
    eq(
      got.finalHourBallsRemaining,
      f.expected.clock.finalHourBallsRequired -
        f.expected.clock.finalHourBallsDelivered,
      "C03 obligation",
    );
  } else if (f.id === "C04") {
    const got = applyRed5BallReplacement(
      c,
      f.input.replacementSeconds,
      f.before.inningsLegalBalls,
    ).clock;
    eq(got.localSeconds, f.expected.clock.localSeconds, "C04 time");
    eq(got.dayLegalBalls, f.expected.clock.dayLegalBalls, "C04 day balls");
    eq(f.expected.ballAgeLegalBalls, 0, "C04 ball age reset expectation");
  } else if (f.id === "C05") {
    const got = advanceRed5Clock(c, {
      elapsedSeconds: f.input.attemptSeconds,
      legalBall: true,
      overCompleted: true,
      inningsCompleted: true,
      inningsLegalBalls: f.expected.inningsLegalBalls,
      terminalResult: true,
    }).clock;
    eq(got.localSeconds, f.expected.clock.localSeconds, "C05 time");
    eq(got.finalHourBallsRemaining, 0, "C05 final-hour completion");
  } else throw new Error(`Unknown clock fixture ${f.id}`);
  clockResults.push(f.id);
}

console.log(
  JSON.stringify(
    {
      gate: "PASS_11_RED5_FORMAT_FIXTURES",
      result: "PASS",
      rulesId: "LC_RED5_01",
      terminal: { matched: terminalResults.length, ids: terminalResults },
      clock: { matched: clockResults.length, ids: clockResults },
      totalMatched: terminalResults.length + clockResults.length,
      note: "Independent Appendix D expected values are retained in the Pass 02 corpus; this gate executes the Pass 11 red-ball arbitration/clock implementation against them.",
    },
    null,
    2,
  ),
);
