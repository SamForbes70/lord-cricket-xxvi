import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareCodePoints } from "@lcxxvi/contracts";

// Audit 16 Nov 2026, Phase 3: orders that feed hashed state or tie-breaks must not depend on the
// machine's locale. The original match engines (t20, odi, red-ball, offscreen fixtures) are frozen and
// still use localeCompare; changing them needs the owner's approval.
const CAREER_FILES = [
  "packages/simulation/src/player-lifecycle.ts",
  "packages/simulation/src/squad-economy.ts",
  "packages/projections/src/awards.ts",
  "packages/projections/src/historical-stats.ts",
  "packages/projections/src/persistent-world.ts",
  "packages/projections/src/tactical-briefing.ts",
  "apps/web/src/career/service.ts",
];

describe("locale-independent ordering", () => {
  it("orders by code point, whatever the locale", () => {
    expect(["z", "aa", "P2", "p10", "p_1", "p-10"].sort(compareCodePoints)).toEqual(["P2", "aa", "p-10", "p10", "p_1", "z"]);
    expect(compareCodePoints("x", "x")).toBe(0);
  });

  it.each(CAREER_FILES)("%s uses no locale-sensitive comparison", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/localeCompare\(/);
  });
});
