import type { View } from "./protocol.js";
import { coachTip } from "./coach-tips.js";

/**
 * The guided first match (owner order of 20 November 2026, step 2): a coach card above the decision tray that explains
 * what the current decision is and how to answer it. Advice only: it never makes a choice, and it reads the same
 * committed view as the rest of the screen. Ends when the player says so.
 */
export function GuidedCoach({ view, onEnd, yourMove }: { view: View; onEnd: () => void; yourMove: boolean }) {
  const tip = coachTip(view);
  // CP12 (CD-052): when the decision is the player's, the coach names the control and points down at the decision
  // tray directly below it, which carries a matching outline. When the computer captain is deciding, it says so.
  const pointing = yourMove && Boolean(tip.control);
  return (
    <aside className="guided-coach" aria-label="Guide" data-testid="guided-coach" data-pointing={pointing ? "true" : "false"}>
      <div>
        <p className="guided-step">Guided first match</p>
        <h2>{tip.title}</h2>
        <p>{tip.text}</p>
        {pointing && (
          <p className="guided-move" data-testid="guided-move">
            <span aria-hidden="true">&#9660;</span> Your move: <strong>{tip.control}</strong>, in the Next decision panel just below.
          </p>
        )}
        {!yourMove && view.phase !== "COMPLETE" && (
          <p className="guided-move" data-testid="guided-move">The computer captain is making this decision for the other side. Watch the panel below.</p>
        )}
      </div>
      <div className="guided-actions">
        {view.phase === "COMPLETE" && <a className="button-link" href="#title">Back to the title screen</a>}
        <button type="button" onClick={onEnd}>End the guide</button>
      </div>
    </aside>
  );
}

