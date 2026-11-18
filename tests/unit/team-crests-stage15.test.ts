import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { crestInitials, crestSpec, luminance } from "../../apps/web/src/world/crest.js";

// Stage 15 built-in crests (owner decisions C1a and C3a, 18 November 2026): generated from each fictional team's id,
// name and kit colours; no images and no imports.
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as {
  teams: { teamId: string; name: string; colours: string[] }[];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("Stage 15 built-in team crests", () => {
  it("gives every fictional team a stable, distinct crest in its own kit colours", () => {
    const specs = world.teams.map((t) => crestSpec(t.teamId, t.name, t.colours));
    world.teams.forEach((t, i) => {
      expect(crestSpec(t.teamId, t.name, t.colours)).toEqual(specs[i]);
      expect(specs[i]!.primary).toBe(t.colours[0]);
      expect(specs[i]!.secondary).toBe(t.colours[1]);
      // The initials are readable on the primary colour (WCAG AA for large text is 3:1; this asks 4.5:1).
      expect(contrast(specs[i]!.ink, specs[i]!.primary)).toBeGreaterThanOrEqual(4.5);
    });
    expect(new Set(specs.map((s) => `${s.shape}/${s.pattern}/${s.initials}`)).size).toBe(world.teams.length);
    expect(specs.map((s) => s.initials)).toEqual(["AH", "CV", "NR", "WI", "EP", "SF", "LA", "MB"]);
    // More than one shape is used across the eight teams.
    expect(new Set(specs.map((s) => s.shape)).size).toBeGreaterThan(1);
  });

  it("depends on the team id, not on list order, and an edited colour changes only the colours", () => {
    const t = world.teams[2]!;
    const recoloured = crestSpec(t.teamId, t.name, ["#ffffff", "#000000"]);
    const original = crestSpec(t.teamId, t.name, t.colours);
    expect({ ...recoloured, primary: "", secondary: "", ink: "" }).toEqual({ ...original, primary: "", secondary: "", ink: "" });
    expect(recoloured.ink).toBe("#111111");
  });

  it("falls back safely on missing or malformed colours and names", () => {
    const spec = crestSpec("team-x", "", ["url(javascript:alert(1))", "red"]);
    expect(spec.primary).toBe("#2f4f4f");
    expect(spec.secondary).toBe("#f0f0f0");
    expect(spec.initials).toBe("?");
    expect(crestInitials("Larchwood")).toBe("LA");
    expect(crestInitials("  Silver   Fen ")).toBe("SF");
  });
});
