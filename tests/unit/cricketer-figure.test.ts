import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CricketerFigure } from "../../apps/web/src/world/CricketerFigure.js";

describe("cricketer figures", () => {
  it("draw both poses in the club's kit, decorative and self-contained", () => {
    for (const pose of ["batter", "bowler"] as const) {
      const svg = renderToStaticMarkup(createElement(CricketerFigure, { pose, kit: ["#123456", "#abcdef"], seed: "p001" }));
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain("#123456");
      expect(svg).toContain("#abcdef");
      expect(svg).not.toMatch(/href=|https?:|NaN|undefined/);
    }
  });
  it("falls back to house colours when a kit colour is not a plain hex value", () => {
    const svg = renderToStaticMarkup(createElement(CricketerFigure, { pose: "batter", kit: ["red", "url(x)"] }));
    expect(svg).not.toContain("url(x)");
    expect(svg).toContain("#1f5a4a");
  });
});
