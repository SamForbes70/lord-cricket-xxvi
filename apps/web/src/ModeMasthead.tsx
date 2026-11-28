import type { ReactNode } from "react";
import "./masthead.css";

/** Where the masthead's back control goes: a route (`href`) or an in-screen step back (`onClick`). */
export type MastheadBack = { label: string; href: string } | { label: string; onClick: () => void; disabled?: boolean };

/**
 * CP02B (CD-026, CD-027): one masthead for the screens outside the career (match setup and the live match,
 * tournaments, scenarios, rain and player reviews). The same order everywhere: an optional back control, the game's
 * name as the eyebrow, then the screen's own title as the page's one `h1`. `compact` is the match screen's single
 * broadcast line. Presentation only: it reads nothing and changes nothing.
 */
export function ModeMasthead({
  title,
  eyebrow = "Lord Cricket XXVI",
  back,
  titleId,
  compact = false,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: MastheadBack | undefined;
  titleId?: string | undefined;
  compact?: boolean;
  /** Extra controls at the end of the bar (a status, a save badge). */
  children?: ReactNode;
}) {
  return (
    <header className={`masthead mode-masthead${compact ? " mode-masthead-compact" : ""}`} data-testid="mode-masthead">
      {back &&
        ("href" in back ? (
          <a className="mode-masthead-back" href={back.href}>
            <span aria-hidden="true">‹</span>
            {back.label}
          </a>
        ) : (
          <button type="button" className="mode-masthead-back" onClick={back.onClick} disabled={back.disabled}>
            <span aria-hidden="true">‹</span>
            {back.label}
          </button>
        ))}
      <div className="mode-masthead-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
      </div>
      {children && <div className="mode-masthead-end">{children}</div>}
    </header>
  );
}
