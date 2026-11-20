/**
 * Ground art (visual overhaul phase 5, docs/design/VISUAL_OVERHAUL_PLAN.md).
 *
 * Every ground gets a night-match backdrop. A ground with a painting uses it; every other ground gets a procedural
 * stadium drawn as SVG from its name, so the same ground always looks the same and an edited world's renamed
 * grounds still get a picture. Pure presentation: nothing here touches a rule, an engine or a save.
 *
 * To add a painting, put the file in `src/art/grounds/` and add a line to PAINTINGS below (key: the ground's slug).
 */

const PAINTINGS: Record<string, string> = {
  "aster-quay": new URL("../art/aster-quay.webp", import.meta.url).href,
};

export function groundSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small deterministic generator, seeded from the ground's name, used only for the drawing. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const ROOFS = ["#7a4a2a", "#3d5a6b", "#6b2f2f", "#4b5b3a", "#5a4a6b", "#8a6a2a"] as const;
const SKIES = [["#04101a", "#0c2b33"], ["#060f14", "#13302c"], ["#07121f", "#1a2c3d"], ["#050d10", "#162b25"]] as const;

/** The procedural stadium for a ground, as an SVG document (1600 by 900). Exported for tests. */
export function stadiumSvg(name: string): string {
  const h = fnv(groundSlug(name) || "ground");
  const r = rng(h);
  const [skyTop, skyLow] = SKIES[h % SKIES.length]!;
  const roof = ROOFS[(h >>> 4) % ROOFS.length]!;
  const horizon = 430 + Math.round(r() * 40);

  // Stands: a ring of blocks along the horizon, varied in height, with lit window rows.
  let stands = "";
  let windows = "";
  for (let x = -20; x < 1620; ) {
    const w = 90 + Math.round(r() * 170);
    const tall = 40 + Math.round(r() * 90);
    const top = horizon - tall;
    stands += `<path d="M${x} ${horizon + 6} L${x} ${top + 14} L${x + 14} ${top} L${x + w - 10} ${top} L${x + w} ${top + 12} L${x + w} ${horizon + 6} Z" fill="#0a1a1f"/>`;
    for (let row = top + 18; row < horizon - 6; row += 14) {
      if (r() < 0.55) windows += `<rect x="${x + 10}" y="${row}" width="${w - 20}" height="3" fill="#f4d58d" opacity="${(0.12 + r() * 0.22).toFixed(2)}"/>`;
    }
    x += w + 4;
  }

  // Pavilion: the centrepiece across the ground, with one of three roof shapes.
  const px = 600 + Math.round(r() * 400);
  const pw = 220 + Math.round(r() * 80);
  const ph = 70 + Math.round(r() * 30);
  const pTop = horizon - ph;
  const shape = (h >>> 8) % 3;
  const roofPath =
    shape === 0 ? `M${px - 12} ${pTop} L${px + pw / 2} ${pTop - 60} L${px + pw + 12} ${pTop} Z`
    : shape === 1 ? `M${px - 10} ${pTop} Q${px + pw / 2} ${pTop - 80} ${px + pw + 10} ${pTop} Z`
    : `M${px - 14} ${pTop} L${px + 20} ${pTop - 34} L${px + pw - 20} ${pTop - 34} L${px + pw + 14} ${pTop} Z`;
  let arches = "";
  for (let i = 0; i < 6; i += 1) {
    const ax = px + 16 + i * ((pw - 32) / 6);
    arches += `<rect x="${ax.toFixed(1)}" y="${pTop + 20}" width="${((pw - 32) / 6 - 8).toFixed(1)}" height="${ph - 28}" rx="10" fill="#f6c977" opacity="0.55"/>`;
  }
  const pavilion = `<path d="${roofPath}" fill="${roof}"/><rect x="${px}" y="${pTop}" width="${pw}" height="${ph + 6}" fill="#1d2a2a"/>${arches}<rect x="${px + pw / 2 - 2}" y="${pTop - (shape === 0 ? 92 : shape === 1 ? 104 : 62)}" width="4" height="34" fill="#c9cfd2"/>`;

  // Floodlights: four towers with lamp heads and glows.
  let lights = "";
  let glows = "";
  const towers = [80 + r() * 120, 420 + r() * 120, 1060 + r() * 120, 1360 + r() * 140];
  towers.forEach((tx, i) => {
    const top = 70 + Math.round(r() * 70);
    const lean = i < 2 ? 18 : -18;
    lights += `<path d="M${tx.toFixed(0)} ${horizon} L${(tx + 6).toFixed(0)} ${top + 30} L${(tx + 12).toFixed(0)} ${horizon} Z" fill="#0b161a"/>`;
    lights += `<g transform="rotate(${lean} ${(tx + 6).toFixed(0)} ${top + 18})"><rect x="${(tx - 34).toFixed(0)}" y="${top}" width="80" height="34" rx="3" fill="#1a2629"/>`;
    for (let k = 0; k < 4; k += 1) lights += `<rect x="${(tx - 30 + k * 19).toFixed(0)}" y="${top + 4}" width="15" height="11" fill="#fffbe8"/><rect x="${(tx - 30 + k * 19).toFixed(0)}" y="${top + 19}" width="15" height="11" fill="#fffbe8"/>`;
    lights += `</g>`;
    glows += `<circle cx="${(tx + 6).toFixed(0)}" cy="${top + 17}" r="260" fill="url(#glow)"/>`;
  });

  // The playing area: an oval outfield with mowing stripes, the boundary rope and the square.
  const cx = 800;
  const fieldTop = horizon - 6;
  let stripes = "";
  for (let i = 0; i < 14; i += 1) {
    const x = i * 120 - 40;
    if (i % 2 === 0) stripes += `<path d="M${x} ${fieldTop} L${x + 120} ${fieldTop} L${(x + 120 - cx) * 1.9 + cx} 900 L${(x - cx) * 1.9 + cx} 900 Z" fill="#ffffff" opacity="0.045"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyLow}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.42"/><stop offset="0.35" stop-color="#d9e8e0" stop-opacity="0.10"/><stop offset="1" stop-color="#d9e8e0" stop-opacity="0"/></radialGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5a3a"/><stop offset="0.45" stop-color="#2c7a48"/><stop offset="1" stop-color="#1a4a30"/></linearGradient>
<radialGradient id="pool" cx="0.5" cy="0.25" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<clipPath id="oval"><ellipse cx="${cx}" cy="${fieldTop + 480}" rx="1150" ry="500"/></clipPath>
</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
${glows}
${lights}
${stands}${windows}
${pavilion}
<g clip-path="url(#oval)"><rect y="${fieldTop}" width="1600" height="${900 - fieldTop}" fill="url(#grass)"/>${stripes}<rect y="${fieldTop}" width="1600" height="${900 - fieldTop}" fill="url(#pool)"/></g>
<ellipse cx="${cx}" cy="${fieldTop + 480}" rx="1100" ry="468" fill="none" stroke="#f3f0e2" stroke-opacity="0.55" stroke-width="3"/>
<path d="M${cx - 22} ${fieldTop + 150} L${cx + 22} ${fieldTop + 150} L${cx + 60} 900 L${cx - 60} 900 Z" fill="#cdbb8a" opacity="0.85"/>
<path d="M${cx - 28} ${fieldTop + 175} L${cx + 28} ${fieldTop + 175}" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
</svg>`;
}

const cache = new Map<string, string>();
const rasters = new Map<string, string>();
const rastering = new Set<string>();

/**
 * Turns a procedural stadium into a small WebP once, in the browser, so screens that re-render every ball paint a
 * bitmap rather than re-rasterising a vector image with gradients. Falls back silently (the SVG keeps working) where
 * there is no canvas, as in unit tests, or if the browser refuses to export the canvas.
 */
function rasterise(slug: string, svgUrl: string): void {
  if (rastering.has(slug) || typeof document === "undefined" || typeof Image === "undefined") return;
  rastering.add(slug);
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/webp", 0.82);
      if (url.startsWith("data:image/")) rasters.set(slug, url);
    } catch {
      /* Keep the SVG. */
    }
  };
  img.src = svgUrl;
}

/** The backdrop image URL for a ground: its painting if it has one, else its procedural stadium (as a bitmap once ready). */
export function groundArtUrl(name: string): string {
  const slug = groundSlug(name);
  const painted = PAINTINGS[slug];
  if (painted) return painted;
  const raster = rasters.get(slug);
  if (raster) return raster;
  let svg = cache.get(slug);
  if (!svg) {
    svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stadiumSvg(name))}`;
    cache.set(slug, svg);
  }
  rasterise(slug, svg);
  return svg;
}

export function hasPainting(name: string): boolean {
  return groundSlug(name) in PAINTINGS;
}

/** A style object that exposes the art to CSS as `--ground-art` (React sets it through the CSSOM, which the CSP allows). */
export function groundArtStyle(name: string | undefined): Record<string, string> | undefined {
  return name ? { "--ground-art": `url("${groundArtUrl(name)}")` } : undefined;
}
