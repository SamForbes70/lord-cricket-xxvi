import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { iconIco, iconPng } from "../../scripts/make-icon.mjs";

describe("the game icon", () => {
  it("is a valid 256 by 256 RGBA PNG inside a one-image .ico", () => {
    const png = iconPng();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    const ico = iconIco();
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico.readUInt32LE(14)).toBe(png.length);
    expect(ico.subarray(22).equals(png)).toBe(true);
    expect(iconIco().equals(ico)).toBe(true); // Deterministic.
  });
  it("has a transparent corner and an opaque centre", () => {
    const png = iconPng();
    const idat = png.indexOf(Buffer.from("IDAT"));
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    const alpha = (x: number, y: number) => raw[y * (256 * 4 + 1) + 1 + x * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(128, 124)).toBe(255);
  });
});
