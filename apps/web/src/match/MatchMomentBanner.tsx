import { useEffect, useRef, useState, type ReactNode } from "react";
import { MOMENT_DURATION_MS, type MatchMoment, type MomentsPreference } from "./match-moments.js";

export interface ShownMoment {
  moment: MatchMoment;
  summary: string | null;
  /** Changes for every moment shown, so the same moment is never shown twice and a new one restarts the timer. */
  token: number;
}

/**
 * CP04: a short broadcast moment over the "This ball" panel. It never covers the score or the decision controls, it
 * blocks nothing (the controls stay usable while it shows), a new moment replaces it, and it clears itself after a
 * few seconds, at once on "Dismiss", or never while the pointer or keyboard focus is on it. Motion comes only from
 * CSS that is switched off under prefers-reduced-motion and the match's Reduced motion setting: then it is a static
 * caption. Presentation only: it renders a moment derived from the authoritative view and changes nothing.
 */
export function MatchMomentBanner({ shown, mode, portrait, crest, onDone }: {
  shown: ShownMoment;
  mode: Exclude<MomentsPreference, "off">;
  portrait: (playerId: string) => ReactNode;
  crest: (teamId: string) => ReactNode;
  onDone: () => void;
}) {
  const { moment, summary } = shown;
  const [held, setHeld] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const duration = moment.kind === "RESULT" ? MOMENT_DURATION_MS[mode] + 1800 : MOMENT_DURATION_MS[mode];
  useEffect(() => {
    if (held) return undefined;
    const timer = window.setTimeout(() => done.current(), duration);
    return () => window.clearTimeout(timer);
  }, [shown.token, held, duration]);
  const art = mode === "full"
    ? moment.playerId ? portrait(moment.playerId) : moment.teamId ? crest(moment.teamId) : null
    : null;
  return (
    <aside
      className="match-moment"
      data-testid="match-moment"
      data-kind={moment.kind}
      data-mode={mode}
      data-held={held ? "true" : undefined}
      aria-label="Match moment"
      style={{ ["--moment-ms" as string]: `${duration}ms` }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {art && <span className="moment-art" aria-hidden="true">{art}</span>}
      <span className="moment-text">
        <strong className="moment-word">{moment.word}</strong>
        <span className="moment-line">{moment.line}</span>
        {mode === "full" && (moment.detail || summary) && (
          <span className="moment-detail">{[moment.detail, summary].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <button type="button" className="moment-dismiss" aria-label="Dismiss moment" title="Dismiss" onClick={() => done.current()}>
        <span aria-hidden="true">×</span>
      </button>
      <span className="moment-timer" aria-hidden="true" />
    </aside>
  );
}
