import { expect, test } from "@playwright/test";
import path from "node:path";

const persistenceUrl = () => `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;

// docs/design/MATCH_ARCHIVE_STORAGE_V2.md, step 4: archives are stored gzip + base64 and decompressed
// with a hard cap, so a crafted row cannot expand without bound.
test("compressed archive payloads round-trip and refuse to expand past their cap", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(async (moduleUrl) => {
    const p = (await import(moduleUrl)) as typeof import("../../packages/persistence/src/index.js");
    const text = JSON.stringify({ events: Array.from({ length: 2000 }, (_, i) => ({ sequence: i, type: "DELIVERY_RECORDED", note: "é ✓" })) });
    const stored = await p.gzipToBase64(text);
    const back = await p.gunzipBase64ToText(stored, 10_000_000);
    let capError = "";
    try { await p.gunzipBase64ToText(stored, 1000); } catch (e) { capError = e instanceof Error ? e.message : String(e); }
    let corruptError = "";
    const mid = Math.floor(stored.length / 2);
    try { await p.gunzipBase64ToText(stored.slice(0, mid) + (stored[mid] === "A" ? "B" : "A") + stored.slice(mid + 1), 10_000_000); } catch (e) { corruptError = e instanceof Error ? e.message : String(e); }
    return { same: back === text, ratio: text.length / stored.length, capError, corrupted: corruptError.length > 0 };
  }, persistenceUrl());
  expect(result.same).toBe(true);
  expect(result.ratio).toBeGreaterThan(4);
  expect(result.capError).toBe("COMPRESSED_PAYLOAD_TOO_LARGE");
  expect(result.corrupted).toBe(true);
});
