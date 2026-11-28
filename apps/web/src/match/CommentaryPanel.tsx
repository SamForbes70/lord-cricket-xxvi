/**
 * CP10 (commentary): the match page's commentary panel. Ball-by-ball commentary, latest first, with each ball's
 * number as a label and each over's summary as a band; the captain's notes (plans and field changes) in their own
 * collapsed list. Presentation only: every line is the feed entry the match worker sent, chosen by the existing
 * verbosity setting. Not a live region: the panel never announces itself while play goes on.
 */
import type { CommentaryEntry } from "@lcxxvi/contracts";
import { selectCommentaryTextForMode } from "@lcxxvi/projections";
import { milestoneLabel, splitBallLine, splitCommentary } from "./commentary-view.js";
import "./commentary.css";

type Mode = "full" | "detailed" | "brief" | "off";

function Line({ text }: { text: string }) {
  const ball = splitBallLine(text);
  if (!ball) return <span className="commentary-text">{text}</span>;
  return (
    <span className="commentary-text">
      <span className="sr-only">{ball.innings}</span>
      <span className="commentary-ball">{ball.ball}</span>
      <span className="sr-only">{ball.separator}</span>
      {ball.rest}
    </span>
  );
}

export function CommentaryPanel({
  entries,
  mode,
  windowSize,
  showAll,
  onToggleShowAll,
}: {
  entries: readonly CommentaryEntry[];
  mode: Mode;
  windowSize: number;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const { play, notes } = splitCommentary(entries);
  const latest = play.at(-1)?.sequence;
  const shown = (showAll ? play : play.slice(-windowSize)).slice().reverse();
  return (
    <section className="panel commentary" data-testid="match-commentary-panel" data-mode={mode}>
      <h2>Commentary</h2>
      <p className="commentary-intro">From accepted match events only. Latest first.</p>
      {mode === "off" ? (
        <p>Commentary hidden. Match decisions remain above.</p>
      ) : (
        <>
          <ol reversed className="commentary-feed" aria-label="Ball-by-ball commentary, latest first">
            {shown.map((e) => (
              <li
                key={e.sequence}
                data-category={e.category}
                data-moment={e.sequence === latest && (e.category === "DISMISSAL" || e.category === "MILESTONE" || e.category === "RESULT" || !!e.milestoneTags?.length)}
              >
                <Line text={selectCommentaryTextForMode(e, mode)} />
                {mode !== "brief" && e.milestoneTags && e.milestoneTags.length > 0 && (
                  <span className="commentary-milestones" aria-label="Milestones">
                    {e.milestoneTags.map((tag) => (
                      <span key={tag} className="commentary-milestone-badge">
                        {milestoneLabel(tag)}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {play.length > windowSize && (
            <button type="button" className="secondary" onClick={onToggleShowAll}>
              {showAll ? `Show the latest ${windowSize} entries` : `Show all ${play.length} entries`}
            </button>
          )}
          {notes.length > 0 && (
            <details className="captains-notes">
              <summary>Captain&apos;s notes ({notes.length})</summary>
              <p className="commentary-intro">Plans and field changes, latest first.</p>
              <ul>
                {notes.slice(-60).reverse().map((n) => (
                  <li key={n.entry.sequence} data-category={n.entry.category}>
                    <span className="captains-note-when">{n.when}</span>{" "}
                    <span>{selectCommentaryTextForMode(n.entry, mode === "brief" ? "full" : mode)}</span>
                  </li>
                ))}
              </ul>
              {notes.length > 60 && <p className="commentary-intro">The latest 60 of {notes.length} notes.</p>}
            </details>
          )}
        </>
      )}
    </section>
  );
}
