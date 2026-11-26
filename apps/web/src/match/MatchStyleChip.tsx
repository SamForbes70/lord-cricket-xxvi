import type { PlayingStyle } from "@lcxxvi/projections";
import { matchIntroduction } from "@lcxxvi/projections";

/**
 * LC_PLAYER_IDENTITY_V1 on the match screen: a compact chip in an active player's row. Before a batter faces a ball
 * or a bowler bowls in the innings it introduces them ("Walks out: Anchor"); after that it shows the style alone.
 * The full introduction, with the ratings behind the style, is the chip's title and its screen-reader text. It sits
 * inside the row so the first screen keeps its height (dugout-view and match specs measure it).
 */
export function MatchStyleChip({ playerId, name, style, kind, isNew }: {
  playerId: string;
  name: string;
  style: PlayingStyle;
  kind: "BATTER" | "BOWLER";
  isNew: boolean;
}) {
  const sentence = matchIntroduction(name, style, kind);
  const visible = isNew ? `${kind === "BATTER" ? "Walks out" : "On to bowl"}: ${style.label}` : style.label;
  return (
    <small className="match-style" data-testid={`match-intro-${playerId}`} data-new={isNew ? "true" : "false"} title={sentence}>
      <i aria-hidden="true">{visible}</i>
      <em className="sr-only">{isNew ? sentence : `Playing style: ${style.label}.`}</em>
    </small>
  );
}
