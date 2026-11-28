/* global document, window, getComputedStyle */
/**
 * CP10 commentary capture (Studio Production Directive 05). Plays a T20 quick match against the computer captain,
 * a few overs at a time, captures the commentary panel part way through the first innings and at full time at
 * 1366x768 and 390x844, writes the visible commentary lines to a text file, measures horizontal overflow, the
 * contrast of the commentary text, and the animations running in the panel under reduced motion. It changes nothing
 * outside the browser profile it creates and needs a served build:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4197 node scripts/ui-preview-server.mjs &
 *   CP10_BASE=http://127.0.0.1:4197 CP10_OUT=/tmp/cp10 node scripts/cp10-capture.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP10_BASE ?? "http://127.0.0.1:4197";
const OUT = process.env.CP10_OUT ?? "cp10-out";
mkdirSync(OUT, { recursive: true });
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, pageErrors: [], consoleErrors: [], contrast: null, reduced: null };

const decision = (page) => page.locator("#decision");
async function idle(page, timeout = 120_000) {
  await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout });
}
async function step(page, advance = "Finish over") {
  await idle(page);
  const d = decision(page);
  const p = await d.getAttribute("data-phase");
  if (p === "COMPLETE") return p;
  const target = p === "TOSS" ? d.getByRole("button", { name: "Call heads" })
    : p === "AWAITING_INNINGS" ? d.getByRole("button", { name: "Bat first" })
    : p === "AWAITING_BATTER" || p === "AWAITING_BOWLER" ? d.locator("button[data-candidate]:enabled").first()
    : page.getByRole("button", { name: advance, exact: true });
  const revision = await d.getAttribute("data-revision");
  if ((await target.count()) > 0 && (await target.first().isEnabled().catch(() => false))) await target.first().click();
  else await page.waitForFunction((r) => document.querySelector("#decision")?.getAttribute("data-revision") !== r, revision, { timeout: 60_000 }).catch(() => undefined);
  await idle(page);
  return d.getAttribute("data-phase");
}
async function overs(page, n) {
  let done = 0;
  for (let guard = 0; guard < n * 6 && done < n; guard++) {
    const before = await page.getByTestId("match-commentary-panel").locator('li[data-category="OVER"]').count();
    if ((await step(page)) === "COMPLETE") return "COMPLETE";
    const after = await page.getByTestId("match-commentary-panel").locator('li[data-category="OVER"]').count();
    if (after > before) done++;
  }
  return decision(page).getAttribute("data-phase");
}
async function panelShot(page, name) {
  const panel = page.getByTestId("match-commentary-panel");
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    // A page-coordinate clip (the screenshot is of the full page), so the scroll offset is added.
    const box = await panel.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; });
    const file = join(OUT, `${name}_${w}x${h}.png`);
    await page.screenshot({ path: file, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, w > 1000 ? 900 : 1200) }, fullPage: true });
    metrics.shots.push(file);
    metrics.overflow[`${name}_${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}
const lines = (page) => page.getByTestId("match-commentary-panel").evaluate((el) => [...el.querySelectorAll("li")].map((li) => `${li.closest("details") ? "[note] " : ""}${li.textContent.trim().replace(/\s+/g, " ")}`));

async function run(reduced) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => metrics.pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push(m.text().slice(0, 300)); });
  await page.goto(`${BASE}/#exhibition`);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click({ timeout: 60_000 });
  await overs(page, reduced ? 2 : 6);
  if (!reduced) {
    await panelShot(page, "80-commentary-first-innings");
    writeFileSync(join(OUT, "lines-first-innings.txt"), (await lines(page)).join("\n") + "\n");
    metrics.contrast = await page.getByTestId("match-commentary-panel").evaluate((panel) => {
      const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c ?? ""); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const blend = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
      const backdrop = (el) => { const chain = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) chain.push(c); } let b = { r: 7, g: 24, b: 26, a: 1 }; for (const c of chain.reverse()) b = blend(c, b); return b; };
      const ratio = (el) => { const fg = parse(getComputedStyle(el).color); const bg = backdrop(el); const [x, y] = [lum(blend(fg, bg)), lum(bg)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
      const out = {};
      for (const [label, sel] of [["line text", "li > span"], ["ball label", ".commentary-ball"], ["over summary", "li[data-category='OVER'] > span"], ["badge", ".commentary-milestone-badge"], ["notes summary", "details summary"], ["note text", "details li"]]) {
        const el = panel.querySelector(sel); if (el) out[label] = ratio(el);
      }
      return out;
    });
    for (let guard = 0; guard < 80; guard++) if ((await step(page, "Finish innings")) === "COMPLETE") break;
    await panelShot(page, "81-commentary-full-time");
    writeFileSync(join(OUT, "lines-full-time.txt"), (await lines(page)).join("\n") + "\n");
    const notes = page.getByTestId("match-commentary-panel").locator("details");
    if (await notes.count()) {
      await notes.first().locator("summary").click();
      await panelShot(page, "82-captains-notes-open");
    }
  } else {
    metrics.reduced = await page.getByTestId("match-commentary-panel").evaluate((panel) => ({
      running: panel.getAnimations({ subtree: true }).length,
      animated: [...panel.querySelectorAll("*")].filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== "none" || parseFloat(cs.transitionDuration) > 0; }).length,
      parts: panel.querySelectorAll("*").length,
    }));
    await panelShot(page, "83-commentary-reduced-motion");
  }
  await browser.close();
}

async function career() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  page.on("pageerror", (e) => metrics.pageErrors.push(e.message));
  await page.goto(`${BASE}/#career`);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  await page.getByRole("navigation", { name: "Career navigation" }).waitFor({ timeout: 30_000 });
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible().catch(() => false)) {
    await advance.click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Play match" && !b.disabled), null, { timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await idle(page);
  await overs(page, 8);
  await panelShot(page, "84-career-commentary");
  writeFileSync(join(OUT, "lines-career.txt"), (await lines(page)).join("\n") + "\n");
  const notes = page.getByTestId("match-commentary-panel").locator("details");
  if (await notes.count()) { await notes.first().locator("summary").click(); await panelShot(page, "85-career-captains-notes"); }
  await browser.close();
}

const parts = process.argv.slice(2).length ? process.argv.slice(2) : ["quick", "reduced", "career"];
if (parts.includes("quick")) await run(false);
if (parts.includes("reduced")) await run(true);
if (parts.includes("career")) await career();
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, "metrics.json"), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify({ shots: metrics.shots.length, overflow: metrics.overflow, contrast: metrics.contrast, reduced: metrics.reduced, pageErrors: metrics.pageErrors, consoleErrors: metrics.consoleErrors.length }, null, 2));
