/**
 * Draws the game's icon (owner order of 20 November 2026, step 6: free, made in the project) and returns it as a
 * Windows .ico holding one 256 by 256 PNG. A pine shield with a brass rim and a red ball with a white seam, drawn
 * pixel by pixel with anti-aliased edges; no image library or downloaded art.
 */
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

const SIZE = 256;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Signed distance from (x, y) to the shield outline: negative inside. */
function shieldDistance(x, y) {
  // Shield: a rounded rectangle top half that tapers to a point at the bottom.
  const cx = 128, top = 28, bottom = 232, half = 92;
  if (y < top) return Math.hypot(Math.max(0, Math.abs(x - cx) - half), top - y);
  if (y <= 120) return Math.max(Math.abs(x - cx) - half, top - y);
  // Below y = 120 the sides curve in to the point.
  const t = (y - 120) / (bottom - 120);
  const w = half * Math.sqrt(Math.max(0, 1 - t * t));
  return Math.max(Math.abs(x - cx) - w, y - bottom);
}

function mix(a, b, t) {
  return [0, 1, 2, 3].map((i) => Math.round(a[i] * (1 - t) + b[i] * t));
}

export function iconPng() {
  const pine = [16, 55, 47, 255], pineDark = [9, 33, 30, 255], brass = [231, 187, 95, 255], red = [201, 74, 58, 255], white = [243, 214, 201, 255];
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0; // Filter: none.
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      const d = shieldDistance(px, py);
      let c = [0, 0, 0, 0];
      if (d < 1) {
        const fill = mix(pine, pineDark, Math.min(1, Math.max(0, (py - 28) / 220)));
        c = d > -12 ? brass : fill; // Brass rim 12 px wide.
        const ball = Math.hypot(px - 128, py - 124) - 52;
        if (ball < 1 && d < -12) {
          c = ball > 0 ? mix(red, c, ball) : red;
          // The seam: two straight lines down the ball, with short stitches either side.
          const line = Math.min(Math.abs(px - 120), Math.abs(px - 136));
          const stitch = (Math.abs(px - 113) < 3 || Math.abs(px - 143) < 3) && Math.floor(py / 7) % 2 === 0;
          if (ball < -4 && (line < 2 || stitch)) c = white;
        }
        if (d > 0) c = [c[0], c[1], c[2], Math.round(255 * (1 - d))];
      }
      const o = y * (SIZE * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A .ico file holding the PNG (Windows Vista and later read PNG-compressed icon entries). */
export function iconIco() {
  const png = iconPng();
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // Reserved.
  header.writeUInt16LE(1, 2); // Type: icon.
  header.writeUInt16LE(1, 4); // One image.
  header[6] = 0; // Width 256 is written as 0.
  header[7] = 0; // Height 256 is written as 0.
  header[8] = 0; // No palette.
  header[9] = 0;
  header.writeUInt16LE(1, 10); // Colour planes.
  header.writeUInt16LE(32, 12); // Bits per pixel.
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // Offset of the PNG.
  return Buffer.concat([header, png]);
}
