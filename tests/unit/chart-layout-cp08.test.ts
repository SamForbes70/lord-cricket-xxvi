import { describe, expect, test } from "vitest";
import {
  SECTOR_REGIONS, groupBallsByOver, manhattanLayout, niceStep, niceTicks, overByOverRows, overLabelStep, oversText,
  wedgePath, wheelAngle, wheelLabelPosition, wormLayout,
} from "../../apps/web/src/match/chart-layout.js";
import { displaySector } from "../../apps/web/src/match/analytics-geometry.js";

describe("CP08 chart scales", () => {
  test("nice steps are 1, 2 or 5 times a power of ten and ticks cover the maximum", () => {
    expect(niceStep(20, 4)).toBe(5);
    expect(niceStep(154, 4)).toBe(50);
    expect(niceStep(0)).toBe(1);
    expect(niceTicks(23, 4)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(0, 4)).toEqual([0, 1]);
    for (const max of [1, 7, 19, 154, 333, 999]) {
      const ticks = niceTicks(max, 4);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
    }
  });
  test("over labels thin out when the slots are narrow", () => {
    expect(overLabelStep(20, 30)).toBe(1);
    expect(overLabelStep(20, 14)).toBe(2);
    expect(overLabelStep(50, 6)).toBe(5);
    expect(overLabelStep(3, 2)).toBe(5);
  });
  test("overs are written as completed overs and balls", () => {
    expect(oversText(120)).toBe("20");
    expect(oversText(117)).toBe("19.3");
    expect(oversText(0)).toBe("0");
  });
});

const overs = [
  { inningsIndex: 0, overNumber: 1, runs: 4, wickets: 1 },
  { inningsIndex: 0, overNumber: 2, runs: 12, wickets: 0 },
  { inningsIndex: 1, overNumber: 1, runs: 7, wickets: 0 },
  { inningsIndex: 1, overNumber: 2, runs: 0, wickets: 2 },
];

describe("CP08 Manhattan", () => {
  test("places one bar per innings per over side by side, scaled to the round axis", () => {
    const layout = manhattanLayout(overs, [0, 1], 400);
    expect(layout.bars).toHaveLength(4);
    const top = layout.yTicks.at(-1)!;
    expect(top.value).toBeGreaterThanOrEqual(12);
    const [a, b] = [layout.bars.find(x => x.inningsIndex === 0 && x.overNumber === 1)!, layout.bars.find(x => x.inningsIndex === 1 && x.overNumber === 1)!];
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x - a.x).toBeLessThan((layout.plot.right - layout.plot.left) / 2);
    // Bar height is proportional to runs.
    const twelve = layout.bars.find(x => x.runs === 12)!, four = layout.bars.find(x => x.runs === 4)!;
    expect(twelve.height / four.height).toBeCloseTo(3, 5);
    for (const bar of layout.bars) expect(bar.y + bar.height).toBeCloseTo(layout.plot.bottom, 5);
  });
  test("draws one wicket marker per wicket, stacked above its bar and inside the plot", () => {
    const layout = manhattanLayout(overs, [0, 1], 400);
    expect(layout.wickets).toHaveLength(3);
    const two = layout.wickets.filter(w => w.inningsIndex === 1 && w.overNumber === 2);
    expect(two).toHaveLength(2);
    expect(two[1]!.cy).toBeLessThan(two[0]!.cy);
    for (const w of layout.wickets) expect(w.cy - w.r).toBeGreaterThanOrEqual(layout.plot.top - 0.001);
  });
  test("small multiples can share one runs axis", () => {
    const own = manhattanLayout(overs, [1], 400);
    const shared = manhattanLayout(overs, [1], 400, 240, 1, 12);
    expect(shared.yTicks.at(-1)!.value).toBeGreaterThan(own.yTicks.at(-1)!.value);
    expect(shared.yTicks).toEqual(manhattanLayout(overs, [0], 400, 240, 1, 12).yTicks);
  });
  test("ignores innings it was not asked to draw", () => {
    const layout = manhattanLayout(overs, [1], 400);
    expect(layout.bars.every(b => b.inningsIndex === 1)).toBe(true);
    expect(layout.xLabels.map(l => l.over)).toEqual([1, 2]);
  });
});

describe("CP08 worm and table", () => {
  const worm = [
    { inningsIndex: 0, legalBalls: 1, totalRuns: 4, wickets: 0 },
    { inningsIndex: 0, legalBalls: 2, totalRuns: 4, wickets: 1 },
    { inningsIndex: 0, legalBalls: 12, totalRuns: 30, wickets: 3 },
    { inningsIndex: 1, legalBalls: 6, totalRuns: 10, wickets: 0 },
  ];
  test("one line per innings from the origin, a marker for every wicket including two on one ball", () => {
    const layout = wormLayout(worm, [0, 1], 500);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[0]!.points.split(" ")[0]).toBe(`${layout.plot.left},${layout.plot.bottom}`);
    expect(layout.wickets.map(w => w.wicket)).toEqual([1, 2, 3]);
    expect(layout.wickets[1]!.x).toBe(layout.wickets[2]!.x);
    expect(layout.yTicks.at(-1)!.value).toBeGreaterThanOrEqual(30);
    expect(layout.xTicks.at(-1)!.over).toBeGreaterThanOrEqual(2);
  });
  test("the over-by-over rows add each innings' overs into a running score", () => {
    const rows = overByOverRows(overs, [0, 1]);
    expect(rows).toEqual([
      { over: 1, cells: [{ runs: 4, wickets: 1, total: 4, totalWickets: 1 }, { runs: 7, wickets: 0, total: 7, totalWickets: 0 }] },
      { over: 2, cells: [{ runs: 12, wickets: 0, total: 16, totalWickets: 1 }, { runs: 0, wickets: 2, total: 7, totalWickets: 2 }] },
    ]);
    expect(overByOverRows([{ inningsIndex: 0, overNumber: 2, runs: 3, wickets: 0 }], [0, 1])[0]!.cells).toEqual([null, null]);
  });
});

describe("CP08 wagon wheel", () => {
  test("names follow the recorded sector convention: off side 0 to 2, straight 3 and 4, leg side 5 to 7", () => {
    expect(SECTOR_REGIONS.map(r => r.name)).toEqual(["Third man", "Point", "Cover", "Mid-off", "Mid-on", "Midwicket", "Square leg", "Fine leg"]);
    expect(SECTOR_REGIONS.map(r => r.side)).toEqual(["Off side", "Off side", "Off side", "Straight", "Straight", "Leg side", "Leg side", "Leg side"]);
  });
  test("a right-hander's off side is drawn on the right and a reflected left-hander's on the left", () => {
    for (let recorded = 0; recorded < 8; recorded += 1) {
      const right = Math.sin((wheelAngle(recorded) * Math.PI) / 180);
      const left = Math.sin((wheelAngle(displaySector(recorded, "L")) * Math.PI) / 180);
      if (SECTOR_REGIONS[recorded]!.side === "Off side") { expect(right).toBeGreaterThan(0); expect(left).toBeLessThan(0); }
      if (SECTOR_REGIONS[recorded]!.side === "Leg side") { expect(right).toBeLessThan(0); expect(left).toBeGreaterThan(0); }
      expect(left).toBeCloseTo(-right, 10);
    }
    // Third man is fine (behind square), mid-off and mid-on straight.
    expect(Math.abs(wheelAngle(0))).toBeGreaterThan(135);
    expect(Math.abs(wheelAngle(3))).toBeLessThan(45);
    expect(() => wheelAngle(8)).toThrow("INVALID_SHOT_SECTOR");
  });
  test("wedges are closed paths and labels anchor away from the wheel", () => {
    expect(wedgePath(2, 100, 100, 10, 80)).toMatch(/^M[\d.,]+ L[\d.,]+ A80,80 0 0 1 [\d.,]+ L[\d.,]+ A10,10 0 0 0 [\d.,]+ Z$/);
    expect(wheelLabelPosition(1, 100, 100, 60).anchor).toBe("start");
    expect(wheelLabelPosition(6, 100, 100, 60).anchor).toBe("end");
    expect(wheelLabelPosition(1, 100, 100, 60).x).toBeGreaterThan(160);
  });
});

describe("CP08 recent balls by over (CD-018)", () => {
  test("groups consecutive balls by the over their label belongs to, extras included", () => {
    const balls = ["3.5", "3.6", "4.1", "4.1wd", "4.2"].map((overBallLabel, sequence) => ({ overBallLabel, sequence }));
    const groups = groupBallsByOver(balls);
    expect(groups.map(g => g.over)).toEqual([4, 5]);
    expect(groups.map(g => g.balls.map(b => b.overBallLabel))).toEqual([["3.5", "3.6"], ["4.1", "4.1wd", "4.2"]]);
    expect(groupBallsByOver([])).toEqual([]);
    expect(groupBallsByOver([{ overBallLabel: "0.1" }])[0]!.over).toBe(1);
  });
});
