/** Colours for a cricketer figure: the club's kit with safe fallbacks, a skin tone from the seed, and darker shades
 * for the far side. Pure, so it is unit tested without rendering. */
const SKINS = ["#f1c9a5", "#e0ac83", "#c68b5f", "#a86e45", "#7d4f30", "#5a3824"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function seeded(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}


export type FigurePaint = { shirt: string; trim: string; skin: string; far: string; trousers: string; trousersFar: string };

export function figurePaint(kit: readonly string[], seed: string): FigurePaint {
  const shirt = kit[0] && HEX.test(kit[0]) ? kit[0] : "#1f5a4a";
  const trim = kit[1] && HEX.test(kit[1]) ? kit[1] : "#e7bb5f";
  const skin = SKINS[seeded(seed) % SKINS.length]!;
  return { shirt, trim, skin, far: shade(shirt, -0.32), trousers: shade(shirt, -0.18), trousersFar: shade(shirt, -0.42) };
}
