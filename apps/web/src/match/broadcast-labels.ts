import type { View } from "./protocol.js";

/**
 * CP03: words for the live match screen that come only from the authoritative view, so the screen never states
 * anything the match state does not.
 */

/**
 * The bowler card's heading. Between overs the card already shows the bowler who will bowl the next ball while the
 * "this ball" stage still names the bowler of the last ball, so the card says "Bowling next" whenever the two differ.
 */
export function bowlerCardLabel(view: Pick<View, "activeIndex" | "fieldPresentation" | "resultText">, bowlerId: string | null): string {
  const cue = view.fieldPresentation?.latestHighlight ?? null;
  if (!view.resultText && bowlerId && cue && cue.inningsIndex === view.activeIndex && cue.bowlerId !== bowlerId) return "Bowling next";
  return "Bowler";
}

/** How far each primary advance goes from here, in legal balls of the current over (six-ball overs in every format). */
export function advanceEffectText(legalBalls: number): string {
  const left = 6 - (legalBalls % 6);
  const over = Math.floor(legalBalls / 6) + 1;
  return `Over ${over}: ${left} legal ${left === 1 ? "ball" : "balls"} to go`;
}

/** The stage's over line: the ball's own label, and "end of over" when that ball completed the over. */
export function stageOverText(overBallLabel: string, inningsLegalBalls: number | null, isLatestOfInnings: boolean): string {
  const ended = isLatestOfInnings && inningsLegalBalls !== null && inningsLegalBalls > 0 && inningsLegalBalls % 6 === 0;
  return ended ? `Over ${overBallLabel} · end of over` : `Over ${overBallLabel}`;
}
