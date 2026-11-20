import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { ART_WASH, groundArtBackground, groundArtUrl, groundSlug, hasPainting, stadiumSvg } from "../../apps/web/src/world/ground-art.js";

describe("ground art", () => {
  it("gives every approved ground a backdrop, painted or procedural, and the same one every time", () => {
    const urls = world.grounds.map((ground) => groundArtUrl(ground.name));
    expect(urls.every((url) => url.length > 0)).toBe(true);
    expect(world.grounds.map((ground) => groundArtUrl(ground.name))).toEqual(urls);
    expect(hasPainting("Aster Quay")).toBe(true);
    for (const ground of world.grounds.filter((g) => !hasPainting(g.name))) {
      expect(groundArtUrl(ground.name).startsWith("data:image/svg+xml")).toBe(true);
    }
    // Procedural grounds differ from each other.
    const svgs = new Set(world.grounds.map((ground) => stadiumSvg(ground.name)));
    expect(svgs.size).toBe(world.grounds.length);
  });

  it("draws well-formed SVG with no external references, so it works offline under the page's CSP", () => {
    for (const ground of world.grounds) {
      const svg = stadiumSvg(ground.name);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trim().endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/href=|https?:\/\/(?!www\.w3\.org)/);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    expect(groundSlug("  Larchwood Ground ")).toBe("larchwood-ground");
  });

  it("sets the art as a plain inline background-image with its wash, never through a CSS variable", () => {
    const style = groundArtBackground("Copperfield", ART_WASH.scoreboard)!;
    expect(Object.keys(style)).toEqual(["backgroundImage"]);
    expect(style.backgroundImage.startsWith(`${ART_WASH.scoreboard}, url("`)).toBe(true);
    expect(style.backgroundImage).not.toContain("var(");
    // Stable between renders, so React never rewrites the declaration.
    expect(groundArtBackground("Copperfield", ART_WASH.scoreboard)).toEqual(style);
    expect(groundArtBackground(undefined, ART_WASH.card)).toBeUndefined();
  });
});
