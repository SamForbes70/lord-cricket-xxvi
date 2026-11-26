import type { CareerIntroRecord, LiveMatchLine, PlayingStyle } from "@lcxxvi/projections";
import { matchIntroductionV3 } from "@lcxxvi/projections";

/**
 * Player identity on the match screen: a compact chip in an active player's row. Before a batter faces a ball or a
 * bowler bowls in the innings it introduces them; after that it shows the style alone. The full introduction is the
 * chip's title and its screen-reader text. It sits inside the row so the first screen keeps its height (dugout-view
 * and match specs measure it).
 *
 * LC_PLAYER_IDENTITY_V1 without a career record ("Walks out: Anchor"). LC_PLAYER_IDENTITY_V2 in a managed career
 * match, where the career handed over the league record before this match ("Walks out: 412 runs, best 77*").
 * LC_PLAYER_IDENTITY_V3 adds, once the player has faced or bowled, a league milestone that is close or reached from
 * the pre-match record plus this innings' scorecard line ("8 more for 500 league runs"), and, when `onOpen` is given,
 * makes the chip a button that opens the player's page in career inspection while the match is kept.
 */
export function MatchStyleChip({ playerId, name, style, kind, isNew, record = null, line = null, onOpen, openDisabled = false }: {
  playerId: string;
  name: string;
  style: PlayingStyle;
  kind: "BATTER" | "BOWLER";
  isNew: boolean;
  record?: CareerIntroRecord | null;
  /** This innings' scorecard line for the player, for the live milestone. */
  line?: LiveMatchLine | null;
  /** Opens the player page without leaving the match (career inspection). Omitted where that is not safe. */
  onOpen?: (() => void) | undefined;
  openDisabled?: boolean;
}) {
  const intro = matchIntroductionV3(name, style, kind, record, isNew, line);
  const spoken = isNew ? intro.sentence : `Playing style: ${style.label}.${intro.live ? ` ${intro.live.sentence}` : ""}`;
  const content = (
    <>
      <i aria-hidden="true">{intro.visible}</i>
      <em className="sr-only">{spoken}</em>
    </>
  );
  return (
    <small
      className="match-style"
      data-testid={`match-intro-${playerId}`}
      data-new={isNew ? "true" : "false"}
      data-source={intro.source}
      {...(intro.live ? { "data-live": intro.live.state } : {})}
      title={intro.sentence}
    >
      {onOpen ? (
        <button
          type="button"
          className="match-style-open"
          data-testid={`match-intro-open-${playerId}`}
          disabled={openDisabled}
          onClick={onOpen}
        >
          {content}
          <em className="sr-only"> Opens {name}&apos;s player page; the match is kept.</em>
        </button>
      ) : (
        content
      )}
    </small>
  );
}
