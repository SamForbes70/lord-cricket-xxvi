import type { WorldPack } from "@lcxxvi/contracts";
import { isBowlingCapable } from "@lcxxvi/data";

/**
 * Visual overhaul phase 2 (docs/design/VISUAL_OVERHAUL_PLAN.md): how a fictional player is drawn and rated on screen.
 * Pure and deterministic: the same player always gets the same face, so a portrait is an identity, not decoration.
 * Nothing here changes a rule, a rating used by the engines, or a save.
 */

type Player = WorldPack["players"][number];
export type Format = "T20" | "ODI" | "RED_BALL";

const SKIN = ["#f1c9a5", "#e0ac83", "#c68b5f", "#a86e45", "#7d4f30", "#5a3824"] as const;
const HAIR = ["#1d1611", "#3b2a1c", "#6b4a2b", "#a7783f", "#c9a26b", "#2b2b2b", "#8a8a86"] as const;
export type Headgear = "HELMET" | "CAP" | "NONE";
export type PortraitSpec = {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3;
  beard: boolean;
  headgear: Headgear;
  shirt: string;
  trim: string;
  /** Small, stable variation so faces in a squad are not identical. */
  faceWidth: number;
  browTilt: number;
};

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const HEX = /^#[0-9a-f]{6}$/i;
function colour(value: string | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

/** A player's portrait, drawn in their club's kit colours. Keepers wear a helmet; bowlers a cap; others vary. */
export function portraitSpec(playerId: string, role: string, kit: readonly string[]): PortraitSpec {
  const h = fnv(playerId);
  const pick = <T,>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length]!;
  const headgear: Headgear = role === "KEEPER" ? "HELMET" : role === "BOWLER" ? "CAP" : (["HELMET", "CAP", "NONE"] as const)[(h >>> 20) % 3]!;
  return {
    skin: pick(SKIN, 0),
    hair: pick(HAIR, 5),
    hairStyle: ((h >>> 9) % 4) as 0 | 1 | 2 | 3,
    beard: (h >>> 12) % 5 === 0,
    headgear,
    shirt: colour(kit[0], "#2f4f4f"),
    trim: colour(kit[1], "#f0f0f0"),
    faceWidth: 15 + ((h >>> 14) % 4),
    browTilt: ((h >>> 17) % 3) - 1,
  };
}

/** Batting, bowling and keeping out of 100 for a format, from the public skills (as on the player page). */
export function playerStrengths(p: Player, format: Format): { batting: number; bowling: number; keeping: number; fielding: number } {
  const s = p.skills[format];
  return {
    batting: Math.round((s.timing + s.power + s.defence + s.rotation) / 4),
    bowling: isBowlingCapable(p) ? Math.round((s.control + s.movement + s.variation) / 3) : 0,
    keeping: p.role === "KEEPER" ? Math.round(s.keeping) : 0,
    fielding: Math.round((s.catching + s.groundFielding + s.throwing) / 3),
  };
}

/** The overall rating shown on cards: the better of batting, bowling and keeping-with-batting, as in the auction. */
export function overallRating(p: Player, format: Format): number {
  const s = p.skills[format];
  const bat = (s.timing + s.power + s.defence + s.rotation) / 4;
  const bowl = isBowlingCapable(p) ? (s.control + s.movement) / 2 : 0;
  const keep = p.role === "KEEPER" ? (s.keeping + bat) / 2 : 0;
  return Math.round(Math.max(bat, bowl, keep));
}

/** A rating's band, for its badge colour. */
export function ratingTier(rating: number): "ELITE" | "STRONG" | "SOLID" | "DEVELOPING" {
  return rating >= 80 ? "ELITE" : rating >= 70 ? "STRONG" : rating >= 60 ? "SOLID" : "DEVELOPING";
}

export const ROLE_LABEL: Record<string, string> = { BATTER: "Batter", BOWLER: "Bowler", ALLROUNDER: "All-rounder", KEEPER: "Keeper" };
