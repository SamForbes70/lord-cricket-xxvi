/* global document, window, performance, requestAnimationFrame, getComputedStyle, HTMLElement, innerHeight */
/**
 * CP03 match broadcast capture (Studio Production Directive 05). A copy of scripts/cp01-capture.mjs (branch
 * pavilion/cp01-creative-audit) cut down to the live match: it plays a career match against the computer captain and
 * screenshots the live match, the field, the tactics panel and the match conclusion at 1280x720, 1366x768, 1920x1080,
 * 2560x1440 and 390x844, a 1280x720 page at deviceScaleFactor 1.5, times Finish over and Next delivery, reads the JS heap,
 * and records layout positions, a contrast walk, the Tab order through the advance controls and reduced-motion
 * animation counts. It changes nothing outside the browser profile it creates and needs a served build:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4186 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4186 CP01_OUT=/tmp/cp03 node scripts/cp03-capture.mjs [match|scale150|perf|a11y]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP01_BASE ?? "http://127.0.0.1:4186";
const OUT = process.env.CP01_OUT ?? "cp01-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["match", "scale150", "perf", "a11y"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const FULL = [[1366, 768], [1920, 1080]];
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, notCaptured: [], pageErrors: [], consoleErrors: [], perf: {}, a11y: {} };
const browsers = [];
const launch = async () => { const b = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info", "--no-sandbox"] }); browsers.push(b); return b; };

function watch(page, label) {
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
}

async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}

/** Screenshots the page (or one element) at each size, then returns to 1366x768. */
async function shot(page, name, { sizes = FULL, fullPage = false, element = null, suffix = "" } = {}) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    const file = join(SHOTS, `${name}${suffix}_${w}x${h}${fullPage ? "_full" : ""}.png`);
    try {
      if (element) await page.locator(element).first().screenshot({ path: file, timeout: 15_000 });
      else await page.screenshot({ path: file, fullPage });
      metrics.shots.push(file);
    } catch (e) { metrics.notCaptured.push({ name: `${name}_${w}x${h}`, error: String(e.message).slice(0, 200) }); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    metrics.overflow[`${name}_${w}x${h}`] = overflow;
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}

const decision = (page) => page.locator("#decision");
async function idle(page, timeout = 60_000) {
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

async function oversText(page) { return (await page.locator(".scorestrip .over").first().textContent().catch(() => "")) ?? ""; }
function legalBalls(text) { const m = /(\d+)\.(\d)/.exec(text); return m ? Number(m[1]) * 6 + Number(m[2]) : null; }
async function heap(page) { return page.evaluate(() => (performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null)); }

async function playToEnd(page) {
  for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") return true; }
  return false;
}


const KEY_ALL = [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [390, 844]];

/** Where the main match regions sit on the first screen, and whether the page scrolls sideways. */
async function layout(page, label) {
  const sizes = KEY_ALL;
  const out = {};
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 250);
    out[`${w}x${h}`] = await page.evaluate(() => {
      const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return {
        scorestrip: box("[data-testid='scorestrip']"), stage: box("[data-testid='broadcast-stage']"), decision: box("#decision"),
        advance: box("[data-testid='advance-controls']"), field: box("[data-testid='live-field-svg']"), jump: box("[data-testid='dugout-jump']"),
        pageHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  }
  metrics.layout[label] = out;
  await page.setViewportSize({ width: 1366, height: 768 });
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

async function match() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page, "match");
  metrics.heap = {};
  metrics.layout = {};
  await step("career-match", async () => {
    await page.goto(`${BASE}/#title`);
    await toCareerMatch(page);
    await settle(page, 600);
    await shot(page, "19-career-match-toss", { sizes: [[1366, 768]] });
  });
  await step("live-match", async () => {
    for (let n = 0; n < 6; n += 1) {
      const p = await phase(page);
      if (p !== "TOSS" && p !== "AWAITING_INNINGS" && n > 1 && legalBalls(await oversText(page)) >= 6) break;
      await play(page, "Next delivery");
    }
    for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 24; n += 1) await play(page, "Finish over");
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 800);
    await shot(page, "21-live-match", { sizes: KEY_ALL });
    await shot(page, "21-live-match", { sizes: [[1366, 768], [1920, 1080]], fullPage: true });
    await layout(page, "live");
    metrics.heap.liveMatch = await heap(page);
    await shot(page, "23-live-field", { sizes: [[1366, 768], [1920, 1080]], element: "[data-testid='live-field-panel']" });
    await shot(page, "24-crop-tactics-panel", { sizes: [[1366, 768]], element: "section.tactics" });
    await shot(page, "22-crop-decision-panel", { sizes: [[1366, 768], [390, 844]], element: "#decision" });
    await page.evaluate(() => window.scrollTo(0, 1400));
    await shot(page, "25-live-scrolled-field-sticky", { sizes: [[1366, 768], [1920, 1080]] });
  });
  await step("match-conclusion", async () => {
    const done = await playToEnd(page);
    if (!done) throw new Error("match did not finish");
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 1000);
    await shot(page, "27-match-conclusion", { sizes: KEY_ALL });
    await shot(page, "27-match-conclusion", { sizes: [[1366, 768]], fullPage: true });
    await layout(page, "conclusion");
    metrics.heap.postMatch = await heap(page);
  });
  await browser.close();
}

async function scale150() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  watch(page, "scale150");
  const s = async (name) => {
    await settle(page, 600);
    const file = join(SHOTS, `${name}_1280x720@1.5x.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_1280x720@1.5x`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  };
  await step("150-live-match", async () => {
    await page.goto(`${BASE}/#title`);
    await toCareerMatch(page);
    for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 18; n += 1) await play(page, "Finish over");
    await page.evaluate(() => window.scrollTo(0, 0));
    await s("21-live-match");
    if (!(await playToEnd(page))) throw new Error("match did not finish");
    await page.evaluate(() => window.scrollTo(0, 0));
    await s("27-match-conclusion");
  });
  await browser.close();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function perf() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "perf");
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).click();
  await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
  const over = [], single = [];
  for (let n = 0; n < 80 && (over.length < 8 || single.length < 12); n += 1) {
    await idle(page);
    const p = await phase(page);
    if (p === "COMPLETE") break;
    const before = legalBalls(await oversText(page));
    const wantSingle = single.length < 12 && over.length >= 4;
    const label = wantSingle ? "Next delivery" : "Finish over";
    const btn = decision(page).getByRole("button", { name: label, exact: true });
    if (p !== "READY" || !(await btn.isEnabled().catch(() => false))) { await play(page, "Finish over"); continue; }
    const t0 = Date.now();
    await btn.click();
    await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "true", null, { timeout: 2000 }).catch(() => undefined);
    await idle(page);
    const ms = Date.now() - t0;
    const after = legalBalls(await oversText(page));
    const balls = before != null && after != null ? after - before : null;
    if (balls && balls > 0) (wantSingle ? single : over).push({ ms, balls, msPerBall: Math.round(ms / balls) });
  }
  metrics.perf.finishOver = { samples: over, medianMsPerBall: median(over.map((o) => o.msPerBall)) };
  metrics.perf.nextDelivery = { samples: single, medianMsPerBall: median(single.map((o) => o.msPerBall)) };
  metrics.perf.heapMidMatch = await heap(page);
  const t0 = Date.now();
  await playToEnd(page);
  metrics.perf.finishInningsToEndMs = Date.now() - t0;
  metrics.perf.heapAfterMatch = await heap(page);
  console.log("perf", JSON.stringify({ finishOver: metrics.perf.finishOver.medianMsPerBall, nextDelivery: metrics.perf.nextDelivery.medianMsPerBall, heapMid: metrics.perf.heapMidMatch, heapAfter: metrics.perf.heapAfterMatch }));
  await browser.close();
}

/** Contrast of visible text against the composited solid background colours; focus indicators; reduced motion. */
const CONTRAST_SCRIPT = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 1) break; }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
  };
  const out = { checked: 0, fails: [] };
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const bg = bgOf(el);
    const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    out.checked += 1;
    if (ratio < (large ? 3 : 4.5)) {
      const key = `${text.slice(0, 40)}|${ratio.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.fails.push({ text: text.slice(0, 60), ratio: Number(ratio.toFixed(2)), fontPx: size, fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, cls: el.className?.toString().slice(0, 40) ?? "", tag: el.tagName });
    }
  }
  out.fontSizesPx = [...new Set([...document.querySelectorAll("body *")].filter((e) => e instanceof HTMLElement && e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize))].sort((a, b) => parseFloat(a) - parseFloat(b));
  return out;
};


async function a11y() {
  const browser = await launch();
  for (const motion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: motion });
    const page = await context.newPage();
    watch(page, `a11y-${motion}`);
    await page.addInitScript(() => {
      window.__anims = 0;
      document.addEventListener("animationstart", () => { window.__anims += 1; }, true);
      document.addEventListener("transitionstart", () => { window.__anims += 1; }, true);
    });
    await page.goto(`${BASE}/#title`);
    await toCareerMatch(page);
    for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 12; n += 1) await play(page, "Finish over");
    for (let n = 0; n < 6; n += 1) await play(page, "Next delivery");
    metrics.a11y[`animations_${motion}`] = await page.evaluate(() => window.__anims);
    if (motion === "reduce") { await context.close(); continue; }
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 600);
    metrics.a11y.liveContrast = await page.evaluate(CONTRAST_SCRIPT);
    // Tab order through the decision panel: focus the decision heading, then Tab forward.
    await page.locator("#decision h2").first().focus();
    const order = [];
    for (let n = 0; n < 14; n += 1) {
      await page.keyboard.press("Tab");
      order.push(await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, inDecision: Boolean(el.closest("#decision")) };
      }));
    }
    metrics.a11y.tabOrderFromDecision = order;
    // A programmatically focused heading must not draw a box.
    metrics.a11y.headingFocusOutline = await page.evaluate(() => { const h = document.querySelector("#decision h2"); h.focus(); const cs = getComputedStyle(h); return `${cs.outlineStyle} ${cs.outlineWidth}`; });
    await page.getByTestId("live-field-panel").scrollIntoViewIfNeeded();
    metrics.a11y.fieldLabelSizesPx = await page.evaluate(() => [...document.querySelectorAll("[data-testid='live-field-svg'] text")].map((t) => Math.round(t.getBoundingClientRect().height * 10) / 10).sort((a, b) => a - b).slice(0, 5));
    await context.close();
  }
  await browser.close();
}

const parts = { match, scale150, perf, a11y };
for (const part of PARTS) {
  if (!parts[part]) { console.log("unknown part", part); continue; }
  try { await parts[part](); } catch (e) { console.log("PART FAIL", part, e.message); metrics.notCaptured.push({ name: `part:${part}`, error: String(e.message).split("\n")[0] }); }
}
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots;", metrics.notCaptured.length, "not captured");
for (const b of browsers) await b.close().catch(() => undefined);
process.exit(0);
