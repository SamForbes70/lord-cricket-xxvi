import type { View } from "./protocol.js";

type Cue = NonNullable<NonNullable<View["fieldPresentation"]>["latestHighlight"]>;

/**
 * The broadcast "this ball" stage (visual overhaul, owner order 20 November 2026, step 1): the latest delivery as a big
 * call (SIX, FOUR, WICKET, runs, dot or extra) with who bowled to whom, and the innings' recent balls as a strip.
 * Boundaries and wickets get a short moment (a flash and a lift) keyed to the delivery, so it plays once per ball and
 * is off under reduced motion. Presentation only: it reads the committed field presentation and changes nothing.
 * Names appear inside a sentence, never alone, so lookups by a player's exact name still find a single element.
 */
export function BroadcastStage({ view }: { view: View }) {
  const presentation = view.fieldPresentation;
  const cue = presentation?.latestHighlight;
  if (!presentation || !cue || cue.inningsIndex !== view.activeIndex) return null;
  const balls = presentation.recentHighlights.filter((c) => c.inningsIndex === view.activeIndex).slice(-12);
  const call = ballCall(cue);
  return (
    <section className="broadcast-stage" aria-label="This ball" data-moment={call.kind} data-testid="broadcast-stage">
      <div className="stage-glow" key={`glow-${cue.sequence}`} aria-hidden="true" />
      <div className="stage-call" key={cue.sequence} data-kind={call.kind}>
        <span className="stage-over">Over {cue.overBallLabel}</span>
        <strong className="stage-word">{call.word}</strong>
        <span className="stage-line">
          {cue.bowlerName} to {cue.strikerName}
          {cue.dismissalKind && cue.dismissedPlayerName ? ` · ${cue.dismissedPlayerName} ${DISMISSAL[cue.dismissalKind]}` : ""}
        </span>
      </div>
      {balls.length > 0 && (
        <ol className="stage-balls" aria-label="Recent balls this innings">
          {balls.map((ball) => {
            const b = ballCall(ball);
            return (
              <li key={ball.sequence} data-kind={b.kind} title={`${ball.overBallLabel}: ${b.word.toLowerCase()}`}>
                {b.chip}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const DISMISSAL: Record<NonNullable<Cue["dismissalKind"]>, string> = {
  BOWLED: "bowled",
  LBW: "lbw",
  CAUGHT: "caught",
  RUN_OUT: "run out",
  STUMPED: "stumped",
  HIT_WICKET: "hit wicket",
};

/** How a delivery is called on the stage and in the strip. Exported for tests. */
export function ballCall(cue: Pick<Cue, "dismissalKind" | "boundary" | "legality" | "runsScored">): {
  kind: "WICKET" | "SIX" | "FOUR" | "EXTRA" | "RUNS" | "DOT";
  word: string;
  chip: string;
} {
  if (cue.dismissalKind) return { kind: "WICKET", word: "Wicket", chip: "W" };
  if (cue.boundary === "SIX") return { kind: "SIX", word: "Six", chip: "6" };
  if (cue.boundary === "FOUR") return { kind: "FOUR", word: "Four", chip: "4" };
  if (cue.legality === "WIDE") return { kind: "EXTRA", word: cue.runsScored > 1 ? `Wide, ${cue.runsScored} runs` : "Wide", chip: "Wd" };
  if (cue.legality === "NO_BALL") return { kind: "EXTRA", word: cue.runsScored > 1 ? `No ball, ${cue.runsScored} runs` : "No ball", chip: "Nb" };
  if (cue.runsScored > 0) return { kind: "RUNS", word: cue.runsScored === 1 ? "1 run" : `${cue.runsScored} runs`, chip: String(cue.runsScored) };
  return { kind: "DOT", word: "Dot ball", chip: "·" };
}
