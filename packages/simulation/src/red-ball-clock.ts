export type Red5ClockState = {
  day: number;
  localSeconds: number;
  phase:
    | "PLAY"
    | "LUNCH"
    | "TEA"
    | "INNINGS_INTERVAL"
    | "STUMPS"
    | "RAIN"
    | "COMPLETE";
  dayLegalBalls: number;
  finalHourActive: boolean;
  /** Legal balls still required by the day-five final-hour obligation. */
  finalHourBallsRemaining: number;
  /** True when a scheduled interval/close was crossed mid-over. */
  overMustFinish: boolean;
  delaySecondsToday: number;
};

export const RED5_START_SECONDS = 11 * 3600;
export const RED5_LUNCH_START = 13 * 3600;
export const RED5_LUNCH_END = 13 * 3600 + 40 * 60;
export const RED5_TEA_START = 15 * 3600 + 40 * 60;
export const RED5_TEA_END = 16 * 3600;
export const RED5_FINAL_HOUR_START = 17 * 3600;
export const RED5_CLOSE = 18 * 3600;
export const RED5_EXTENDED_CLOSE = 18 * 3600 + 30 * 60;

export function createRed5Clock(): Red5ClockState {
  return {
    day: 1,
    localSeconds: RED5_START_SECONDS,
    phase: "PLAY",
    dayLegalBalls: 0,
    finalHourActive: false,
    finalHourBallsRemaining: 0,
    overMustFinish: false,
    delaySecondsToday: 0,
  };
}

function mealEnd(seconds: number): number {
  if (seconds >= RED5_LUNCH_START && seconds < RED5_LUNCH_END)
    return RED5_LUNCH_END;
  if (seconds >= RED5_TEA_START && seconds < RED5_TEA_END) return RED5_TEA_END;
  return seconds;
}

function nextDay(c: Red5ClockState): Red5ClockState {
  return {
    ...c,
    day: c.day + 1,
    localSeconds: RED5_START_SECONDS,
    phase: "PLAY",
    dayLegalBalls: 0,
    finalHourActive: false,
    finalHourBallsRemaining: 0,
    overMustFinish: false,
    delaySecondsToday: 0,
  };
}

function dayClose(c: Red5ClockState): number {
  if (c.day === 5) return RED5_CLOSE;
  return c.dayLegalBalls < 540 ? RED5_EXTENDED_CLOSE : RED5_CLOSE;
}

function finalHourRequirement(inningsLegalBallsAt1700: number): number {
  const mod = inningsLegalBallsAt1700 % 6;
  return mod === 0 ? 90 : 6 - mod + 84;
}

function activateFinalHourIfCrossed(
  c: Red5ClockState,
  start: number,
  end: number,
  inningsLegalBallsAt1700: number,
): boolean {
  if (
    c.day === 5 &&
    !c.finalHourActive &&
    start < RED5_FINAL_HOUR_START &&
    end >= RED5_FINAL_HOUR_START
  ) {
    c.finalHourActive = true;
    c.finalHourBallsRemaining = finalHourRequirement(inningsLegalBallsAt1700);
    return true;
  }
  return false;
}

function isDayFiveExpired(c: Red5ClockState): boolean {
  return (
    c.day === 5 &&
    c.finalHourActive &&
    c.localSeconds >= RED5_CLOSE &&
    c.finalHourBallsRemaining === 0
  );
}

/**
 * The ten-minute innings interval replaces a coincident lunch/tea interval.
 * This intentionally does not call mealEnd(), matching Appendix D C02.
 */
export function applyRed5InningsInterval(
  input: Red5ClockState,
  inningsLegalBalls = 0,
): { clock: Red5ClockState; dayFiveExpired: boolean; newDay: boolean } {
  let c: Red5ClockState = {
    ...input,
    phase: "INNINGS_INTERVAL",
    overMustFinish: false,
  };
  const start = c.localSeconds;
  const end = start + 600;
  activateFinalHourIfCrossed(c, start, end, inningsLegalBalls);
  c.localSeconds = end;

  if (c.day < 5 && c.localSeconds >= dayClose(c)) {
    c = nextDay(c);
    return { clock: c, dayFiveExpired: false, newDay: true };
  }
  const expired = isDayFiveExpired(c);
  c.phase = expired ? "COMPLETE" : "PLAY";
  return { clock: c, dayFiveExpired: expired, newDay: false };
}

export function applyRed5RainDelay(
  input: Red5ClockState,
  seconds: number,
  inningsLegalBalls = 0,
): { clock: Red5ClockState; dayFiveExpired: boolean; newDay: boolean } {
  if (!Number.isInteger(seconds) || seconds < 60)
    throw new Error("LC_RED5_INVALID_RAIN_DELAY");
  let c: Red5ClockState = { ...input, phase: "RAIN", overMustFinish: false };
  const start = c.localSeconds;
  const end = start + seconds;
  c.delaySecondsToday += seconds;

  activateFinalHourIfCrossed(c, start, end, inningsLegalBalls);
  if (c.day === 5 && c.finalHourActive) {
    const rainAfter1700 = Math.max(
      0,
      end - Math.max(start, RED5_FINAL_HOUR_START),
    );
    c.finalHourBallsRemaining = Math.max(
      0,
      c.finalHourBallsRemaining - 6 * Math.floor(rainAfter1700 / 240),
    );
  }

  c.localSeconds = mealEnd(end);
  if (c.day < 5 && c.localSeconds >= dayClose(c)) {
    c = nextDay(c);
    return { clock: c, dayFiveExpired: false, newDay: true };
  }
  const expired = isDayFiveExpired(c);
  c.phase = expired ? "COMPLETE" : "PLAY";
  return { clock: c, dayFiveExpired: expired, newDay: false };
}

export function applyRed5BallReplacement(
  input: Red5ClockState,
  seconds = 120,
  inningsLegalBalls = 0,
): { clock: Red5ClockState; dayFiveExpired: boolean; newDay: boolean } {
  if (!Number.isInteger(seconds) || seconds < 0)
    throw new Error("LC_RED5_INVALID_BALL_REPLACEMENT_TIME");
  let c: Red5ClockState = { ...input, overMustFinish: false };
  const start = c.localSeconds;
  const end = start + seconds;
  activateFinalHourIfCrossed(c, start, end, inningsLegalBalls);
  c.localSeconds = mealEnd(end);
  if (c.day < 5 && c.localSeconds >= dayClose(c)) {
    c = nextDay(c);
    return { clock: c, dayFiveExpired: false, newDay: true };
  }
  const expired = isDayFiveExpired(c);
  c.phase = expired ? "COMPLETE" : "PLAY";
  return { clock: c, dayFiveExpired: expired, newDay: false };
}

export function advanceRed5Clock(
  input: Red5ClockState,
  args: {
    elapsedSeconds: number;
    legalBall: boolean;
    overCompleted: boolean;
    inningsCompleted?: boolean;
    inningsLegalBalls: number;
    terminalResult: boolean;
  },
): { clock: Red5ClockState; dayFiveExpired: boolean; newDay: boolean } {
  let c: Red5ClockState = { ...input };
  const before = c.localSeconds;
  const legalBallsBefore = args.inningsLegalBalls - (args.legalBall ? 1 : 0);
  c.localSeconds += args.elapsedSeconds;

  const activated = activateFinalHourIfCrossed(
    c,
    before,
    c.localSeconds,
    legalBallsBefore,
  );
  if (args.legalBall) {
    c.dayLegalBalls++;
    // A legal delivery completed after the 17:00 crossing counts toward the
    // obligation, including the delivery in progress at exactly 17:00.
    if (c.finalHourActive)
      c.finalHourBallsRemaining = Math.max(0, c.finalHourBallsRemaining - 1);
  }
  // If a clock was externally positioned at/after 17:00 (fixture/recovery),
  // activate before continuing play.
  if (
    c.day === 5 &&
    !c.finalHourActive &&
    c.localSeconds >= RED5_FINAL_HOUR_START
  ) {
    c.finalHourActive = true;
    c.finalHourBallsRemaining = finalHourRequirement(legalBallsBefore);
    if (args.legalBall)
      c.finalHourBallsRemaining = Math.max(0, c.finalHourBallsRemaining - 1);
  }
  void activated;

  // Scheduled lunch/tea/18:00 are interval boundaries even when days 1-4
  // later continue in the 90-over extension. If crossed mid-over, finish it.
  const crossedScheduledBoundary =
    (before < RED5_LUNCH_START && c.localSeconds >= RED5_LUNCH_START) ||
    (before < RED5_TEA_START && c.localSeconds >= RED5_TEA_START) ||
    (before < RED5_CLOSE && c.localSeconds >= RED5_CLOSE);
  c.overMustFinish = !args.overCompleted && crossedScheduledBoundary;

  if (args.terminalResult) {
    c.overMustFinish = false;
    return { clock: c, dayFiveExpired: false, newDay: false };
  }

  // Result/innings arbitration happens before interval transitions. When an
  // innings has ended, leave the raw post-delivery time for the dedicated
  // ten-minute interval, which replaces a coincident meal (Appendix D C02).
  if (args.inningsCompleted) {
    c.overMustFinish = false;
    return { clock: c, dayFiveExpired: false, newDay: false };
  }

  if (!args.overCompleted)
    return { clock: c, dayFiveExpired: false, newDay: false };

  c.overMustFinish = false;
  c.localSeconds = mealEnd(c.localSeconds);
  const close = dayClose(c);
  if (
    c.localSeconds >= close &&
    (c.day < 5 || c.finalHourBallsRemaining === 0)
  ) {
    if (c.day === 5) {
      c.phase = "COMPLETE";
      return { clock: c, dayFiveExpired: true, newDay: false };
    }
    c = nextDay(c);
    return { clock: c, dayFiveExpired: false, newDay: true };
  }
  c.phase = "PLAY";
  return { clock: c, dayFiveExpired: false, newDay: false };
}
