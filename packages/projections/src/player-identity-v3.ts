import type { PlayingStyle, StoryFact } from "./player-identity-v1.js";
import { matchIntroductionV2, type CareerIntroRecord, type MatchIntro } from "./player-identity-v2.js";

/**
 * LC_PLAYER_IDENTITY_V3 (Pavilion entertainment track, slice 3, 26 November 2026). One presentation-only addition to
 * the V2 match introductions: a live milestone line.
 *
 * In a managed career T20 match the chip of a batter who has faced, or a bowler who has bowled, states a league
 * milestone when it is genuinely close or has just been reached, such as "8 more for 100 league runs", "Reached 25
 * league wickets", "3 more for first league fifty" or "First league wicket". The total is the V2 pre-match league record plus this innings' scorecard line for the player, as the
 * match has recorded it: runs from the batting line, wickets from the bowling line. Nothing is predicted. When no
 * milestone is close the chip shows the style alone, exactly as in V2.
 *
 * Pure and deterministic. It reads no clock, no `Math.random` and no simulation random stream, and nothing it returns
 * is saved, so no persisted format changes and no match result can depend on it.
 */
export const PLAYER_IDENTITY_V3_VERSION = "LC_PLAYER_IDENTITY_V3" as const;

/**
 * Display rules. Design choices for playtests, not calibration. League marks are smaller than the E6 career steps so
 * that a live line can appear within a season: runs 100, 250, 500, then every 500; wickets 10, 25, 50, then every 25;
 * and a player's first league fifty and first league wicket.
 */
export const PLAYER_IDENTITY_V3_RULES = {
  /** A runs mark (or a first fifty) is shown live only when this many runs or fewer are needed. */
  liveRunsWithin: 10,
  /** A wickets mark is shown live only when this many wickets or fewer are needed. */
  liveWicketsWithin: 2,
  /** League runs marks before the regular step. */
  runsMarks: [100, 250, 500] as readonly number[],
  /** After the last of `runsMarks`, every this many runs. */
  runsEvery: 500,
  /** League wickets marks before the regular step. */
  wicketsMarks: [10, 25, 50] as readonly number[],
  /** After the last of `wicketsMarks`, every this many wickets. */
  wicketsEvery: 25,
  /** The innings score that makes a fifty. */
  fifty: 50,
} as const;

/** What the match itself has recorded for the player in this innings. */
export interface LiveMatchLine {
  /** Runs in this innings' batting line (batters). */
  runs?: number;
  /** Wickets in this innings' bowling line (bowlers). */
  wickets?: number;
}

export interface LiveMilestone {
  kind: "RUNS" | "WICKETS";
  /** TOTAL: a league runs or wickets mark. FIRST_FIFTY and FIRST_WICKET: the player's first in the league. */
  mark: "TOTAL" | "FIRST_FIFTY" | "FIRST_WICKET";
  /** CLOSE: within the live threshold. REACHED: passed in this innings. */
  state: "CLOSE" | "REACHED";
  /** The mark: a league total, or 50 for a first fifty, or 1 for a first wicket. */
  target: number;
  /** Still needed; 0 once reached. */
  needed: number;
  /** League total before this match. */
  before: number;
  /** Recorded in this innings. */
  inMatch: number;
  /** The short text shown in the chip. */
  visible: string;
  /** The full statement: added to the chip's title and screen-reader text. */
  sentence: string;
  /** Every number in `visible` and `sentence`. */
  facts: StoryFact[];
}

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/** The league marks in ascending order: the listed ones, then every `every` after the last. */
function markAbove(value: number, marks: readonly number[], every: number): number {
  for (const mark of marks) if (mark > value) return mark;
  const last = marks[marks.length - 1]!;
  return last + (Math.floor((value - last) / every) + 1) * every;
}
function markAtOrBelow(value: number, marks: readonly number[], every: number): number {
  let found = 0;
  for (const mark of marks) if (mark <= value) found = mark;
  const last = marks[marks.length - 1]!;
  return value >= last ? last + Math.floor((value - last) / every) * every : found;
}

/**
 * The live milestone for one player, or null when none is close or reached, when there is no career record, or when
 * the match line is missing. A batter's runs and a bowler's wickets are checked separately: `kind` picks which.
 * When more than one applies: a league total reached in this innings, then a first fifty or first wicket reached in
 * this innings, then a league total close, then a first fifty close. A first wicket is only ever shown as reached.
 */
export function liveMilestone(
  record: CareerIntroRecord | null,
  kind: "BATTER" | "BOWLER",
  line: LiveMatchLine | null,
): LiveMilestone | null {
  if (!record || !line) return null;
  const batting = kind === "BATTER";
  const inMatch = count(batting ? line.runs : line.wickets);
  if (inMatch === null) return null;
  const rules = PLAYER_IDENTITY_V3_RULES;
  const before = batting ? record.runs : record.wickets;
  const marks = batting ? rules.runsMarks : rules.wicketsMarks;
  const every = batting ? rules.runsEvery : rules.wicketsEvery;
  const within = batting ? rules.liveRunsWithin : rules.liveWicketsWithin;
  const unit = batting ? "runs" : "wickets";
  const kindOf = batting ? "RUNS" : "WICKETS";
  const total = before + inMatch;
  const tallyFacts = (): StoryFact[] => [
    { key: "before", value: before },
    { key: "inMatch", value: inMatch },
    { key: "total", value: total },
  ];
  const tally = `League ${unit}: ${before} before this match, ${inMatch} in this innings, ${total} in all.`;
  const base = { kind: kindOf, before, inMatch } as const;

  // 1. A league total reached in this innings.
  const passed = markAtOrBelow(total, marks, every);
  if (passed > before) {
    return {
      ...base, mark: "TOTAL", state: "REACHED", target: passed, needed: 0,
      visible: `Reached ${passed} league ${unit}`,
      sentence: `${tally} Reached ${passed} league ${unit} in this innings.`,
      facts: [...tallyFacts(), { key: "target", value: passed }],
    };
  }

  // 2. A first league fifty or first league wicket in this innings.
  const noFifty = record.fifties + record.hundreds === 0;
  const innings = record.battingInnings;
  const priorFifties = innings === 0
    ? "No league innings before this match."
    : `No fifty in ${innings} league innings before this match.`;
  const firstFacts = (): StoryFact[] => [
    { key: "inMatch", value: inMatch },
    ...(innings > 0 ? [{ key: "battingInnings", value: innings }] : []),
  ];
  if (batting && noFifty && inMatch >= rules.fifty) {
    return {
      ...base, mark: "FIRST_FIFTY", state: "REACHED", target: rules.fifty, needed: 0,
      visible: "First league fifty",
      sentence: `First league fifty: ${inMatch} in this innings. ${priorFifties}`,
      facts: [...firstFacts(), { key: "target", value: rules.fifty }],
    };
  }
  if (!batting && before === 0 && inMatch >= 1) {
    const priorBowling = record.bowlingInnings === 0
      ? "No league bowling before this match."
      : `No league wicket in ${record.bowlingInnings} ${record.bowlingInnings === 1 ? "match" : "matches"} bowled before this one.`;
    return {
      ...base, mark: "FIRST_WICKET", state: "REACHED", target: 1, needed: 0,
      visible: "First league wicket",
      sentence: `First league wicket: ${inMatch} in this innings. ${priorBowling}`,
      facts: [
        { key: "inMatch", value: inMatch },
        ...(record.bowlingInnings > 0 ? [{ key: "bowlingInnings", value: record.bowlingInnings }] : []),
        { key: "target", value: 1 },
      ],
    };
  }

  // 3. A league total close.
  const target = markAbove(total, marks, every);
  const needed = target - total;
  if (needed <= within) {
    const more = needed === 1 ? "One more" : `${needed} more`;
    return {
      ...base, mark: "TOTAL", state: "CLOSE", target, needed,
      visible: `${more} for ${target} league ${unit}`,
      sentence: `${tally} ${needed === 1 ? `One ${batting ? "run" : "wicket"}` : `${needed} ${unit}`} short of ${target}.`,
      facts: [...tallyFacts(), { key: "target", value: target }, { key: "needed", value: needed }],
    };
  }

  // 4. A first league fifty close.
  const short = rules.fifty - inMatch;
  if (batting && noFifty && short <= rules.liveRunsWithin) {
    return {
      ...base, mark: "FIRST_FIFTY", state: "CLOSE", target: rules.fifty, needed: short,
      visible: `${short === 1 ? "One more" : `${short} more`} for first league fifty`,
      sentence: `${inMatch} in this innings. ${priorFifties} ${short === 1 ? "One run" : `${short} runs`} short of a first league fifty.`,
      facts: [...firstFacts(), { key: "needed", value: short }],
    };
  }
  return null;
}

export interface MatchIntroV3 extends MatchIntro {
  /** The live milestone shown instead of the style once the player has faced or bowled, or null. */
  live: LiveMilestone | null;
}

/**
 * The chip's content. Before the batter faces or the bowler bowls in the innings it is the V2 introduction unchanged.
 * After that it is the live milestone when one is close or reached, otherwise the style alone (as in V2).
 */
export function matchIntroductionV3(
  name: string,
  style: PlayingStyle,
  kind: "BATTER" | "BOWLER",
  record: CareerIntroRecord | null,
  isNew: boolean,
  line: LiveMatchLine | null,
): MatchIntroV3 {
  const intro = matchIntroductionV2(name, style, kind, record, isNew);
  const live = isNew ? null : liveMilestone(record, kind, line);
  if (!live) return { ...intro, live: null };
  return {
    ...intro,
    visible: live.visible,
    sentence: `${intro.sentence} ${live.sentence}`,
    facts: [...intro.facts, ...live.facts],
    live,
  };
}
