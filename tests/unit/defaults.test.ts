import { expect, it } from "vitest";
import {
  FIELD_REGISTRY,
  T20_POWERPLAY_SLOTS,
  T20_LATER_SLOTS,
  USER_DELEGATION,
  AI_DELEGATION,
  WEATHER_TRANSITION_WEIGHTS,
} from "@lcxxvi/data";
it.each([
  [T20_POWERPLAY_SLOTS, 2],
  [T20_LATER_SLOTS, 4],
] as const)(
  "Appendix G template resolves with expected outside count",
  (slots, outside) => {
    expect(new Set(slots).size).toBe(9);
    const positions = slots.map((id) => {
      const p = FIELD_REGISTRY.positions.find((p) => p.slotId === id);
      expect(p).toBeDefined();
      return p!;
    });
    expect(positions.filter((p) => !p.insideCircle).length).toBe(outside);
    expect(positions.filter((p) => p.legSide).length).toBeLessThanOrEqual(5);
    expect(
      positions.filter((p) => p.legSide && p.behindSquare).length,
    ).toBeLessThanOrEqual(2);
    expect(
      FIELD_REGISTRY.positions.find((p) => p.slotId === "fine-leg")?.depth,
    ).toBe("DEEP");
  },
);
it("delegation and weather defaults match Appendix G", () => {
  expect(Object.values(USER_DELEGATION).every((v) => v === false)).toBe(true);
  expect(Object.values(AI_DELEGATION).every((v) => v === true)).toBe(true);
  expect(WEATHER_TRANSITION_WEIGHTS.DRY).toEqual({
    DRY: 85,
    OVERCAST: 12,
    RAIN: 3,
  });
  for (const row of Object.values(WEATHER_TRANSITION_WEIGHTS))
    expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(100);
});
