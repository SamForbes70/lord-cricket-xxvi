// Project Pavilion P01: play one quick match as a cooperative player would and record friction measures.
// Needs a built app served on port 4180 (npx vite preview --config apps/web/vite.config.ts --port 4180).
// Usage: node scripts/pavilion-measure-quick-match.mjs <policy: over|decision|match> <outdir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [policy = 'over', out = '.'] = process.argv.slice(2);
await (async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const log = { policy, clicks: 0, decisions: {}, prompts: [], timings: {}, notes: [] };
  const t0 = Date.now();
  const click = async (loc, label) => { await loc.click(); log.clicks++; log.prompts.push(label); };
  const shot = async (name) => page.screenshot({ path: `${out}/${policy}-${name}.png`, fullPage: false });
  await page.goto('http://127.0.0.1:4180/#title');
  await page.getByTestId('title-screen').waitFor();
  await shot('01-title');
  const titleButtons = await page.locator('[data-testid=title-screen] button, [data-testid=title-screen] a').allInnerTexts();
  log.titleChoices = titleButtons.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sq = page.getByTestId('sound-question');
  if (await sq.count()) await click(sq.getByRole('button', { name: 'Keep sound off' }), 'sound question');
  await click(page.getByRole('button', { name: /Quick match/ }), 'quick match');
  await page.getByTestId('scorestrip').waitFor({ timeout: 60000 });
  log.timings.toTossMs = Date.now() - t0;
  await shot('02-toss');
  const d = page.locator('#decision');
  const scrollH = await page.evaluate(() => globalThis.document.documentElement.scrollHeight);
  log.matchPageScrollHeightPx = scrollH;
  log.matchPageScreens = +(scrollH / 768).toFixed(1);
  log.matchPageRegions = await page.evaluate(() => [...globalThis.document.querySelectorAll('main section, main details')].length);
  log.matchPageButtons = await page.evaluate(() => [...globalThis.document.querySelectorAll('main button')].filter(b => b.offsetParent).length);
  await click(page.getByRole('button', { name: 'Call heads' }), 'toss call');
  await click(d.locator('.actions button[data-recommended="true"]'), 'bat/bowl');
  let firstBall = null, shots = 0, guard = 0, waits = 0;
  while (guard++ < 6000) {
    await page.waitForFunction(() => globalThis.document.querySelector('#decision')?.getAttribute('aria-busy') !== 'true', null, { timeout: 120000 });
    const phase = await d.getAttribute('data-phase');
    if (/COMPLETE|FINISHED|RESULT/.test(phase || '')) break;
    if (phase === 'AWAITING_BATTER' || phase === 'AWAITING_BOWLER') {
      if (!(await d.locator('button[data-candidate]:enabled').count())) { await page.waitForTimeout(250); continue; }
      log.decisions[phase] = (log.decisions[phase] || 0) + 1;
      const rec = d.locator('button[data-candidate][data-recommended="true"]:enabled');
      const target = (await rec.count()) ? rec.first() : d.locator('button[data-candidate]:enabled').first();
      await click(target, phase);
      continue;
    }
    const btnName = policy === 'over' ? 'Finish over' : policy === 'decision' ? 'Next decision' : 'Finish match';
    const btn = d.getByRole('button', { name: btnName, exact: true });
    if ((await btn.count()) && !(await btn.isEnabled()) && waits++ < 80) { await page.waitForTimeout(250); continue; }
    if (!(await btn.count()) || !(await btn.isEnabled())) {
      log.notes.push(`stopped at phase ${phase}: ${(await d.innerText()).slice(0, 300)}`);
      break;
    }
    if (!firstBall) { firstBall = Date.now() - t0; log.timings.toFirstBallMs = firstBall; log.clicksBeforeFirstBall = log.clicks; }
    waits = 0; await click(btn, btnName);
    if (shots < 2 && log.clicks > 12 + shots * 25) { await shot(`03-mid-${shots}`); shots++; }
  }
  log.timings.totalMs = Date.now() - t0;
  log.finalPhase = await d.getAttribute('data-phase');
  log.scorestrip = (await page.getByTestId('scorestrip').innerText()).replace(/\s+/g, ' ');
  await shot('04-end');
  await page.screenshot({ path: `${out}/${policy}-05-end-full.png`, fullPage: true });
  log.endPageScreens = +((await page.evaluate(() => globalThis.document.documentElement.scrollHeight)) / 768).toFixed(1);
  const counts = {}; for (const p of log.prompts) counts[p] = (counts[p] || 0) + 1; log.promptCounts = counts; delete log.prompts;
  fs.writeFileSync(`${out}/${policy}.json`, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
