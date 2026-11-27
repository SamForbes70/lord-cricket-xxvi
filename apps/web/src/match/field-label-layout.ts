/**
 * CP03: a readable field diagram. Given the markers the diagram draws (in its 200 by 200 viewBox units) and the size the
 * diagram is drawn at, this works out marker sizes and label sizes that are at least a minimum number of CSS pixels,
 * nudges markers that would overlap apart, and places each text label beside its marker where it overlaps nothing.
 *
 * Presentation only: the positions here are where things are drawn, never where a fielder "is". The field slots, their
 * legality and everything the match records come from the authoritative field presentation unchanged. Deterministic:
 * the same input always gives the same layout (no randomness, a fixed order of candidates and iterations).
 */

export type LayoutMarker = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Text drawn inside the marker (two characters at most fit). */
  readonly code: string;
  /** Optional name drawn beside the marker. */
  readonly label?: string;
  /** Larger marker for an occupied slot or a player; smaller for an open slot. */
  readonly weight: "player" | "open";
  /** Fixed markers (striker, keeper) are never moved; others may be nudged apart. */
  readonly fixed?: boolean;
};

export type PlacedMarker = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly codeSize: number;
  readonly label: PlacedLabel | null;
};

export type PlacedLabel = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  readonly size: number;
  /** Bounding box in viewBox units, for tests and hit checks. */
  readonly box: Box;
};

export type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

export type FieldLayout = {
  readonly markers: readonly PlacedMarker[];
  /** viewBox units per CSS pixel at the drawn size. */
  readonly unitsPerPx: number;
  readonly sideLabelSize: number;
};

const VIEW = 200;
/** Average advance of a bold sans-serif capital or lower-case letter, as a share of the font size (generous). */
const CHAR_WIDTH = 0.6;

export function minLabelPx(): number {
  return 12;
}

function overlaps(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function circleBox(x: number, y: number, r: number): Box {
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

/**
 * @param markers what the diagram draws
 * @param drawnWidthPx the diagram's rendered width in CSS pixels (the viewBox is square)
 * @param minPx smallest text size in CSS pixels (labels and marker codes)
 */
export function layoutField(markers: readonly LayoutMarker[], drawnWidthPx: number, minPx = minLabelPx()): FieldLayout {
  const unitsPerPx = VIEW / Math.max(120, drawnWidthPx);
  const codeSize = Math.max(3.1, minPx * unitsPerPx);
  const labelSize = Math.max(3.3, minPx * unitsPerPx);
  // A player marker holds a two-letter code at codeSize; an open slot is a small ring.
  const playerR = Math.max(5.1, codeSize * 0.95);
  const openR = Math.max(2.6, playerR * 0.55);

  // 1. Nudge overlapping markers apart (a few relaxation passes, fixed order).
  const pos = markers.map((m) => ({ ...m, r: m.weight === "player" ? playerR : openR, px: m.x, py: m.y }));
  const gap = 0.8;
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let a = 0; a < pos.length; a += 1) {
      for (let b = a + 1; b < pos.length; b += 1) {
        const A = pos[a]!;
        const B = pos[b]!;
        if (A.fixed && B.fixed) continue;
        let dx = B.px - A.px;
        let dy = B.py - A.py;
        let d = Math.hypot(dx, dy);
        const need = A.r + B.r + gap;
        if (d >= need) continue;
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        const push = need - d;
        const ux = dx / d;
        const uy = dy / d;
        const shareA = A.fixed ? 0 : B.fixed ? 1 : 0.5;
        const shareB = 1 - shareA;
        A.px -= ux * push * shareA;
        A.py -= uy * push * shareA;
        B.px += ux * push * shareB;
        B.py += uy * push * shareB;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const p of pos) {
    p.px = Math.min(VIEW - p.r - 1, Math.max(p.r + 1, p.px));
    p.py = Math.min(VIEW - p.r - 1, Math.max(p.r + 1, p.py));
  }

  // 2. Place labels: try below, above, right, left and the diagonals; take the first that overlaps nothing, otherwise
  // the one that overlaps least. Players are labelled before open slots so their names get the best places.
  const taken: Box[] = pos.map((p) => circleBox(p.px, p.py, p.r + 0.4));
  // Keep the side labels' corners clear.
  const sideLabelSize = Math.max(4, minPx * unitsPerPx);
  taken.push({ x0: 0, y0: 0, x1: 60, y1: sideLabelSize * 1.6 + 6 }, { x0: 140, y0: 0, x1: 200, y1: sideLabelSize * 1.6 + 6 });
  const order = pos.map((_, n) => n).sort((a, b) => (pos[a]!.weight === pos[b]!.weight ? a - b : pos[a]!.weight === "player" ? -1 : 1));
  const labels = new Map<number, PlacedLabel>();
  for (const n of order) {
    const p = pos[n]!;
    if (!p.label) continue;
    const w = p.label.length * labelSize * CHAR_WIDTH;
    const h = labelSize * 1.15;
    const g = 1;
    const candidates: { x: number; y: number; anchor: PlacedLabel["anchor"]; box: Box }[] = [];
    const add = (cx: number, top: number, anchor: PlacedLabel["anchor"]) => {
      const x0 = anchor === "middle" ? cx - w / 2 : anchor === "start" ? cx : cx - w;
      candidates.push({ x: cx, y: top + labelSize * 0.86, anchor, box: { x0, y0: top, x1: x0 + w, y1: top + h } });
    };
    add(p.px, p.py + p.r + g, "middle");
    add(p.px, p.py - p.r - g - h, "middle");
    add(p.px + p.r + g, p.py - h / 2, "start");
    add(p.px - p.r - g, p.py - h / 2, "end");
    const d = (p.r + g) * 0.75;
    add(p.px + d, p.py + d, "start");
    add(p.px - d, p.py + d, "end");
    add(p.px + d, p.py - d - h, "start");
    add(p.px - d, p.py - d - h, "end");
    let best = candidates[0]!;
    let bestCost = Infinity;
    for (const c of candidates) {
      const out = Math.max(0, -c.box.x0) + Math.max(0, c.box.x1 - VIEW) + Math.max(0, -c.box.y0) + Math.max(0, c.box.y1 - VIEW);
      let cost = out * 50;
      for (const t of taken) cost += overlaps(c.box, t);
      if (cost < bestCost) { best = c; bestCost = cost; }
      if (cost === 0) break;
    }
    taken.push(best.box);
    labels.set(n, { text: p.label, x: best.x, y: best.y, anchor: best.anchor, size: labelSize, box: best.box });
  }

  return {
    unitsPerPx,
    sideLabelSize,
    markers: pos.map((p, n) => ({ id: p.id, x: round(p.px), y: round(p.py), r: round(p.r), codeSize: round(codeSize), label: labels.get(n) ?? null })),
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

type Shape = { readonly c: { x: number; y: number; r: number } } | { readonly b: Box };

function shapeOverlap(a: Shape, b: Shape): number {
  if ("c" in a && "c" in b) return Math.max(0, a.c.r + b.c.r - Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y));
  if ("b" in a && "b" in b) return overlaps(a.b, b.b);
  const c = "c" in a ? a.c : (b as { c: { x: number; y: number; r: number } }).c;
  const box = "b" in a ? a.b : (b as { b: Box }).b;
  const nx = Math.min(box.x1, Math.max(box.x0, c.x));
  const ny = Math.min(box.y1, Math.max(box.y0, c.y));
  return Math.max(0, c.r - Math.hypot(c.x - nx, c.y - ny));
}

/** Overlap between any two drawn things (marker circles and label boxes): zero means a clean layout. */
export function layoutOverlap(layout: FieldLayout): number {
  const shapes: Shape[] = [];
  for (const m of layout.markers) {
    shapes.push({ c: { x: m.x, y: m.y, r: m.r } });
    if (m.label) shapes.push({ b: m.label.box });
  }
  let total = 0;
  for (let a = 0; a < shapes.length; a += 1) for (let b = a + 1; b < shapes.length; b += 1) total += shapeOverlap(shapes[a]!, shapes[b]!);
  return total;
}
