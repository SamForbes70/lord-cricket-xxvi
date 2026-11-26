import { PLAYER_IDENTITY_RULES } from "./player-identity.js";
import type { PlayingStyle, StoryFact } from "./player-identity-v1.js";
import { matchIntroductionV2, type CareerIntroRecord, type MatchIntro } from "./player-identity-v2.js";

/**
 * LC_PLAYER_IDENTITY_V3 (Pavilion entertainment track, slice 3, 26 November 2026). One presentation-only addition to
 * the V2 match introductions: a live milestone line.
 *
 * In a managed career T20 match the chip of a batter who has faced, or a bowler who has bowled, states a league
 * milestone when it is genuinely close or has just been reached, such as "8 more for 500 league runs" or "Reached 25
 * league wickets". The total is the V2 pre-match league record plus this innings' scorecard line for the player, as the
 * match has recorded it: runs from the batting line, wickets from the bowling line. Nothing is predicted. When no
 * milestone is close the chip shows the style alone, exactly as in V2.
 *
 * Pure and deterministic. It reads no clock, no `Math.random` and no simulation random stream, and nothing it returns
 * is saved, so no persisted format changes and no match result can depend on it.
 */
export const PLAYER_IDENTITY_V3_VERSION = "LC_PLAYER_IDENTITY_V3" as const;

/** Display rules. Design choices for playtests, not calibration. Milestones are the E6 steps (500 runs, 25 wickets). */
export const PLAYER_IDENTITY_V3_RULES = {
  /** A runs milestone is shown live only when this many runs or fewer are needed. */
  liveRunsWithin: 10,
  /** A wickets milestone is shown live only when this many wickets or fewer are needed. */
  liveWicketsWithin: 2,
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
  /** CLOSE: within the live threshold. REACHED: passed in this innings. */
  state: "CLOSE" | "REACHED";
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

/**
 * The live milestone for one player, or null when none is close or reached, when there is no career record, or when
 * the match line is missing. A batter's runs and a bowler's wickets are checked separately: `kind` picks which.
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
  const before = batting ? record.runs : record.wickets;
  const step = batting ? PLAYER_IDENTITY_RULES.runsStep : PLAYER_IDENTITY_RULES.wicketsStep;
  const within = batting ? PLAYER_IDENTITY_V3_RULES.liveRunsWithin : PLAYER_IDENTITY_V3_RULES.liveWicketsWithin;
  const unit = batting ? "runs" : "wickets";
  const total = before + inMatch;
  const passed = Math.floor(total / step) * step;
  const facts: StoryFact[] = [
    { key: "before", value: before },
    { key: "inMatch", value: inMatch },
    { key: "total", value: total },
  ];
  const tally = `League ${unit}: ${before} before this match, ${inMatch} in this innings, ${total} in all.`;
  if (passed > 0 && passed > before) {
    facts.push({ key: "target", value: passed });
    return {
      kind: batting ? "RUNS" : "WICKETS",
      state: "REACHED",
      target: passed,
      needed: 0,
      before,
      inMatch,
      visible: `Reached ${passed} league ${unit}`,
      sentence: `${tally} Reached ${passed} league ${unit} in this innings.`,
      facts,
    };
  }
  const target = passed + step;
  const needed = target - total;
  if (needed > within) return null;
  facts.push({ key: "target", value: target }, { key: "needed", value: needed });
  const more = needed === 1 ? "One more" : `${needed} more`;
  return {
    kind: batting ? "RUNS" : "WICKETS",
    state: "CLOSE",
    target,
    needed,
    before,
    inMatch,
    visible: `${more} for ${target} league ${unit}`,
    sentence: `${tally} ${needed === 1 ? `One ${batting ? "run" : "wicket"}` : `${needed} ${unit}`} short of ${target}.`,
    facts,
  };
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
