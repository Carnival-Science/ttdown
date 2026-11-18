// Ported from tests/test30.js for the v1 interface (no tabs, no example teardown). The assertions are the legacy ones; see docs/SVELTE_MIGRATION.md §14.
// Section times sit on the tracked bar lines, timeline segments carry them, a section loop plays exactly that span, and saved teardowns keep them.
// Phase 2c step 2 in the real page: section times come from TimeMap's tracked bars, so the arrangement timeline, the section table, the
// section loops and the ruler agree; a saved teardown keeps them; an old saved teardown (no `timing`) is recomputed as before.
// Needs `npm run songs:time` (arrangement fixtures).
const path = require('path');
const { chromium } = require('playwright');
const TM = require('../src/timemap');
const ROOT = path.resolve(__dirname, '..'), ARR = path.join(ROOT, 'test-songs', 'arrangement-fixtures');
const fs = require('fs');
const truth = fs.readFileSync(path.join(ARR, 'truth', 'arrangement_drift.sections.lab'), 'utf8').trim().split('\n').map(l => +l.split('\t')[0]);

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300);
  await p.setInputFiles('#file', path.join(ARR, 'arrangement_drift.wav'));
  await p.waitForFunction(() => /Teardown ready for “arrangement_drift”/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  const a = await p.evaluate(() => { const x = window.__td; return { duration: x.duration, bpm: x.bpm, barSec: x.barSec, firstDown: x.firstDown, bpmConf: x.bpmConf, grid: x.grid, sections: x.sections }; });
  const G = TM.forAnalysis(a);
  // 1. every section starts on its tracked bar line (the same line the ruler draws for that bar number)
  check(a.sections.every(s => s.timing === 'tracked' && Math.abs(s.start - Math.max(0, G.barStart(s.startBar))) < 0.006), `1: ${a.sections.length} sections start on their tracked bar lines: ${a.sections.map(s => s.label + ' bar ' + (s.startBar + 1) + ' @ ' + s.start).join(', ')}`);
  const ticks = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#out .barruler span')].map(s => [s.dataset.bar, parseFloat(s.style.left)])));
  const onTicks = a.sections.filter(s => ticks[s.startBar] != null);
  check(onTicks.length >= 2 && onTicks.every(s => Math.abs(ticks[s.startBar] - 100 * s.start / a.duration) < 0.01), `1: where the ruler labels a section's first bar, the tick and the section start coincide (${onTicks.length} checked)`);
  // 2. and therefore on the true boundaries of this drifting fixture (the old firstDown + bar * barSec missed them by up to 1.3 s)
  const inner = a.sections.slice(1).map(s => s.start), worst = Math.max(...inner.map(t => Math.min(...truth.slice(1).map(r => Math.abs(r - t)))));
  const old = Math.max(...a.sections.slice(1).map(s => Math.min(...truth.slice(1).map(r => Math.abs(r - (a.firstDown + s.startBar * a.barSec))))));
  check(worst < 0.05 && old > 0.5, `2: section boundaries are within ${(worst * 1000).toFixed(0)} ms of the true ones (old grid: ${(old * 1000).toFixed(0)} ms)`);
  // 3. timeline segments and the section table show those times; a section loop plays exactly that span
  const segTitles = await p.evaluate(() => [...document.querySelectorAll('#out .seg')].map(x => x.title));
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  check(segTitles.length === a.sections.length && a.sections.every((s, i) => segTitles[i].includes(`starts ${fmtT(s.start)}`)), `3: timeline segments carry the tracked start times (${segTitles.map(t => t.replace(/^.*starts /, '').replace(')', '')).join(', ')})`);
  const i = 2; await p.locator('#out select[aria-label="Loop part of the song"]').selectOption(String(i)); await p.waitForTimeout(200);
  const loop = await p.evaluate(() => window.__loop), s2 = a.sections[i];
  check(loop && Math.abs(loop[0] - s2.start) < 1e-6 && Math.abs(loop[1] - Math.min(a.duration - 0.05, s2.end)) < 1e-6, `3: looping "${s2.label}" plays ${loop && loop.map(x => x.toFixed(2)).join('–')} s, the tracked span`);
  // 4. a saved teardown keeps its tracked beats AND its tracked section times, so they still agree after reopening
  await p.setInputFiles('#file', path.join(ROOT, 'test-songs', 'pop127_Amaj.wav'));
  await p.waitForFunction(() => /Teardown ready for “pop127_Amaj”/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  await p.locator('#hist button').nth(1).click(); await p.waitForTimeout(400);
  const saved = await p.evaluate(() => ({ grid: window.__td.grid || null, sections: window.__td.sections }));
  check(saved.grid !== null && saved.sections.every((s, k) => s.timing === 'tracked' && s.start === a.sections[k].start), `4: reopened from history it has its tracked grid back and its sections keep their tracked times (${saved.sections.map(s => s.start).join(', ')})`);
  // 5. an old saved teardown (no "timing") is still recomputed from firstDown, exactly as before
  const legacy = await p.evaluate(() => { const x = JSON.parse(JSON.stringify(window.__td)); x.sections.forEach(s => { delete s.timing; s.start = 999; }); return x; });
  const fd = legacy.firstDown, bs = legacy.barSec, expected = legacy.sections.map(s => +Math.max(0, fd + s.startBar * bs).toFixed(2));
  await p.evaluate(x => { const k = Object.keys(localStorage).find(k => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) && v[0] && v[0].sections; } catch (e) { return false; } }); const h = JSON.parse(localStorage.getItem(k)); h.unshift(Object.assign(x, { title: 'legacy save' })); localStorage.setItem(k, JSON.stringify(h)); }, legacy);
  await p.reload(); await p.waitForTimeout(500);
  await p.locator('#hist button', { hasText: 'legacy save' }).first().click(); await p.waitForTimeout(400);
  const rec = await p.evaluate(() => window.__td.sections.map(s => s.start));
  check(JSON.stringify(rec) === JSON.stringify(expected), `5: an old save without "timing" is recomputed from firstDown as before (${rec.join(', ')})`);
  await p.close();
  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
