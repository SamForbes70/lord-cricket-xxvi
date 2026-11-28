/**
 * CP10 (commentary), Studio Production Directive 05: how the commentary feed is laid out on the match page. Pure: it
 * reads the entries the match worker already sends (`view.commentary`) and decides nothing about the cricket.
 *
 * - Captain's notes (batting and bowling plans, field changes) are separated from the ball-by-ball commentary, so the
 *   commentary reads as commentary rather than a log (CD-019). The feed itself still has one entry per event.
 * - A ball line's "Innings 1, 4.3: " prefix is split off so the page can show the ball number as a label while the
 *   line's text, and what a screen reader hears, stay exactly as the feed gives them.
 */
import type { CommentaryEntry, CommentaryMilestoneTag } from "@lcxxvi/contracts";

/** Events whose entries are a captain's decisions rather than something that happened on the field. */
export const CAPTAINS_NOTE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "BATTING_PLAN_CHANGED",
  "BOWLING_PLAN_CHANGED",
  "FIELD_CHANGED",
]);

export interface CaptainsNote {
  readonly entry: CommentaryEntry;
  /** Where in the match the note was made: "Before the first ball", or "After 4.3" (innings 2 on: "Innings 2, after 4.3"). */
  readonly when: string;
}

export interface CommentarySplit {
  readonly play: CommentaryEntry[];
  readonly notes: CaptainsNote[];
}

const BALL_PREFIX = /^(Innings (\d+), )(\d+\.\d+)(: )/;

/** Splits the feed into ball-by-ball commentary and captain's notes, in feed order. */
export function splitCommentary(entries: readonly CommentaryEntry[]): CommentarySplit {
  const play: CommentaryEntry[] = [];
  const notes: CaptainsNote[] = [];
  let lastBall: { innings: string; ball: string } | null = null;
  for (const entry of entries) {
    if (CAPTAINS_NOTE_EVENT_TYPES.has(entry.eventType)) {
      const when = lastBall === null
        ? "Before the first ball"
        : lastBall.innings === "1"
          ? `After ${lastBall.ball}`
          : `Innings ${lastBall.innings}, after ${lastBall.ball}`;
      notes.push({ entry, when });
      continue;
    }
    play.push(entry);
    if (entry.eventType === "DELIVERY_RECORDED") {
      const match = BALL_PREFIX.exec(entry.text);
      if (match) lastBall = { innings: match[2]!, ball: match[3]! };
    }
  }
  return { play, notes };
}

export interface BallLine {
  /** "Innings 1, " (kept for screen readers and copied text; not shown). */
  readonly innings: string;
  /** "4.3", shown as the ball's label. */
  readonly ball: string;
  /** ": " (kept for screen readers and copied text; not shown). */
  readonly separator: string;
  readonly rest: string;
}

/** The parts of a ball line, or null for any other line (over summaries, selections, results, brief mode). */
export function splitBallLine(text: string): BallLine | null {
  const match = BALL_PREFIX.exec(text);
  if (!match) return null;
  return { innings: match[1]!, ball: match[3]!, separator: match[4]!, rest: text.slice(match[0].length) };
}

const MILESTONE_LABELS: Readonly<Record<CommentaryMilestoneTag, string>> = {
  BATTER_FIFTY: "Fifty",
  BATTER_CENTURY: "Hundred",
  BATTER_150: "150",
  BATTER_DOUBLE_CENTURY: "Double hundred",
  PARTNERSHIP_FIFTY: "50 stand",
  PARTNERSHIP_CENTURY: "100 stand",
  PARTNERSHIP_150: "150 stand",
  BOWLER_THREE_FOR: "Three wickets",
  BOWLER_FIVE_FOR: "Five wickets",
  MAIDEN_OVER: "Maiden",
  ALL_OUT: "All out",
  WINNING_DELIVERY: "Winning runs",
};

/** A milestone tag in words ("Fifty", "50 stand"), not the contract's enum casing. */
export function milestoneLabel(tag: CommentaryMilestoneTag): string {
  return MILESTONE_LABELS[tag] ?? tag.replaceAll("_", " ").toLowerCase();
}
