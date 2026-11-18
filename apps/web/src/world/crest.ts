/**
 * Stage 15 built-in crests (owner decisions C1a and C3a, 18 November 2026). Every fictional team gets a crest drawn from
 * its id, name and two kit colours: no image files, no imports, nothing a player can upload. The same team always gets
 * the same crest, and an edited team colour changes the crest's colours only.
 */

export type CrestShape = "SHIELD" | "ROUNDEL" | "PENNANT" | "DIAMOND";
export type CrestPattern = "PLAIN" | "BAND" | "CHEVRON" | "HALVES";
export type CrestSpec = {
  shape: CrestShape;
  pattern: CrestPattern;
  initials: string;
  primary: string;
  secondary: string;
  /** Initials colour, picked for contrast against the primary colour. */
  ink: string;
};

const SHAPES: CrestShape[] = ["SHIELD", "ROUNDEL", "PENNANT", "DIAMOND"];
const PATTERNS: CrestPattern[] = ["PLAIN", "BAND", "CHEVRON", "HALVES"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A small stable string hash (FNV-1a), so a crest never depends on the order teams are listed in. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(colour: string): number {
  const channel = (i: number) => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Up to two initials from the team's name: the first letters of its first two words, or its first two letters. */
export function crestInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return "?";
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : words[0]!.replace(/[^A-Za-z]/g, "").slice(0, 2);
  return letters.toUpperCase();
}

export function crestSpec(teamId: string, name: string, colours: readonly string[]): CrestSpec {
  const h = hash(teamId);
  const primary = HEX.test(colours[0] ?? "") ? colours[0]! : "#2f4f4f";
  const secondary = HEX.test(colours[1] ?? "") ? colours[1]! : "#f0f0f0";
  // White or near-black initials, whichever contrasts more with the primary colour.
  const ink = luminance(primary) > 0.179 ? "#111111" : "#ffffff";
  return { shape: SHAPES[h % SHAPES.length]!, pattern: PATTERNS[(h >>> 8) % PATTERNS.length]!, initials: crestInitials(name), primary, secondary, ink };
}

/** The outline of each shape in a 0..40 by 0..48 box. */
export const CREST_OUTLINES: Record<CrestShape, string> = {
  SHIELD: "M4 4 H36 V24 C36 36 28 42 20 46 C12 42 4 36 4 24 Z",
  ROUNDEL: "M20 4 A20 20 0 1 1 19.99 4 Z M20 4",
  PENNANT: "M4 4 H36 V30 L20 46 L4 30 Z",
  DIAMOND: "M20 2 L38 24 L20 46 L2 24 Z",
};
