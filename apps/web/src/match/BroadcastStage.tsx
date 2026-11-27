import type { View } from "./protocol.js";
import { ballCall, DISMISSAL } from "./ball-call.js";
import { stageOverText } from "./broadcast-labels.js";
import { groupBallsByOver } from "./chart-layout.js";
import "./match-broadcast.css";

/**
 * The broadcast "this ball" stage (visual overhaul, owner order 20 November 2026, step 1): the latest delivery as a big
 * call (SIX, FOUR, WICKET, runs, dot or extra) with who bowled to whom, and the innings' recent balls as a strip.
 * Boundaries and wickets get a short moment (a flash and a lift) keyed to the delivery, so it plays once per ball and
 * is off under reduced motion. Presentation only: it reads the committed field presentation and changes nothing.
 * Names appear inside a sentence, never alone, so lookups by a player's exact name still find a single element.
 */
export function stageShows(view: View): boolean {
  const cue = view.fieldPresentation?.latestHighlight;
  return Boolean(cue && cue.inningsIndex === view.activeIndex);
}

/**
 * CP04: `quiet` while a batched advance runs (Finish innings, Finish match, Next key moment). The stage still shows
 * the latest ball, but its flash and lift are not replayed for every over the batch passes through.
 */
export function BroadcastStage({ view, quiet = false }: { view: View; quiet?: boolean }) {
  const presentation = view.fieldPresentation;
  const cue = presentation?.latestHighlight;
  if (!presentation || !cue || cue.inningsIndex !== view.activeIndex) return null;
  const balls = presentation.recentHighlights.filter((c) => c.inningsIndex === view.activeIndex).slice(-12);
  const call = ballCall(cue);
  const legal = view.innings[view.activeIndex]?.innings.legalBalls ?? null;
  // CP03 drew a divider where one over ends and the next begins; CP08 (CD-018) groups the balls by over and names each
  // over, read from each ball's own over label ("4.3" is the third ball of over 5).
  const overs = groupBallsByOver(balls);
  return (
    <section className="broadcast-stage" aria-label="This ball" data-moment={call.kind} data-quiet={quiet ? "true" : undefined} data-testid="broadcast-stage">
      <div className="stage-glow" key={`glow-${cue.sequence}`} aria-hidden="true" />
      <div className="stage-call" key={cue.sequence} data-kind={call.kind}>
        <span className="stage-over">{stageOverText(cue.overBallLabel, legal, true)}</span>
        <strong className="stage-word">{call.word}</strong>
        <span className="stage-line">
          {cue.bowlerName} to {cue.strikerName}
          {cue.dismissalKind && cue.dismissedPlayerName ? ` · ${cue.dismissedPlayerName} ${DISMISSAL[cue.dismissalKind]}` : ""}
        </span>
      </div>
      {balls.length > 0 && (
        <ol className="stage-balls" aria-label="Recent balls this innings">
          {overs.map((group, g) => (
            <li key={group.balls[0]!.sequence} className="stage-over-group" data-new-over={g > 0 ? "true" : undefined}>
              <span className="stage-over-number">{Number.isNaN(group.over) ? "Over" : `Over ${group.over}`}</span>
              <ol className="stage-over-balls">
                {group.balls.map((ball) => {
                  const b = ballCall(ball);
                  return (
                    <li key={ball.sequence} className="stage-ball" data-kind={b.kind} title={`${ball.overBallLabel}: ${b.word.toLowerCase()}`}>
                      <span aria-hidden="true">{b.chip}</span>
                      <span className="sr-only">{`${ball.overBallLabel}: ${b.word.toLowerCase()}`}</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

