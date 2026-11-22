#!/usr/bin/env node
// The reveal sweep after an analysis (app/src/lib/ui/sweep.ts): a WebGL band crosses the window and the workspace is uncovered behind
// it, and the workspace's parts rise in (app/src/lib/ui/entrance.ts). Checks that the band is drawn and the workspace is clipped while it
// runs, that both are gone afterwards (nothing stays hidden), that the parts rise and then sit still, that opening a saved teardown from
// the empty stage plays the same entrance, that swapping one open teardown for another rises without the band, and that
// prefers-reduced-motion skips all of it.
// Run through tests/run-app-tests.js (TT_APP_URL). The bench build sweeps only with window.__ttSweep = true, set here before load. TT_SWEEP_SHOTS=<dir> also saves screenshots mid-sweep and after.
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const URL = `${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`;
const SONG = path.join(ROOT, 'test-songs', 'pop127_Amaj.wav');
const SHOTS = process.env.TT_SWEEP_SHOTS;

(async () => {
  // SwiftShader gives headless Chromium a WebGL context, so the band really renders here.
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  // rising: the workspace parts with a running entrance animation (the Web Animations API leaves nothing in the DOM afterwards)
  const state = p => p.evaluate(() => ({ canvas: !!document.querySelector('canvas.tt-sweep'), clip: document.querySelector('#out')?.style.clipPath || '',
    rising: document.getAnimations().filter(a => a.id === 'tt-enter' && a.playState !== 'finished').length }));
  // How long until no part is still rising (ms), or null if one still is after 3 s. A rise waits for the page's next frame to start, so on
  // a busy machine it can finish later than its own length; what must never happen is a part that keeps moving (or stays hidden).
  const settled = async p => { const t = Date.now(); try {
    await p.waitForFunction(() => !document.getAnimations().some(a => a.id === 'tt-enter' && a.playState !== 'finished'), null, { timeout: 3000, polling: 50 });
    return Date.now() - t; } catch { return null; } };

  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: motion });
    await ctx.addInitScript(() => { window.__ttSweep = true; }); // the bench build sweeps only on request (see sweep.ts)
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL); await p.waitForTimeout(300);
    await p.setInputFiles('#file', SONG);
    await p.waitForFunction(() => !!document.querySelector('#out.has-result'), null, { timeout: 120000 });
    const samples = [];
    for (let i = 0; i < 6; i++) {
      samples.push(await state(p));
      if (SHOTS && motion === 'no-preference' && i === 2) await p.screenshot({ path: path.join(SHOTS, 'sweep-mid.png') });
      await p.waitForTimeout(120);
    }
    if (motion === 'no-preference') {
      check(samples.some(s => s.canvas), `the band is drawn while the analysis is revealed (${samples.filter(s => s.canvas).length}/6 samples)`);
      check(samples.some(s => /^inset\(0(px)? [1-9]/.test(s.clip)), 'the workspace is uncovered behind the band (clipped mid-sweep)');
      check(await p.locator('#out .workspace').count() === 1, 'the workspace is in the DOM during the sweep');
      check(samples.some(s => s.rising >= 4), `the workspace's parts rise in with it (${Math.max(...samples.map(s => s.rising))} parts animating at most)`);
    } else {
      check(samples.every(s => !s.canvas && !s.clip && !s.rising), 'prefers-reduced-motion: no band, no clipping, no rise');
    }
    await p.waitForTimeout(1800);
    const end = await state(p);
    check(!end.canvas && !end.clip, `${motion}: afterwards the band is removed and nothing is clipped${end.canvas || end.clip ? ` (band ${end.canvas}, clip "${end.clip}")` : ''}`);
    const rest = await settled(p);
    check(rest != null, `${motion}: and the parts come to rest (${rest == null ? 'still rising 3 s later' : rest ? rest + ' ms after that' : 'already'})`);
    if (SHOTS && motion === 'no-preference') await p.screenshot({ path: path.join(SHOTS, 'sweep-end.png') });

    if (motion === 'no-preference') {
      // Opening a saved teardown from the empty stage arrives the same way: band and rise.
      await p.reload(); await p.waitForTimeout(400);
      await p.click('#recent-btn'); await p.waitForTimeout(200);
      const open = p.locator('#hist .h-open').first();
      check(await open.count() > 0, 'the saved teardown is listed after a reload');
      if (await open.count()) {
        // Recorded as it happens, not sampled afterwards: on a slow runner the page can be busy right after the open, and the
        // entrance (compositor clock) can be over before a sample lands. The log says whether it played and for how long.
        await p.evaluate(() => {
          const log = window.__enter = { t0: performance.now(), bandIn: null, bandOut: null, rises: [] };
          new MutationObserver(ms => { for (const m of ms) {
            for (const n of m.addedNodes) if (n.classList?.contains('tt-sweep') && log.bandIn == null) log.bandIn = performance.now();
            for (const n of m.removedNodes) if (n.classList?.contains('tt-sweep') && log.bandOut == null) log.bandOut = performance.now();
          } }).observe(document.body, { childList: true });
          const animate = Element.prototype.animate;
          Element.prototype.animate = function (k, o) {
            const a = animate.call(this, k, o);
            if (o && o.id === 'tt-enter') {
              const r = { at: performance.now(), cancelled: null }; log.rises.push(r);
              a.addEventListener('cancel', () => { r.cancelled = performance.now(); });
            }
            return a;
          };
        });
        await open.click();
        await p.waitForFunction(() => !!document.querySelector('#out.has-result'), null, { timeout: 30000 });
        const seen = [];
        for (let i = 0; i < 5; i++) { seen.push(await state(p)); await p.waitForTimeout(100); }
        await p.waitForTimeout(1800);
        const log = await p.evaluate(() => window.__enter);
        const band = log.bandIn != null && log.bandOut != null ? Math.round(log.bandOut - log.bandIn) : null;
        const full = log.rises.filter(r => r.cancelled == null).length;
        check(band != null && band >= 600 && full >= 4,
          `opening a saved teardown from the empty stage sweeps and rises (band on screen ${band == null ? 'never' : band + ' ms'}, ${full} of ${log.rises.length} parts rose without being cut short; sampled: band in ${seen.filter(s => s.canvas).length}/5, up to ${Math.max(...seen.map(s => s.rising))} rising)`);
        // Swapping the open teardown for a saved one: the parts rise again, without the band.
        await p.click('#recent-btn'); await p.waitForTimeout(200); await p.locator('#hist .h-open').first().click();
        const swap = []; for (let i = 0; i < 4; i++) { swap.push(await state(p)); await p.waitForTimeout(80); }
        check(swap.every(s => !s.canvas && !s.clip) && swap.some(s => s.rising >= 4), `swapping one open teardown for another rises without the band (up to ${Math.max(...swap.map(s => s.rising))} parts rising)`);
        await p.waitForTimeout(900);
        const swapRest = await settled(p);
        check(swapRest != null, `after the swap the parts come to rest (${swapRest == null ? 'still rising 3 s later' : swapRest ? swapRest + ' ms after that' : 'already'})`);
      }
    }
    if (motion === 'no-preference') {
      // Without the opt-in the bench build does not sweep, so the benchmark and parity runs see no WebGL at all.
      const q = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await q.goto(URL); await q.waitForTimeout(300); await q.setInputFiles('#file', SONG);
      await q.waitForFunction(() => !!document.querySelector('#out.has-result'), null, { timeout: 120000 });
      const off = []; for (let i = 0; i < 4; i++) { off.push(await state(q)); await q.waitForTimeout(100); }
      check(off.every(s => !s.canvas && !s.clip && !s.rising), 'bench build without window.__ttSweep: no sweep and no rise');
      await q.context().close();
    }
    check(errs.length === 0, `${motion}: no page errors${errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''}`);
    await ctx.close();
  }
  await b.close();
  console.log(`Sweep tests: ${failed ? failed + ' failed' : 'all passed'}.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
