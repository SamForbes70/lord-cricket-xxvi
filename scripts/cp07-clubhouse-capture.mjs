/* global document, window, requestAnimationFrame, getComputedStyle, HTMLElement, innerHeight */
/**
 * CP07 Clubhouse capture (Studio Production Directive 05). Adapted from scripts/cp01-capture.mjs on the
 * pavilion/cp01-creative-audit branch: the same sizes, settle steps, contrast walk and navigation timing, cut down to
 * the Clubhouse. It needs a served build, for example:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4187 node scripts/ui-preview-server.mjs &
 *   CP07_BASE=http://127.0.0.1:4187 CP07_OUT=/tmp/cp07-after node scripts/cp07-clubhouse-capture.mjs [shots|scale150|perf|a11y]
 *
 * Shots: the Clubhouse of a new Aster Harbour career before any match, and after one simulated match (with the match
 * report open, then closed), at 1280x720, 1366x768, 1920x1080, 2560x1440 and 390x844 (deviceScaleFactor 1), plus a
 * full-page capture at 1366x768. `scale150` opens 1280x720 at deviceScaleFactor 1.5 (a 1920x1080 display at 150%).
 * `perf` times three cycles round the five Clubhouse places, before and after one match. Nothing outside the browser
 * profile it creates is changed. Set CP07_CHROMIUM to use a particular Chromium executable.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP07_BASE ?? "http://127.0.0.1:4187";
const OUT = process.env.CP07_OUT ?? "cp07-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["shots", "scale150", "perf", "a11y"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const KEY = [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [390, 844]];
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, contentTop: {}, notCaptured: [], pageErrors: [], consoleErrors: [], perf: {}, a11y: {} };
const browsers = [];
const launch = async () => {
  const b = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(process.env.CP07_CHROMIUM ? { executablePath: process.env.CP07_CHROMIUM } : {}) });
  browsers.push(b);
  return b;
};

function watch(page, label) {
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
}
async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
/** Top of the first Clubhouse content block, in CSS pixels from the top of the page. */
const contentTop = (page) => page.evaluate(() => {
  const first = document.querySelector(".dashboard-grid > *");
  return first ? Math.round(first.getBoundingClientRect().top + window.scrollY) : null;
});
async function shot(page, name, { sizes = KEY, fullPage = false } = {}) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    const file = join(SHOTS, `${name}_${w}x${h}${fullPage ? "_full" : ""}.png`);
    try { await page.screenshot({ path: file, fullPage }); metrics.shots.push(file); }
    catch (e) { metrics.notCaptured.push({ name: `${name}_${w}x${h}`, error: String(e.message).slice(0, 200) }); }
    metrics.overflow[`${name}_${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    metrics.contentTop[`${name}_${w}x${h}`] = await contentTop(page);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}
async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}
const club = (page) => page.getByRole("navigation", { name: "Career navigation" });
async function newCareer(page) {
  await page.goto(`${BASE}/#career`);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  await club(page).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Simulate match" }).waitFor({ timeout: 30_000 });
  await settle(page, 800);
}
async function simulateOne(page) {
  await page.getByRole("button", { name: "Simulate match" }).click();
  await page.getByTestId("match-report").waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector(".save-badge strong")?.textContent === "Saved", null, { timeout: 30_000 });
  await settle(page, 800);
}

async function shots() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page, "shots");
  await step("clubhouse-pre", async () => {
    await newCareer(page);
    await shot(page, "01-clubhouse-pre-season");
    await shot(page, "01-clubhouse-pre-season", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("clubhouse-after-match", async () => {
    await simulateOne(page);
    await shot(page, "02-clubhouse-after-match-report");
    await page.getByTestId("match-report-close").click();
    await settle(page, 600);
    await shot(page, "03-clubhouse-after-match");
    await shot(page, "03-clubhouse-after-match", { sizes: [[1366, 768]], fullPage: true });
  });
  await browser.close();
}

async function scale150() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  watch(page, "scale150");
  const s = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 600);
    const file = join(SHOTS, `${name}_1280x720_at1.5x.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_1280x720@1.5x`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    metrics.contentTop[`${name}_1280x720@1.5x`] = await contentTop(page);
  };
  await step("150", async () => {
    await newCareer(page);
    await s("01-clubhouse-pre-season");
    await simulateOne(page);
    await page.getByTestId("match-report-close").click();
    await s("03-clubhouse-after-match");
  });
  await browser.close();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function cycle(page, label) {
  const nav = {};
  for (let round = 0; round < 3; round += 1) {
    for (const [name, ready] of [["Squad", "[data-testid='training-presets']"], ["Office", "#contracts-heading"], ["Season", "nav[aria-label='Season sections']"], ["Settings", null], ["Clubhouse", "#home-heading"]]) {
      const t0 = Date.now();
      await club(page).getByRole("button", { name }).click();
      await page.waitForFunction((n) => [...document.querySelectorAll("nav[aria-label='Career navigation'] button")].some((b) => b.textContent?.trim() === n && b.hasAttribute("aria-current")), name);
      if (ready) await page.locator(ready).first().waitFor();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      (nav[name] ??= []).push(Date.now() - t0);
    }
  }
  metrics.perf[label] = Object.fromEntries(Object.entries(nav).map(([k, v]) => [k, { samples: v, median: median(v) }]));
  console.log(label, JSON.stringify(metrics.perf[label]));
}

async function perf() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "perf");
  await step("perf", async () => {
    await newCareer(page);
    await settle(page, 1500);
    await cycle(page, "navigationPreSeason");
    await club(page).getByRole("button", { name: "Clubhouse" }).click();
    await simulateOne(page);
    await page.getByTestId("match-report-close").click();
    await settle(page, 1000);
    await cycle(page, "navigationAfterOneMatch");
  });
  await browser.close();
}

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
  const root = document.querySelector("main.career-shell") ?? document.body;
  const out = { checked: 0, fails: [] };
  const seen = new Set();
  for (const el of root.querySelectorAll("*")) {
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
  // The lowest ratio in the Clubhouse lead, measured against the solid colour behind each text node.
  const lead = [...document.querySelectorAll(".clubhouse-lead *, .fixture-lead *")].filter((e) => e instanceof HTMLElement && e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  out.leadMinimum = lead.reduce((min, e) => {
    const cs = getComputedStyle(e); const fg0 = parse(cs.color); if (!fg0) return min;
    const bg = bgOf(e); const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return ratio < min.ratio ? { ratio: Number(ratio.toFixed(2)), text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 40) } : min;
  }, { ratio: 99, text: "" });
  return out;
};

async function focusWalk(page, label, tabs = 30) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [];
  for (let i = 0; i < tabs; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visibleRing = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48), visibleRing };
    });
    if (info) stops.push(info);
  }
  return { stops: stops.length, withoutVisibleRing: stops.filter((s) => !s.visibleRing), order: stops.map((s) => `${s.tag}:${s.name}`) };
}

async function a11y() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "a11y");
  await step("a11y", async () => {
    await newCareer(page);
    metrics.a11y.contrastPre = await page.evaluate(CONTRAST_SCRIPT);
    metrics.a11y.focusPre = await focusWalk(page, "pre", 30);
    await simulateOne(page);
    await page.getByTestId("match-report-close").click();
    await settle(page, 800);
    metrics.a11y.contrastAfter = await page.evaluate(CONTRAST_SCRIPT);
    metrics.a11y.focusAfter = await focusWalk(page, "after", 30);
  });
  const reduced = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const rpage = await reduced.newPage();
  await step("reduced-motion", async () => {
    await newCareer(rpage);
    metrics.a11y.reducedMotionAnimations = await rpage.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => { const cs = getComputedStyle(e); return cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.01; }).length);
  });
  await browser.close();
}

const parts = { shots, scale150, perf, a11y };
for (const part of PARTS) await parts[part]();
for (const b of browsers) await b.close().catch(() => undefined);
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, "metrics.json"), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots", metrics.notCaptured.length, "not captured", metrics.pageErrors.length, "page errors");
