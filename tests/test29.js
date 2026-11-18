// Phase 2c step 1 in the real page: the ruler, the metronome and "loop 4 bars from where I am" use the TimeMap grid.
// Expected values come from src/timemap.js run in Node on the analysis the page produced; the page uses its inlined copy,
// so agreement also proves the two are the same code. Fixtures need `npm run songs:time`.
const path = require('path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const TM = require('../src/timemap');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs'), FIX = path.join(SONGS, 'time-fixtures');

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const open = async () => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { // record what the metronome schedules
      window.__clicks = []; window.__src = null;
      const os = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (when) { window.__clicks.push({ when, freq: this.frequency.value }); return os.apply(this, arguments); };
      const bs = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (when, offset) { window.__src = { when, offset }; return bs.apply(this, arguments); };
    });
    await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300); return p;
  };
  const load = async (p, file, title) => { await p.setInputFiles('#file', file); await p.waitForFunction(t => document.querySelector('#status').textContent.includes('Teardown ready for “' + t + '”'), title, { timeout: 120000 }); };
  const analysis = p => p.evaluate(() => { const a = window.__td; return { duration: a.duration, bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, bpmConf: a.bpmConf, bpmFixed: a.bpmFixed, nBars: a.nBars, grid: a.grid || null }; });
  const ticks = p => p.evaluate(() => [...document.querySelectorAll('#out .barruler span')].map(s => ({ left: parseFloat(s.style.left), bar: +s.dataset.bar, cls: s.className })));
  const rulerMeta = p => p.evaluate(() => { const r = document.querySelector('#out .barruler'); return { grid: r.dataset.grid, title: r.title }; });
  const expectTicks = (a, G) => { const dur = a.duration, every = a.nBars > 96 ? 16 : a.nBars > 40 ? 8 : 4, out = []; for (let bar = 0, g = 0; g < 4000; bar += every, g++) { let t = G.barStart(bar); if (t > dur) break; if (t < -0.05) continue; t = Math.max(0, t); out.push({ left: +(100 * t / dur).toFixed(3), bar }); } return out; };
  const sameTicks = (got, exp) => got.length === exp.length && got.every((g, i) => g.bar === exp[i].bar && Math.abs(g.left - exp[i].left) <= 0.0011);

  // 1. drift_fast: the ruler follows the tracked beats, not the constant grid
  { const p = await open(); await load(p, path.join(FIX, 'drift_fast.wav'), 'drift_fast');
    const a = await analysis(p), G = TM.forAnalysis(a), meta = await rulerMeta(p), got = await ticks(p);
    check(G.kind === 'tracked' && meta.grid === 'tracked' && /tracked beats/.test(meta.title), `1: ruler is built from the tracked grid (${meta.grid}; "${meta.title}")`);
    check(sameTicks(got, expectTicks(a, G)), `1: ${got.length} bar ticks sit exactly where the tracked grid puts them`);
    const legacy = got.map(g => 100 * (a.firstDown + g.bar * a.barSec) / a.duration), worst = Math.max(...got.map((g, i) => Math.abs(g.left - legacy[i])));
    check(worst > 0.5, `1: they differ from the old constant-tempo ticks by up to ${(worst * a.duration / 100).toFixed(2)} s (${worst.toFixed(2)} % of the width)`);

    // 2. metronome: clicks on the tracked beats, downbeats accented
    await p.locator('.tdtabs button:has-text("Song map")').click(); await p.waitForTimeout(300);
    await p.locator('#out button:has-text("Play with beat clicks")').click(); await p.waitForTimeout(300);
    const m = await p.evaluate(() => ({ clicks: window.__clicks, src: window.__src }));
    const exp = G.beats(0, Math.min(a.duration, 240)), from = m.src.offset, t0 = m.src.when;
    const times = m.clicks.map(c => c.when - t0 + from);
    check(m.clicks.length === exp.length, `2: one click per tracked beat in the first 240 s (${m.clicks.length} of ${exp.length})`);
    check(exp.every((e, i) => Math.abs(times[i] - Math.max(from, e.t)) < 1e-6), '2: every click is on its tracked beat (to the microsecond)');
    check(exp.every((e, i) => (m.clicks[i].freq === 1800) === e.downbeat), '2: the accent (high click) is on every tracked downbeat and only there');
    const legacyBeat = 60 / a.bpm, off = Math.max(...exp.map((e, i) => Math.abs(times[i] - (a.firstDown + Math.round((times[i] - a.firstDown) / legacyBeat) * legacyBeat))));
    check(off > 0.1, `2: the old constant-tempo clicks would have been up to ${(off * 1000).toFixed(0)} ms off`);

    // 3. loop 4 bars from where I am
    await p.evaluate(() => { document.querySelector('#out audio').currentTime = 30; });
    await p.locator('#out select[aria-label="Loop part of the song"]').selectOption('here'); await p.waitForTimeout(150);
    const loop = await p.evaluate(() => window.__loop), bar = G.barOf(30);
    check(loop && Math.abs(loop[0] - G.barStart(bar)) < 1e-6 && Math.abs(loop[1] - G.barStart(bar + 4)) < 1e-6, `3: the 4-bar loop starts on the tracked bar line (${loop && loop.map(x => x.toFixed(3))}) and spans four tracked bars`);
    const oldStart = a.firstDown + Math.floor((30 - a.firstDown) / a.barSec) * a.barSec;
    check(Math.abs(loop[0] - oldStart) > 0.2, `3: the old loop would have started ${(Math.abs(loop[0] - oldStart) * 1000).toFixed(0)} ms from the real bar line`);

    // 4. opening the saved teardown: its tracked beats were saved with it, so the ruler is tracked and identical; an OLDER save (no timing) is the labelled fallback
    await load(p, path.join(SONGS, 'pop127_Amaj.wav'), 'pop127_Amaj');
    await p.locator('#hist button').nth(1).click(); await p.waitForTimeout(400);
    const s = await analysis(p), sm = await rulerMeta(p), st = await ticks(p);
    check(s.grid !== null && sm.grid === 'tracked' && sameTicks(st, got), `4: a saved teardown keeps its tracked beats, so reopened it has the same tracked ruler (${sm.grid}, ${st.length} ticks)`);
    await p.evaluate(() => { const k = 'teardown_history_v1', h = JSON.parse(localStorage.getItem(k)); h.forEach(x => delete x.timing); localStorage.setItem(k, JSON.stringify(h)); });
    await p.reload(); await p.waitForTimeout(400); await p.locator('#hist button').nth(1).click(); await p.waitForTimeout(400);
    const s0 = await analysis(p), sm0 = await rulerMeta(p), st0 = await ticks(p);
    check(s0.grid === null && sm0.grid === 'fallback-grid' && /constant tempo/.test(sm0.title), `4: an older save without timing gets the labelled fallback (${sm0.grid}; "${sm0.title}")`);
    const legacyTicks = []; { const every = s0.nBars > 96 ? 16 : s0.nBars > 40 ? 8 : 4; for (let bb = 0; bb <= s0.nBars; bb += every) { const t = s0.firstDown + bb * s0.barSec; if (t < -0.05 || t > s0.duration) continue; legacyTicks.push({ bar: bb, left: +(100 * Math.max(0, t) / s0.duration).toFixed(3) }); } }
    check(st0.length >= legacyTicks.length && legacyTicks.every(l => st0.some(g => g.bar === l.bar && Math.abs(g.left - l.left) <= 0.0011)), `4: and it draws the same ticks as before (${st0.length} ticks)`);
    await p.close(); }

  // 5. a BPM correction replaces the tracked grid (a stale grid must not override it)
  { const p = await open(); await load(p, path.join(SONGS, 'pop127_Amaj.wav'), 'pop127_Amaj');
    check((await rulerMeta(p)).grid === 'tracked', '5: before the correction the ruler is tracked');
    await p.locator('.tdtabs button:has-text("Overview")').click(); await p.locator('input[aria-label="Type the BPM"]').fill('63.5'); await p.locator('button:has-text("Set BPM")').click(); await p.waitForTimeout(500);
    const a = await analysis(p), meta = await rulerMeta(p), G = TM.forAnalysis(a), got = await ticks(p);
    check(meta.grid === 'fallback-grid' && G.reason === 'bpm-corrected-by-user' && sameTicks(got, expectTicks(a, G)), `5: after "Set BPM 63.5" the ruler uses the corrected tempo as a labelled fallback (${meta.grid}, ${got.length} ticks at the new bar length ${a.barSec}s)`);
    await p.close(); }

  // 6. tracked bar lines before the first tracked beat are drawn dashed (extrapolated); fully tracked ones are not
  { const p = await open(); await load(p, path.join(SONGS, 'swing100_Dmin.wav'), 'swing100_Dmin');
    const t1 = await ticks(p); check(t1.length > 0 && t1[0].cls.includes('ext') && !t1[t1.length - 1].cls.includes('ext'), `6: swing100 (the tracker misses the beat at 0:00): first bar line extrapolated, dashed (${t1[0].cls}); the rest not`);
    await p.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
