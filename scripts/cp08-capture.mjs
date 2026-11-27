/* global document, window, requestAnimationFrame, getComputedStyle */
/**
 * CP08 statistical visualisation capture (Studio Production Directive 05). Cut down from scripts/cp04-capture.mjs: it
 * plays a career match against the computer captain, captures the live recent-balls strip part way through an over,
 * plays to full time and captures each chart of the completed match's analytics (Manhattan, worm, partnership and
 * fall-of-wickets tables, wagon wheel for all batters and for a left-handed batter, pitch lengths) at 1366x768,
 * 1920x1080 and 390x844, measures the contrast of chart text and marks against what they sit on, counts running
 * animations in the analytics under reduced motion, then simulates the rest of the season and captures the season
 * review tables. It changes nothing outside the browser profile it creates and needs a served build:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4194 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4194 CP01_OUT=/tmp/cp08 node scripts/cp08-capture.mjs [match] [season] [reduced]
 *
 * `season` starts its own career and simulates every fixture to reach the season review.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP01_BASE ?? "http://127.0.0.1:4194";
const OUT = process.env.CP01_OUT ?? "cp08-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["match", "season", "reduced"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const SIZES = [[1366, 768], [1920, 1080], [390, 844]];
const leftHanders = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")).players
  .filter((p) => p.batHand === "L").map((p) => p.playerId);

const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, notCaptured: [], pageErrors: [], consoleErrors: [], contrast: {}, reduced: {} };
const browsers = [];
const launch = async () => { const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] }); browsers.push(b); return b; };

function watch(page, label) {
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
}
async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const decision = (page) => page.locator("#decision");
async function idle(page, timeout = 120_000) {
  await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout });
}
async function phase(page) { return decision(page).getAttribute("data-phase"); }

/** One step against the computer: the player's own decision when offered, otherwise the chosen advance. */
async function play(page, advance = "Finish over") {
  await idle(page);
  const p = await phase(page);
  if (p === "COMPLETE") return p;
  const d = decision(page);
  const revision = await d.getAttribute("data-revision");
  const target = p === "TOSS" ? d.getByRole("button", { name: "Call heads" })
    : p === "AWAITING_INNINGS" ? d.getByRole("button", { name: "Bat first" })
    : p === "AWAITING_BATTER" || p === "AWAITING_BOWLER" ? d.locator("button[data-candidate]:enabled").first()
    : d.getByRole("button", { name: advance, exact: true });
  if ((await target.count()) > 0 && (await target.isEnabled().catch(() => false))) await target.click();
  else await page.waitForFunction((r) => document.querySelector("#decision")?.getAttribute("data-revision") !== r, revision, { timeout: 60_000 }).catch(() => undefined);
  await idle(page);
  return phase(page);
}

async function toCareerMatch(page) {
  await page.goto(`${BASE}/#career`);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  await club.waitFor({ timeout: 30_000 });
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible().catch(() => false)) {
    await advance.click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Play match" && !b.disabled), null, { timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await idle(page);
}

async function viewportShot(page, name, sizes = SIZES, before = undefined) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    if (before) await before();
    await settle(page, 400);
    const file = join(SHOTS, `${name}_${w}x${h}.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_${w}x${h}`] = await overflow(page);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

const analytics = (page) => page.getByRole("region", { name: "Event-derived match analytics" });

/** A page-coordinate clip from one analytics heading to the next (or the end of the panel), at most maxHeight tall. */
async function clipBetween(page, from, to, maxHeight = 1150) {
  return page.evaluate(({ from, to, maxHeight }) => {
    const region = document.querySelector("section[aria-label='Event-derived match analytics']");
    if (!region) return null;
    const heads = [...region.querySelectorAll("h3")];
    const a = heads.find((h) => new RegExp(from, "i").test(h.textContent ?? ""));
    if (!a) return null;
    const b = to ? heads.find((h) => new RegExp(to, "i").test(h.textContent ?? "")) : null;
    const r = region.getBoundingClientRect(), ra = a.getBoundingClientRect();
    const top = ra.top + window.scrollY - 8;
    const bottom = b ? b.getBoundingClientRect().top + window.scrollY - 4 : r.bottom + window.scrollY;
    return { x: Math.max(0, r.left + window.scrollX), y: top, width: Math.min(r.width, document.documentElement.clientWidth), height: Math.min(maxHeight, bottom - top) };
  }, { from, to, maxHeight });
}

async function chartCrops(page, prefix, sizes = SIZES) {
  const parts = [
    ["61-manhattan", "Manhattan", "worm"],
    ["62-worm", "worm", "Partnerships"],
    ["63-partnerships-fall-of-wickets", "Partnerships", "wagon"],
    ["64-wagon-wheel", "wagon", "pitch length"],
    ["65-pitch-lengths", "pitch length", null],
  ];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page, 500);
    metrics.overflow[`${prefix}analytics_${w}x${h}`] = await overflow(page);
    for (const [name, from, to] of parts) {
      const clip = await clipBetween(page, from, to);
      if (!clip) { metrics.notCaptured.push({ name: `${prefix}${name}_${w}x${h}`, error: "heading not found" }); continue; }
      const file = join(SHOTS, `${prefix}${name}_${w}x${h}.png`);
      await page.screenshot({ path: file, clip, fullPage: true });
      metrics.shots.push(file);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

/** Contrast of chart text and marks against the colour they are drawn on (WCAG relative luminance). */
async function contrast(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c ?? ""); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
    /** The opaque background behind an element: its ancestors' background colours composited from the page up. */
    const backdrop = (el) => {
      const chain = [];
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) chain.push(c); }
      let base = { r: 7, g: 24, b: 26, a: 1 };
      for (const c of chain.reverse()) base = blend(c, base);
      return base;
    };
    const region = document.querySelector("section[aria-label='Event-derived match analytics']");
    if (!region) return null;
    const out = {};
    const textOn = (label, sel, fillProp = "fill") => {
      const el = region.querySelector(sel);
      if (!el) return;
      const fg = parse(getComputedStyle(el)[fillProp]) ?? parse(getComputedStyle(el).color);
      const bg = backdrop(el.closest("svg")?.parentElement ?? el.parentElement);
      if (fg) out[label] = { fg: getComputedStyle(el)[fillProp], ratio: ratio(blend(fg, bg), bg) };
    };
    // Every distinct SVG text fill and mark stroke in the charts, against the panel behind the SVG.
    const seen = new Set();
    for (const svg of region.querySelectorAll("svg")) {
      const bg = backdrop(svg.parentElement);
      for (const el of svg.querySelectorAll("text, line, polyline, path, rect, circle")) {
        const cs = getComputedStyle(el);
        const tag = el.tagName.toLowerCase();
        const kind = tag === "text" ? "text" : "mark";
        for (const prop of kind === "text" ? ["fill"] : tag === "line" || tag === "polyline" ? ["stroke"] : ["fill", "stroke"]) {
          const c = parse(cs[prop]);
          if (!c || c.a === 0 || cs[prop] === "none") continue;
          const key = `${svg.getAttribute("aria-label")?.slice(0, 40)}|${kind}|${prop}|${cs[prop]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out[key] = ratio(blend(c, bg), bg);
        }
      }
    }
    textOn("pitch label", ".analytics-pitch text");
    textOn("over number", ".analytics-over small", "color");
    textOn("sector label", ".analytics-sectors span", "color");
    textOn("table cell", "td", "color");
    textOn("body text", "p", "color");
    return out;
  });
}

async function match() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "match");
  await page.goto(`${BASE}/#title`);
  await step("to-match", () => toCareerMatch(page));
  await step("live-strip", async () => {
    // Three overs and three balls, so the strip holds the end of one over and the start of the next.
    for (let n = 0; n < 12; n += 1) { const p = await phase(page); if (p === "READY") break; await play(page, "Next delivery"); }
    for (let n = 0; n < 3; n += 1) await play(page, "Finish over");
    for (let n = 0; n < 3; n += 1) await play(page, "Next delivery");
    const stage = page.getByTestId("broadcast-stage");
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await stage.scrollIntoViewIfNeeded();
      await settle(page, 1800);
      const file = join(SHOTS, `51-crop-live-strip_${w}x${h}.png`);
      await stage.screenshot({ path: file });
      metrics.shots.push(file);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    metrics.stripText = await stage.locator("ol").first().innerText().catch(() => null);
    await viewportShot(page, "50-live-match", [[1366, 768]], () => page.evaluate(() => window.scrollTo(0, 0)));
  });
  await step("full-time", async () => {
    for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") break; }
    if ((await phase(page)) !== "COMPLETE") throw new Error("match did not finish");
    await analytics(page).waitFor({ timeout: 60_000 });
  });
  await step("analytics", async () => {
    await viewportShot(page, "60-analytics-manhattan", SIZES, async () => {
      await analytics(page).getByRole("heading", { name: /Manhattan/ }).evaluate((h) => h.scrollIntoView({ block: "start" }));
    });
    await chartCrops(page, "");
    metrics.contrast.completedMatch = await contrast(page);
  });
  await step("wagon-left-hander", async () => {
    const select = analytics(page).getByRole("combobox", { name: "Batter" });
    const left = await select.evaluate((s, ids) => Array.from(s.options).map((o) => o.value).find((v) => ids.includes(v)) ?? null, leftHanders);
    metrics.leftHander = left;
    if (!left) throw new Error("no left-handed batter in this match");
    await select.selectOption(left);
    await settle(page, 400);
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await settle(page, 400);
      const clip = await clipBetween(page, "wagon", "pitch length");
      const file = join(SHOTS, `66-wagon-wheel-left-hander_${w}x${h}.png`);
      await page.screenshot({ path: file, clip, fullPage: true });
      metrics.shots.push(file);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    metrics.leftHanderSectors = await analytics(page).locator(".analytics-sectors > div").allInnerTexts();
    await select.selectOption("ALL");
  });
  await browser.close();
}

async function season() {
  // A new career, every fixture simulated, as tests/ui/season-finale.spec.ts does.
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "season");
  await page.goto(`${BASE}/`);
  await step("season-to-review", async () => {
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    for (let round = 1; round <= 14; round += 1) {
      const advance = page.getByRole("button", { name: "Advance to match day" });
      if (await advance.isVisible().catch(() => false)) {
        await advance.click();
        await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
      }
      await page.getByRole("button", { name: "Simulate match" }).click();
      await page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true }).waitFor({ timeout: 120_000 });
      await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
    }
    const finale = page.getByTestId("season-finale");
    await finale.waitFor({ timeout: 60_000 });
    const table = page.getByTestId("season-finale-table");
    await viewportShot(page, "70-season-review-table", SIZES, () => table.evaluate((t) => t.scrollIntoView({ block: "center" })));
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await settle(page, 400);
      const file = join(SHOTS, `70-crop-season-review-table_${w}x${h}.png`);
      await table.screenshot({ path: file });
      metrics.shots.push(file);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    metrics.seasonTableAlign = await table.evaluate((t) => [...t.querySelectorAll("thead th, tbody tr:first-child td")].map((c) => `${c.textContent}:${getComputedStyle(c).textAlign}:${Math.round(c.getBoundingClientRect().width)}`));
    for (let s = 2; s <= 6; s += 1) {
      const next = page.getByTestId("season-finale-continue");
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await settle(page, 600);
      const squad = page.getByTestId("season-review-squad");
      if (await squad.isVisible().catch(() => false)) {
        await viewportShot(page, "71-season-review-squad", SIZES, () => squad.evaluate((t) => t.scrollIntoView({ block: "center" })));
        for (const [w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          await settle(page, 400);
          const file = join(SHOTS, `71-crop-season-review-squad_${w}x${h}.png`);
          await squad.screenshot({ path: file });
          metrics.shots.push(file);
        }
        await page.setViewportSize({ width: 1366, height: 768 });
        break;
      }
    }
  });
  await browser.close();
}

/** Reduced motion: running animations inside the analytics, and the computed transition and animation of chart parts. */
async function reduced() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  watch(page, "reduced");
  await page.goto(`${BASE}/#title`);
  await step("reduced-quick-match", async () => {
    await page.getByRole("button", { name: /Quick match/ }).click();
    await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") break; }
    await analytics(page).waitFor({ timeout: 60_000 });
    await analytics(page).scrollIntoViewIfNeeded();
    await settle(page, 600);
    metrics.reduced = await page.evaluate(() => {
      const region = document.querySelector("section[aria-label='Event-derived match analytics']");
      const parts = [...region.querySelectorAll("svg, svg *, .analytics-sectors *, .stage-balls *")];
      const moving = parts.filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== "none" || parseFloat(cs.transitionDuration) > 0; });
      return { runningAnimations: region.getAnimations({ subtree: true }).length, partsChecked: parts.length, partsWithMotion: moving.length };
    });
    metrics.contrast.quickMatchReduced = await contrast(page);
  });
  await browser.close();
}

const parts = { match, season, reduced };
for (const part of PARTS) {
  if (!parts[part]) { console.log("unknown part", part); continue; }
  try { await parts[part](); } catch (e) { console.log("PART FAIL", part, e.message); metrics.notCaptured.push({ name: `part:${part}`, error: String(e.message).split("\n")[0] }); }
}
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots;", metrics.notCaptured.length, "not captured");
for (const b of browsers) await b.close().catch(() => undefined);
process.exit(0);
