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
    check(!end.canvas && !end.clip && !end.rising, `${motion}: afterwards the band is removed, nothing is clipped and nothing is still moving`);
    if (SHOTS && motion === 'no-preference') await p.screenshot({ path: path.join(SHOTS, 'sweep-end.png') });

    if (motion === 'no-preference') {
      // Opening a saved teardown from the empty stage arrives the same way: band and rise.
      await p.reload(); await p.waitForTimeout(400);
      await p.click('#recent-btn'); await p.waitForTimeout(200);
      const open = p.locator('#hist .h-open').first();
      check(await open.count() > 0, 'the saved teardown is listed after a reload');
      if (await open.count()) {
        await open.click();
        await p.waitForFunction(() => !!document.querySelector('#out.has-result'), null, { timeout: 30000 });
        const seen = [];
        for (let i = 0; i < 5; i++) { seen.push(await state(p)); await p.waitForTimeout(100); }
        check(seen.some(s => s.canvas) && seen.some(s => s.rising >= 4), `opening a saved teardown from the empty stage sweeps and rises (band in ${seen.filter(s => s.canvas).length}/5 samples, up to ${Math.max(...seen.map(s => s.rising))} parts rising)`);
        await p.waitForTimeout(1800);
        // Swapping the open teardown for a saved one: the parts rise again, without the band.
        await p.click('#recent-btn'); await p.waitForTimeout(200); await p.locator('#hist .h-open').first().click();
        const swap = []; for (let i = 0; i < 4; i++) { swap.push(await state(p)); await p.waitForTimeout(80); }
        check(swap.every(s => !s.canvas && !s.clip) && swap.some(s => s.rising >= 4), `swapping one open teardown for another rises without the band (up to ${Math.max(...swap.map(s => s.rising))} parts rising)`);
        await p.waitForTimeout(900);
        check((await state(p)).rising === 0, 'after the swap nothing is still moving');
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
