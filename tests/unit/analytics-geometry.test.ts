import { describe, expect, test } from "vitest";
import { displaySector, sectorEndpoint } from "../../apps/web/src/match/analytics-geometry.js";

describe("shot-sector display geometry", () => {
  test("reflects left-handed sectors without changing the recorded sector", () => {
    for (let sector = 0; sector < 8; sector++) {
      const reflected = displaySector(sector, "L");
      expect(displaySector(reflected, "L")).toBe(sector);
      expect(displaySector(sector, "R")).toBe(sector);
      const right = sectorEndpoint(sector, 0.75), left = sectorEndpoint(reflected, 0.75);
      expect(left.x).toBeCloseTo(200 - right.x);
      expect(left.y).toBeCloseTo(right.y);
    }
  });
  test("rejects unsupported sectors and magnitudes", () => {
    expect(() => displaySector(8, "L")).toThrow("INVALID_SHOT_SECTOR");
    expect(() => sectorEndpoint(0, 1.1)).toThrow("INVALID_SECTOR_GEOMETRY");
    expect(() => sectorEndpoint(0, Number.NaN)).toThrow("INVALID_SECTOR_GEOMETRY");
  });
});
