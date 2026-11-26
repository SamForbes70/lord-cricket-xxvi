import type { CareerIntroRecord, PlayingStyle } from "@lcxxvi/projections";
import { matchIntroductionV2 } from "@lcxxvi/projections";

/**
 * Player identity on the match screen: a compact chip in an active player's row. Before a batter faces a ball or a
 * bowler bowls in the innings it introduces them; after that it shows the style alone. The full introduction is the
 * chip's title and its screen-reader text. It sits inside the row so the first screen keeps its height (dugout-view
 * and match specs measure it).
 *
 * LC_PLAYER_IDENTITY_V1 without a career record ("Walks out: Anchor"). LC_PLAYER_IDENTITY_V2 in a managed career
 * match, where the career handed over the league record before this match ("Walks out: 412 runs, best 77*").
 */
export function MatchStyleChip({ playerId, name, style, kind, isNew, record = null }: {
  playerId: string;
  name: string;
  style: PlayingStyle;
  kind: "BATTER" | "BOWLER";
  isNew: boolean;
  record?: CareerIntroRecord | null;
}) {
  const intro = matchIntroductionV2(name, style, kind, record, isNew);
  return (
    <small
      className="match-style"
      data-testid={`match-intro-${playerId}`}
      data-new={isNew ? "true" : "false"}
      data-source={intro.source}
      title={intro.sentence}
    >
      <i aria-hidden="true">{intro.visible}</i>
      <em className="sr-only">{isNew ? intro.sentence : `Playing style: ${style.label}.`}</em>
    </small>
  );
}
