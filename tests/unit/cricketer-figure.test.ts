import { describe, expect, it } from "vitest";
import { figurePaint, shade } from "../../apps/web/src/world/cricketer-paint.js";

describe("cricketer figure colours", () => {
  it("use the club's kit, with darker shades for the far side, and the same skin for the same seed", () => {
    const paint = figurePaint(["#123456", "#abcdef"], "p001");
    expect(paint.shirt).toBe("#123456");
    expect(paint.trim).toBe("#abcdef");
    expect(paint.far).toBe(shade("#123456", -0.32));
    expect(paint.far).not.toBe(paint.shirt);
    expect(figurePaint(["#123456", "#abcdef"], "p001").skin).toBe(paint.skin);
    for (const value of Object.values(paint)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("falls back to house colours when a kit colour is not a plain hex value", () => {
    const paint = figurePaint(["red", "url(x)"], "p002");
    expect(paint.shirt).toBe("#1f5a4a");
    expect(paint.trim).toBe("#e7bb5f");
  });
});
