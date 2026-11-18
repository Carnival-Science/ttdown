// TimeMap built from the real analyzer's tracked grid, on the synthetic songs with known answers.
// Asserts: the map is measured, constant-tempo, tempo-accurate, beat- and bar-aligned with the truth files, and identical
// when built in the page (classic <script>, as index.html will load it) and in Node. No analysis behaviour is changed or tested here.
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const TM = require('../src/timemap'), { events } = require('./metrics');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs');
const truthFile = (f, k) => path.join(SONGS, 'truth', `${f}.${k}.txt`);
const readRows = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  for (const f of ['pop127_Amaj', 'pop127_pad300', 'pop127_pad1200', 'swing100_Dmin', 'trap142_Fsmin', 'house124_Cmin']) {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300);
    await p.addScriptTag({ path: path.join(ROOT, 'src/timemap.js') });
    await p.setInputFiles('#file', path.join(SONGS, `${f}.wav`));
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const A = await p.evaluate(() => ({ grid: window.__td.grid, duration: window.__td.duration, bpm: window.__td.bpm, firstDown: window.__td.firstDown, barSec: window.__td.barSec,
      inPage: (() => { const m = TimeMap.fromGrid(window.__td.grid, { duration: window.__td.duration, meter: { beatsPerBar: 4, status: 'assumed' } }); return { fp: m.fingerprint(), bpm: m.tempo().bpm }; })() }));
    const truth = readRows(truthFile(f, 'beats')), tb = truth.map(r => r[0]), td = truth.filter(r => r[1] === 1).map(r => r[0]);
    const trueBpm = 60 / ((tb[tb.length - 1] - tb[0]) / (tb.length - 1));

    const m = TM.fromGrid(A.grid, { duration: A.duration, meter: { beatsPerBar: 4, status: 'assumed' } });
    check(m.measured && m.hasBars && m.meter.status === 'assumed', `${f}: measured grid, bar layer present, meter honestly labelled "assumed"`);
    check(m.tempo().isConstant, `${f}: constant tempo recognised (max local deviation ${(m.tempo().maxDeviation * 100).toFixed(2)} %)`);
    const tErr = Math.abs(m.tempo().bpm - trueBpm) / trueBpm;
    check(tErr < 0.005, `${f}: tempo from tracked beats ${m.tempo().bpm.toFixed(2)} vs true ${trueBpm.toFixed(2)} (${(tErr * 100).toFixed(2)} %, limit 0.5 %)`);
    const bf = events(Array.from(m.t), tb).f;
    check(bf >= 0.98, `${f}: tracked beats vs truth F ${bf} (>= 0.98, ±70 ms)`);
    const a0 = m.barStart(0), nearestTrueDown = td.reduce((x, y) => Math.abs(y - a0) < Math.abs(x - a0) ? y : x);
    check(Math.abs(nearestTrueDown - a0) <= 0.07, `${f}: bar 1 anchor ${a0.toFixed(3)} s is within 70 ms of a true downbeat (${nearestTrueDown.toFixed(3)} s)`);
    const el = m.exportEligibility(); check(el.state === 'needs-confirmation' && el.needs.join() === 'downbeat,meter', `${f}: the analyzer's assumed 4/4 and tracked downbeat need confirmation before bar exports (${el.state}: ${el.needs.join(', ')})`);
    const ok = m.confirmMeter().confirmDownbeat().exportEligibility(), g = ok.exportGrid;
    check(ok.state === 'allowed' && g.maxDeviationMs <= 20, `${f}: once confirmed, export is allowed; the exported grid is within ${g.maxDeviationMs.toFixed(1)} ms (RMS ${g.rmsDeviationMs.toFixed(1)}) of every tracked beat, anchor shift ${g.interceptShiftMs.toFixed(1)} ms`);
    check(A.inPage.fp === m.fingerprint(), `${f}: same fingerprint when built in the page and in Node (${m.fingerprint()})`);
    // fallback built from the persisted fields only: what a saved result (no tracked grid) can offer
    const fb = TM.fromConstantGrid({ bpm: A.bpm, firstDownbeat: A.firstDown, duration: A.duration });
    check(!fb.measured && fb.position(10).source === 'fallback-grid', `${f}: the fixed-grid fallback is labelled and not measured`);
    await p.close();
  }
  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
