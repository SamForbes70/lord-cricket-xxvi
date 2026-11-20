import type { View } from "./protocol.js";

type Cue = NonNullable<NonNullable<View["fieldPresentation"]>["latestHighlight"]>;

export const DISMISSAL: Record<NonNullable<Cue["dismissalKind"]>, string> = {
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
