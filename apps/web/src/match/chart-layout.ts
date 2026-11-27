/**
 * CP08 statistical visualisation: pure layout for the completed match's charts. Everything here arranges numbers the
 * match analytics projection already produced (`@lcxxvi/projections` MatchAnalytics, built from accepted delivery
 * events); nothing here decides a cricket fact. Sizes are in CSS pixels at the chart's measured width, so text drawn
 * from these layouts is never scaled below its stated size.
 */

export type OverBar = Readonly<{ inningsIndex: number; overNumber: number; runs: number; wickets: number }>;

/** A step of 1, 2 or 5 times a power of ten, so that about `target` steps cover `max`. */
export function niceStep(max: number, target = 5): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const raw = max / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(1, step * power);
}

/** Ticks from 0 to the first multiple of the step at or above `max` (at least one step). */
export function niceTicks(max: number, target = 5): number[] {
  const step = niceStep(max, target);
  const top = Math.max(step, Math.ceil(Math.max(0, max) / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

/** Which over numbers carry a label: every over when they fit `minGap` pixels apart, else every 2nd, 5th, 10th... */
export function overLabelStep(overs: number, slotWidth: number, minGap = 26): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) if (step * slotWidth >= minGap || step >= overs) return step;
  return 100;
}

export type ManhattanLayout = Readonly<{
  width: number;
  height: number;
  plot: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  yTicks: readonly Readonly<{ value: number; y: number }>[];
  xLabels: readonly Readonly<{ over: number; x: number }>[];
  bars: readonly Readonly<{ inningsIndex: number; series: number; overNumber: number; runs: number; wickets: number; x: number; y: number; width: number; height: number }>[];
  wickets: readonly Readonly<{ inningsIndex: number; overNumber: number; cx: number; cy: number; r: number }>[];
}>;

/**
 * A grouped Manhattan: one slot per over, one bar per innings in `series` order inside the slot, a runs axis with
 * round ticks, and one wicket marker per wicket stacked above the bar (a count replaces the stack when it would not fit).
 */
export function manhattanLayout(overs: readonly OverBar[], series: readonly number[], width: number, height = 240, scale = 1, sharedMaxRuns?: number): ManhattanLayout {
  const plot = { left: 22 + 18 * scale, top: 14, right: Math.max(80, width - 10), bottom: height - 34 * scale };
  const maxOver = Math.max(1, ...overs.filter((o) => series.includes(o.inningsIndex)).map((o) => o.overNumber));
  // Small multiples (one chart per innings) pass the match's highest over so every chart shares one runs axis.
  const maxRuns = sharedMaxRuns ?? Math.max(1, ...overs.filter((o) => series.includes(o.inningsIndex)).map((o) => o.runs));
  // Leave room above the tallest bar for its wicket markers.
  const ticks = niceTicks(maxRuns * 1.15, 4);
  const top = ticks.at(-1)!;
  const plotHeight = plot.bottom - plot.top;
  const y = (runs: number) => plot.bottom - (runs / top) * plotHeight;
  const slot = (plot.right - plot.left) / maxOver;
  const groupWidth = slot * (series.length > 1 ? 0.84 : 0.7);
  const barWidth = groupWidth / Math.max(1, series.length);
  const r = Math.max(3, Math.min(5, barWidth / 2 - 0.5));
  const bars: ManhattanLayout["bars"][number][] = [];
  const wickets: ManhattanLayout["wickets"][number][] = [];
  for (const over of overs) {
    const s = series.indexOf(over.inningsIndex);
    if (s < 0) continue;
    const x = plot.left + (over.overNumber - 1) * slot + (slot - groupWidth) / 2 + s * barWidth;
    const barTop = y(over.runs);
    bars.push({ inningsIndex: over.inningsIndex, series: s, overNumber: over.overNumber, runs: over.runs, wickets: over.wickets, x, y: barTop, width: Math.max(1, barWidth - (series.length > 1 ? 1 : 0)), height: plot.bottom - barTop });
    for (let w = 0; w < over.wickets; w += 1) {
      wickets.push({ inningsIndex: over.inningsIndex, overNumber: over.overNumber, cx: x + barWidth / 2, cy: Math.max(plot.top + r, barTop - r - 2 - w * (2 * r + 1)), r });
    }
  }
  const step = overLabelStep(maxOver, slot, 26 * scale);
  const xLabels: { over: number; x: number }[] = [];
  for (let over = 1; over <= maxOver; over += 1) {
    if (over === 1 || over % step === 0) xLabels.push({ over, x: plot.left + (over - 0.5) * slot });
  }
  // Drop the label for over 1 when the next label would collide with it.
  if (xLabels.length > 1 && xLabels[1]!.x - xLabels[0]!.x < 22 * scale) xLabels.shift();
  return { width, height, plot, yTicks: ticks.map((value) => ({ value, y: y(value) })), xLabels, bars, wickets };
}

export type WormPointIn = Readonly<{ inningsIndex: number; legalBalls: number; totalRuns: number; wickets: number }>;
export type WormLayout = Readonly<{
  width: number;
  height: number;
  plot: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  yTicks: readonly Readonly<{ value: number; y: number }>[];
  xTicks: readonly Readonly<{ over: number; x: number }>[];
  lines: readonly Readonly<{ inningsIndex: number; series: number; points: string }>[];
  wickets: readonly Readonly<{ inningsIndex: number; series: number; x: number; y: number; wicket: number; runs: number; legalBalls: number }>[];
}>;

/** The worm: cumulative runs against overs, one line per innings, a marker where each wicket fell. */
export function wormLayout(points: readonly WormPointIn[], series: readonly number[], width: number, height = 260, scale = 1): WormLayout {
  const plot = { left: 22 + 22 * scale, top: 14, right: Math.max(90, width - 14), bottom: height - 38 * scale };
  const used = points.filter((p) => series.includes(p.inningsIndex));
  const maxBalls = Math.max(6, ...used.map((p) => p.legalBalls));
  const maxRuns = Math.max(1, ...used.map((p) => p.totalRuns));
  const yTicks = niceTicks(maxRuns, 4);
  const xOverTicks = niceTicks(Math.ceil(maxBalls / 6), Math.max(2, Math.min(5, Math.floor((plot.right - plot.left) / (60 * scale)))));
  const xMax = xOverTicks.at(-1)! * 6;
  const x = (balls: number) => plot.left + (balls / xMax) * (plot.right - plot.left);
  const y = (runs: number) => plot.bottom - (runs / yTicks.at(-1)!) * (plot.bottom - plot.top);
  const lines: WormLayout["lines"][number][] = [];
  const wickets: WormLayout["wickets"][number][] = [];
  series.forEach((inningsIndex, s) => {
    const own = used.filter((p) => p.inningsIndex === inningsIndex);
    if (own.length === 0) return;
    lines.push({ inningsIndex, series: s, points: [[x(0), y(0)], ...own.map((p) => [x(p.legalBalls), y(p.totalRuns)])].map(([px, py]) => `${round(px!)},${round(py!)}`).join(" ") });
    let prior = 0;
    for (const p of own) {
      for (let w = prior + 1; w <= p.wickets; w += 1) wickets.push({ inningsIndex, series: s, x: x(p.legalBalls), y: y(p.totalRuns), wicket: w, runs: p.totalRuns, legalBalls: p.legalBalls });
      prior = Math.max(prior, p.wickets);
    }
  });
  return { width, height, plot, yTicks: yTicks.map((value) => ({ value, y: y(value) })), xTicks: xOverTicks.map((over) => ({ over, x: x(over * 6) })), lines, wickets };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Overs as cricket writes them: completed overs, then the balls of the next ("12.3"). */
export function oversText(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}${legalBalls % 6 ? `.${legalBalls % 6}` : ""}`;
}

export type OverRow = Readonly<{ over: number; cells: readonly (Readonly<{ runs: number; wickets: number; total: number; totalWickets: number }> | null)[] }>;

/** The over-by-over table behind the Manhattan and the worm: each innings' runs and wickets in the over, and its total after it. */
export function overByOverRows(overs: readonly OverBar[], innings: readonly number[]): OverRow[] {
  const maxOver = Math.max(0, ...overs.filter((o) => innings.includes(o.inningsIndex)).map((o) => o.overNumber));
  const totals = innings.map(() => ({ runs: 0, wickets: 0 }));
  const byKey = new Map(overs.map((o) => [`${o.inningsIndex}:${o.overNumber}`, o]));
  const rows: OverRow[] = [];
  for (let over = 1; over <= maxOver; over += 1) {
    rows.push({
      over,
      cells: innings.map((inningsIndex, s) => {
        const o = byKey.get(`${inningsIndex}:${over}`);
        if (!o) return null;
        totals[s]!.runs += o.runs;
        totals[s]!.wickets += o.wickets;
        return { runs: o.runs, wickets: o.wickets, total: totals[s]!.runs, totalWickets: totals[s]!.wickets };
      }),
    });
  }
  return rows;
}

/**
 * Wagon wheel regions. The engine records a shot as one of eight sectors (0 to 7) relative to the batter. Its own
 * documented convention (docs/decisions/013, and the generator's line weighting) groups them off side 0 to 2, straight
 * 3 and 4, leg side 5 to 7, and the match commentary names them, for the same recorded sector, third man, point,
 * cover, mid-off, mid-on, midwicket, square leg and fine leg (`packages/projections/src/commentary.ts`). The chart uses
 * those names so it and the commentary call the same ball the same thing. They are a reading convention, not measured
 * positions: the engine's field template places its fielders on the sectors differently (see the CP08 record).
 */
export const SECTOR_REGIONS: readonly Readonly<{ name: string; side: "Off side" | "Straight" | "Leg side" }>[] = [
  { name: "Third man", side: "Off side" },
  { name: "Point", side: "Off side" },
  { name: "Cover", side: "Off side" },
  { name: "Mid-off", side: "Straight" },
  { name: "Mid-on", side: "Straight" },
  { name: "Midwicket", side: "Leg side" },
  { name: "Square leg", side: "Leg side" },
  { name: "Fine leg", side: "Leg side" },
];

/**
 * The drawing angle of a display sector, in degrees clockwise from straight down the pitch towards the bowler (top of
 * the chart). Display sector 0 is behind square on the right, 7 behind square on the left, so a right-hander's off
 * side (recorded 0 to 2, unreflected) is on the right, as seen from behind the batter, and a left-hander's, reflected
 * by `displaySector`, on the left.
 */
export function wheelAngle(displaySector: number): number {
  if (!Number.isInteger(displaySector) || displaySector < 0 || displaySector > 7) throw new Error("INVALID_SHOT_SECTOR");
  return (3.5 - displaySector) * 45;
}

/** An SVG path for a wedge of a display sector from radius r0 to r1 about (cx, cy), with a small gap either side. */
export function wedgePath(displaySector: number, cx: number, cy: number, r0: number, r1: number, gapDegrees = 1.5): string {
  const mid = wheelAngle(displaySector);
  const a0 = ((mid - 22.5 + gapDegrees) * Math.PI) / 180;
  const a1 = ((mid + 22.5 - gapDegrees) * Math.PI) / 180;
  const pt = (r: number, a: number) => `${round(cx + Math.sin(a) * r)},${round(cy - Math.cos(a) * r)}`;
  const outer = Math.max(r1, r0 + 0.5);
  return `M${pt(r0, a0)} L${pt(outer, a0)} A${round(outer)},${round(outer)} 0 0 1 ${pt(outer, a1)} L${pt(r0, a1)} A${round(r0)},${round(r0)} 0 0 0 ${pt(r0, a0)} Z`;
}

/** Where a display sector's label sits: just outside the rim, anchored away from the wheel. */
export function wheelLabelPosition(displaySector: number, cx: number, cy: number, radius: number): { x: number; y: number; anchor: "start" | "end" } {
  const a = (wheelAngle(displaySector) * Math.PI) / 180;
  const x = cx + Math.sin(a) * (radius + 8);
  const y = cy - Math.cos(a) * (radius + 8);
  return { x: round(x), y: round(y), anchor: Math.sin(a) >= 0 ? "start" : "end" };
}

export type BallGroup<T> = Readonly<{ over: number; balls: readonly T[] }>;

/**
 * CP08 (CD-018): the recent-balls strip in overs. A ball's label is "completed overs.ball" with "wd" or "nb" for an
 * extra ("4.3", "4.3wd"), so the over it belongs to is the number before the point plus one.
 */
export function groupBallsByOver<T extends { overBallLabel: string }>(balls: readonly T[]): BallGroup<T>[] {
  const groups: { over: number; balls: T[] }[] = [];
  for (const ball of balls) {
    const completed = Number.parseInt(ball.overBallLabel.split(".")[0] ?? "", 10);
    const over = Number.isFinite(completed) ? completed + 1 : NaN;
    const last = groups.at(-1);
    if (last && (last.over === over || (Number.isNaN(over) && Number.isNaN(last.over)))) last.balls.push(ball);
    else groups.push({ over, balls: [ball] });
  }
  return groups;
}
