/* global document, window, requestAnimationFrame, getComputedStyle, localStorage */
/**
 * CP04 match moments and result card capture (Studio Production Directive 05). A copy of scripts/cp03-capture.mjs
 * (itself cut down from scripts/cp01-capture.mjs): it plays a career match against the computer captain and captures
 * a four or six moment, a wicket moment, a Brief moment, a batched Finish over, the result card and the scorecard at
 * 1366x768, 1920x1080 and 390x844, and the same under reduced motion; it times Finish over and Finish match and counts
 * animations started during a Finish match with Match moments Full and Off. A moment clears itself after a few
 * seconds unless the pointer rests on it, so the script hovers it before each screenshot. Usage:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4188 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4188 CP01_OUT=/tmp/cp04 node scripts/cp04-capture.mjs [moments|reduced|perf|anims]
 *
 * The CP03 header follows for the helpers kept from it.
 *
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
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["moments", "reduced", "perf", "anims"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

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


const SIZES = [[1366, 768], [1920, 1080], [390, 844]];
/** Set for the build before CP04 (no moments, no Match moments setting). */
const BEFORE = Boolean(process.env.CP04_BEFORE);
const moment = (page) => page.getByTestId("match-moment");

/** Screenshots the viewport at each size with the moment held under the pointer (if one shows). */
async function holdShot(page, name, sizes = SIZES, { top = true } = {}) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    if (top) await page.evaluate(() => window.scrollTo(0, 0));
    if (await moment(page).isVisible().catch(() => false)) await moment(page).hover().catch(() => undefined);
    await settle(page, 500);
    if (await moment(page).isVisible().catch(() => false)) await moment(page).hover().catch(() => undefined);
    const file = join(SHOTS, `${name}_${w}x${h}.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

/** Plays ball by ball until a moment of one of the kinds appears; returns its kind, or null. */
async function ballsUntil(page, kinds, max = 140) {
  for (let n = 0; n < max; n += 1) {
    const p = await play(page, "Next delivery");
    if (p === "COMPLETE") return null;
    if (BEFORE) {
      // The build before CP04 has no moment: stop on the stage's own call instead.
      const k = await page.getByTestId("broadcast-stage").getAttribute("data-moment").catch(() => null);
      if (kinds.includes(k)) return k;
      continue;
    }
    const m = moment(page);
    if (await m.isVisible().catch(() => false)) {
      const kind = await m.getAttribute("data-kind");
      if (kinds.includes(kind)) { await m.hover().catch(() => undefined); return kind; }
    }
  }
  return null;
}

async function setMoments(page, value) {
  await page.evaluate((v) => localStorage.setItem("lcxxvi-match-moments", v), value);
}

async function moments() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "moments");
  await page.goto(`${BASE}/#title`);
  await setMoments(page, "full");
  await step("to-match", () => toCareerMatch(page));
  await step("first-over", async () => { for (let n = 0; n < 4; n += 1) { const p = await phase(page); if (p === "READY") break; await play(page, "Next delivery"); } });
  await step("boundary-moment", async () => {
    const kind = await ballsUntil(page, ["FOUR", "SIX"]);
    metrics.boundaryKind = kind;
    if (!kind) throw new Error("no boundary moment");
    await holdShot(page, "41-moment-boundary");
    if (!BEFORE) await page.locator("[data-testid='match-moment']").screenshot({ path: join(SHOTS, "41-crop-moment-boundary_1366x768.png") }).catch(() => undefined);
  });
  await step("wicket-moment", async () => {
    const kind = await ballsUntil(page, ["WICKET", "HAT_TRICK"]);
    metrics.wicketKind = kind;
    if (!kind) throw new Error("no wicket moment");
    metrics.wicketText = BEFORE ? null : await moment(page).innerText();
    await holdShot(page, "42-moment-wicket");
    if (!BEFORE) await page.locator("[data-testid='match-moment']").screenshot({ path: join(SHOTS, "42-crop-moment-wicket_1366x768.png") }).catch(() => undefined);
  });
  await step("brief-moment", async () => {
    if (BEFORE) return;
    await page.getByLabel("Match moments").first().selectOption("brief");
    const kind = await ballsUntil(page, ["FOUR", "SIX", "WICKET", "FIFTY", "MAIDEN"]);
    if (!kind) throw new Error("no brief moment");
    await holdShot(page, "43-moment-brief", [[1366, 768], [390, 844]]);
    await page.getByLabel("Match moments").first().selectOption("full");
  });
  await step("batched-finish-over", async () => {
    // Finish over until one settles with a moment; the moment then carries the over's tally.
    for (let n = 0; n < 20; n += 1) {
      const p = await play(page, "Finish over");
      if (p === "COMPLETE") throw new Error("match ended");
      if (BEFORE && n >= 2) { await holdShot(page, "44-moment-finish-over"); return; }
      if (await moment(page).isVisible().catch(() => false)) {
        await moment(page).hover().catch(() => undefined);
        metrics.finishOverMomentText = await moment(page).innerText();
        await holdShot(page, "44-moment-finish-over");
        return;
      }
    }
    throw new Error("no moment after 20 overs");
  });
  await step("result-card", async () => {
    for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") break; }
    metrics.resultMomentVisible = await moment(page).isVisible().catch(() => false);
    metrics.resultMomentText = metrics.resultMomentVisible ? await moment(page).innerText() : null;
    await holdShot(page, "45-result-card");
    await page.locator("#decision").screenshot({ path: join(SHOTS, "45-crop-result-card_1366x768.png") });
    metrics.resultCardText = await page.getByTestId("result-moment").innerText();
  });
  await step("scorecard", async () => {
    const card = page.locator(".details-grid section.panel").filter({ has: page.getByRole("heading", { name: "Scorecard", exact: true }) });
    await card.scrollIntoViewIfNeeded();
    await card.locator("article").first().screenshot({ path: join(SHOTS, "46-crop-scorecard_1366x768.png") });
    metrics.howOut = BEFORE ? null : await page.getByTestId("how-out").allInnerTexts();
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, 400);
    await card.locator("article").first().screenshot({ path: join(SHOTS, "46-crop-scorecard_390x844.png") });
    await page.setViewportSize({ width: 1366, height: 768 });
  });
  await step("this-ball-card", async () => {
    const card = page.getByTestId("live-field-highlight-card");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: join(SHOTS, "47-crop-this-ball-card_1366x768.png") });
  });
  await browser.close();
}

/** Reduced motion: a static caption. Counts animations over a run of deliveries and captures a moment. */
async function reduced() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  watch(page, "reduced");
  await page.addInitScript(() => {
    window.__anims = 0;
    document.addEventListener("animationstart", () => { window.__anims += 1; }, true);
    document.addEventListener("transitionstart", () => { window.__anims += 1; }, true);
  });
  await page.goto(`${BASE}/#title`);
  await setMoments(page, "full");
  await step("reduced-to-match", () => toCareerMatch(page));
  await step("reduced-moment", async () => {
    const kind = await ballsUntil(page, ["FOUR", "SIX", "WICKET"]);
    if (!kind) throw new Error("no moment");
    metrics.reducedAnimations = await page.evaluate(() => window.__anims);
    if (!BEFORE) metrics.reducedMomentAnimation = await moment(page).evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el.querySelector(".moment-timer")).animationName]);
    await holdShot(page, "48-moment-reduced-motion", [[1366, 768]]);
  });
  await browser.close();
}

/** Finish over and Finish match against the computer, in milliseconds per legal ball. */
async function perf() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "perf");
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).click();
  await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
  const over = [];
  for (let n = 0; n < 60 && over.length < 8; n += 1) {
    await idle(page);
    const p = await phase(page);
    if (p === "COMPLETE") break;
    const before = legalBalls(await oversText(page));
    const btn = decision(page).getByRole("button", { name: "Finish over", exact: true });
    if (p !== "READY" || !(await btn.isEnabled().catch(() => false))) { await play(page, "Finish over"); continue; }
    const t0 = Date.now();
    await btn.click();
    await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "true", null, { timeout: 2000 }).catch(() => undefined);
    await idle(page);
    const ms = Date.now() - t0;
    const after = legalBalls(await oversText(page));
    const balls = before != null && after != null ? after - before : null;
    if (balls && balls > 0) over.push({ ms, balls, msPerBall: Math.round(ms / balls) });
  }
  metrics.perf.finishOver = { samples: over, medianMsPerBall: median(over.map((o) => o.msPerBall)) };
  metrics.perf.finishMatch = await finishMatch(page);
  console.log("perf", JSON.stringify({ finishOver: metrics.perf.finishOver.medianMsPerBall, finishMatch: metrics.perf.finishMatch }));
  await browser.close();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** From the current state to full time with Finish match (the player's own decisions answered as they come). */
async function finishMatch(page) {
  const ballsSoFar = async () => page.evaluate(() => {
    // Overs of every innings from the scorecard headings "Team · 123/4 (12.3)".
    let total = 0;
    for (const h of document.querySelectorAll(".details-grid article h3")) {
      const m = /\((\d+)\.(\d)\)/.exec(h.textContent ?? "");
      if (m) total += Number(m[1]) * 6 + Number(m[2]);
    }
    return total;
  });
  const start = await ballsSoFar();
  const t0 = Date.now();
  let clicks = 0;
  for (let n = 0; n < 200; n += 1) {
    await idle(page, 120_000);
    const p = await phase(page);
    if (p === "COMPLETE") break;
    const btn = decision(page).getByRole("button", { name: "Finish match", exact: true });
    if (p === "READY" && (await btn.isEnabled().catch(() => false))) {
      await btn.click(); clicks += 1;
      await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "true", null, { timeout: 2000 }).catch(() => undefined);
      await page.waitForFunction(() => !document.querySelector("button")?.textContent?.includes("Stop simulation") && document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout: 300_000 });
      await page.waitForFunction(() => ![...document.querySelectorAll("#decision button")].some((b) => b.textContent?.trim() === "Stop simulation"), null, { timeout: 300_000 });
    } else await play(page, "Finish match");
  }
  const ms = Date.now() - t0;
  const balls = (await ballsSoFar()) - start;
  return { ms, balls, clicks, msPerBall: balls > 0 ? Math.round(ms / balls) : null };
}

/** Animations and transitions started during a Finish match, with Match moments Full and with Off. */
async function anims() {
  const browser = await launch();
  metrics.anims = {};
  for (const pref of ["full", "off"]) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    watch(page, `anims-${pref}`);
    await page.addInitScript(() => {
      window.__anims = 0; window.__momentAnims = 0;
      document.addEventListener("animationstart", (e) => { window.__anims += 1; if (e.target?.closest?.("[data-testid='match-moment']")) window.__momentAnims += 1; }, true);
      document.addEventListener("transitionstart", () => { window.__anims += 1; }, true);
    });
    await page.goto(`${BASE}/#title`);
    await setMoments(page, pref);
    await page.getByRole("button", { name: /Quick match/ }).click();
    await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    for (let n = 0; n < 6 && (await phase(page)) !== "READY"; n += 1) await play(page, "Next delivery");
    await page.evaluate(() => { window.__anims = 0; window.__momentAnims = 0; });
    const run = await finishMatch(page);
    await settle(page, 1500);
    metrics.anims[pref] = { ...run, animations: await page.evaluate(() => window.__anims), momentAnimations: await page.evaluate(() => window.__momentAnims) };
    console.log("anims", pref, JSON.stringify(metrics.anims[pref]));
    await context.close();
  }
  await browser.close();
}

const parts = { moments, reduced, perf, anims };
for (const part of PARTS) {
  if (!parts[part]) { console.log("unknown part", part); continue; }
  try { await parts[part](); } catch (e) { console.log("PART FAIL", part, e.message); metrics.notCaptured.push({ name: `part:${part}`, error: String(e.message).split("\n")[0] }); }
}
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots;", metrics.notCaptured.length, "not captured");
for (const b of browsers) await b.close().catch(() => undefined);
process.exit(0);
