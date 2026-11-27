import { describe, expect, it } from "vitest";
import { advanceEffectText, bowlerCardLabel, stageOverText } from "../../apps/web/src/match/broadcast-labels.js";
import { layoutField, layoutOverlap, type LayoutMarker } from "../../apps/web/src/match/field-label-layout.js";

/** The canonical right-hander slots (packages/projections/src/field-presentation.ts), in viewBox units. */
const SLOTS: [string, string, number, number][] = [
  ["slip-1", "First slip", 113.5, 131.5],
  ["slip-2", "Second slip", 122.5, 127.5],
  ["point", "Point", 138, 108],
  ["cover", "Cover", 132, 82],
  ["mid-off", "Mid-off", 114.5, 65],
  ["mid-on", "Mid-on", 85.5, 65],
  ["midwicket", "Midwicket", 68, 82],
  ["deep-square-leg", "Deep square leg", 24.5, 105],
  ["fine-leg", "Fine leg", 46, 153],
  ["deep-cover", "Deep cover", 156, 48],
  ["long-on", "Long-on", 79, 24],
  ["long-off", "Long-off", 121, 24],
];

function markers(hand: "R" | "L", occupied: ReadonlySet<string>): LayoutMarker[] {
  const fx = (x: number) => (hand === "L" ? 200 - x : x);
  return [
    { id: "striker", x: 100, y: 118, code: hand, weight: "player", fixed: true },
    { id: "keeper", x: 100, y: 134, code: "WK", weight: "player", fixed: true },
    { id: "bowler", x: 100, y: 69, code: "B", weight: "player" },
    { id: "non-striker", x: fx(93.5), y: 75.5, code: "NS", weight: "player" },
    ...SLOTS.map(([id, label, x, y]): LayoutMarker => ({ id, label, x: fx(x), y, code: occupied.has(id) ? "AB" : "", weight: occupied.has(id) ? "player" : "open" })),
  ];
}

describe("CP03 field diagram layout", () => {
  const nine = new Set(SLOTS.slice(0, 9).map(([id]) => id));
  for (const width of [320, 360, 432, 520]) {
    for (const hand of ["R", "L"] as const) {
      it(`draws every label at 12 px or more with no overlap at ${width} px (${hand}HB)`, () => {
        const layout = layoutField(markers(hand, nine), width);
        const pxPerUnit = width / 200;
        for (const m of layout.markers) {
          expect(m.codeSize * pxPerUnit).toBeGreaterThanOrEqual(11.99);
          if (m.label) expect(m.label.size * pxPerUnit).toBeGreaterThanOrEqual(11.99);
        }
        expect(layoutOverlap(layout)).toBe(0);
      });
    }
  }
  it("is deterministic and leaves isolated markers where the presentation put them", () => {
    const a = layoutField(markers("R", nine), 432);
    const b = layoutField(markers("R", nine), 432);
    expect(a).toEqual(b);
    const deepCover = a.markers.find((m) => m.id === "deep-cover")!;
    expect(deepCover.x).toBe(156);
    expect(deepCover.y).toBe(48);
    // The striker and keeper are fixed: the delivery line still starts at the crease.
    expect(a.markers.find((m) => m.id === "striker")).toMatchObject({ x: 100, y: 118 });
  });
});

describe("CP03 live match labels", () => {
  const cue = (bowlerId: string, inningsIndex = 0) => ({ fieldPresentation: { latestHighlight: { bowlerId, inningsIndex } }, activeIndex: 0, resultText: null }) as never;
  it("names the bowler card 'Bowling next' only when it shows a different bowler from the last ball", () => {
    expect(bowlerCardLabel(cue("p1"), "p1")).toBe("Bowler");
    expect(bowlerCardLabel(cue("p1"), "p2")).toBe("Bowling next");
    expect(bowlerCardLabel(cue("p1", 1), "p2")).toBe("Bowler");
    expect(bowlerCardLabel(cue("p1"), null)).toBe("Bowler");
    expect(bowlerCardLabel({ fieldPresentation: null, activeIndex: 0, resultText: null } as never, "p2")).toBe("Bowler");
  });
  it("states how far each primary advance goes", () => {
    expect(advanceEffectText(0)).toBe("Over 1: 6 legal balls to go");
    expect(advanceEffectText(23)).toBe("Over 4: 1 legal ball to go");
    expect(advanceEffectText(24)).toBe("Over 5: 6 legal balls to go");
  });
  it("marks the ball that completed an over", () => {
    expect(stageOverText("3.6", 24, true)).toBe("Over 3.6 · end of over");
    expect(stageOverText("3.5", 23, true)).toBe("Over 3.5");
    expect(stageOverText("0.1wd", 0, true)).toBe("Over 0.1wd");
  });
});
