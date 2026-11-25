import type { View } from "./protocol.js";
import { coachTip } from "./coach-tips.js";

/**
 * The guided first match (owner order of 20 November 2026, step 2): a coach card above the decision tray that explains
 * what the current decision is and how to answer it. Advice only: it never makes a choice, and it reads the same
 * committed view as the rest of the screen. Ends when the player says so.
 */
export function GuidedCoach({ view, onEnd }: { view: View; onEnd: () => void }) {
  const tip = coachTip(view);
  return (
    <aside className="guided-coach" aria-label="Guide" data-testid="guided-coach">
      <div>
        <p className="guided-step">Guided first match</p>
        <h2>{tip.title}</h2>
        <p>{tip.text}</p>
      </div>
      <div className="guided-actions">
        {view.phase === "COMPLETE" && <a className="button-link" href="#title">Back to the title screen</a>}
        <button type="button" onClick={onEnd}>End the guide</button>
      </div>
    </aside>
  );
}

