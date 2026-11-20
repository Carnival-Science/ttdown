// Ported from tests/test31.js for the v1 interface (no tabs, no example teardown). The assertions are the legacy ones; see docs/SVELTE_MIGRATION.md §14.
// Saved teardowns keep the tracker's beats (docs/PERSISTENCE.md): versioned, validated on read, never silent on storage failure, corrections recorded.
// Saved teardowns keep their tracked timing. In the real page, on the drifting arrangement fixture: save, reload the browser, reopen from
// history; older records; invalid timing; storage quota; tempo corrections. Needs `npm run songs:time`.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const TM = require('../src/timemap');
const ROOT = path.resolve(__dirname, '..'), ARR = path.join(ROOT, 'test-songs', 'arrangement-fixtures'), HK = 'teardown_history_v1';

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const ctx = await b.newContext(); // one context = one localStorage across the page reloads below
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file, title) => { await p.setInputFiles('#file', file); await p.waitForFunction(t => document.querySelector('#status').textContent.includes('Teardown ready for “' + t + '”'), title, { timeout: 120000 }); };
  const store = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), HK);
  const view = p => p.evaluate(() => { const a = window.__td; return { title: a.title, bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, bpmConf: a.bpmConf, duration: a.duration, hasGrid: !!a.grid, sections: a.sections.map(s => [s.label, s.startBar, s.bars, s.start, s.end]),
    ruler: document.querySelector('#out .barruler').dataset.grid, ticks: [...document.querySelectorAll('#out .barruler span')].map(s => [+s.dataset.bar, parseFloat(s.style.left)]), keys: Object.keys(a) }; });
  const openHist = async (p, text) => { await p.click("#recent-btn"); await p.locator('#hist .h-open', { hasText: text }).first().click(); await p.waitForTimeout(400); };

  // 1. save, reload the whole browser page, reopen: everything is consistent with the live analysis
  let live, p = await open();
  await analyse(p, path.join(ARR, 'arrangement_drift.wav'), 'arrangement_drift'); live = await view(p);
  const saved = (await store(p))[0];
  check(saved.timing && saved.timing.v === 1 && saved.timing.beats.length === live.sections.length * 0 + saved.timing.beats.length && saved.timing.beats.length > 100, `1: the saved record carries versioned timing (${saved.timing && saved.timing.beats.length} beats, ${saved.timing && saved.timing.downbeats.length} downbeats, schema v${saved.timing && saved.timing.v})`);
  check(!JSON.stringify(saved).includes('__buf') && !('grid' in saved) && !('buffer' in saved) && JSON.stringify(saved).length < 40000, `1: no decoded audio or runtime objects in storage (${JSON.stringify(saved).length} bytes)`);
  await p.close(); p = await open();
  await openHist(p, 'arrangement_drift'); const re = await view(p);
  check(re.hasGrid && re.ruler === 'tracked', `1: after a browser reload the reopened teardown has its tracked grid again (ruler: ${re.ruler})`);
  check(JSON.stringify(re.sections) === JSON.stringify(live.sections), '1: section boundaries are identical to the live analysis');
  check(JSON.stringify(re.ticks) === JSON.stringify(live.ticks), `1: the ruler's ${re.ticks.length} bar ticks are identical to the live analysis`);
  const rec = await p.evaluate(() => { const a = window.__td; return { duration: a.duration, bpm: a.bpm, barSec: a.barSec, firstDown: a.firstDown, bpmConf: a.bpmConf, grid: a.grid }; });
  const G = TM.forAnalysis(rec);
  check(G.kind === 'tracked' && re.sections.slice(1).every(s => Math.abs(s[3] - G.barStart(s[1])) < 0.006), '1: every section starts on the TimeMap bar line for its bar (page and TimeMap agree)');
  check(re.keys.includes('timing') && !re.keys.includes('grid'), '1: the grid is attached non-enumerably, the saved `timing` stays the persisted form');
  const hist0 = await store(p); await p.click("#recent-btn"); await p.locator('#hist .h-open', { hasText: 'arrangement_drift' }).first().click(); const hist1 = await store(p);
  check(JSON.stringify(hist0) === JSON.stringify(hist1), '1: opening a record does not rewrite storage');

  // 2. an older record (saved before timing existed) stays readable and uses the labelled fallback
  await p.evaluate(k => { const h = JSON.parse(localStorage.getItem(k)); const o = JSON.parse(JSON.stringify(h[0])); delete o.timing; o.title = 'older save'; o.sections.forEach(s => delete s.timing); h.push(o); localStorage.setItem(k, JSON.stringify(h)); }, HK);
  await p.reload(); await p.waitForTimeout(400); await openHist(p, 'older save'); const old = await view(p);
  check(!old.hasGrid && old.ruler === 'fallback-grid', `2: an older record opens with the labelled constant-tempo fallback (${old.ruler})`);
  const legacyStart = old.sections.map(s => +Math.max(0, old.firstDown + s[1] * old.barSec).toFixed(2));
  check(JSON.stringify(old.sections.map(s => s[3])) === JSON.stringify(legacyStart), '2: and its section times are exactly the legacy firstDown + bar * barSec');

  // 3. invalid timing: no crash, labelled fallback, the record is left untouched in storage
  const variants = { 'unsorted beats': t => { t.beats[10] = t.beats[4]; }, 'NaN-like beats': t => { t.beats[3] = 'x'; }, 'wrong version type': t => { t.v = 'one'; }, 'downbeat that is no beat': t => { t.downbeats[2] += 0.5; }, 'newer version': t => { t.v = 99; } };
  for (const [name, mutate] of Object.entries(variants)) {
    await p.evaluate(([k, nm, fn]) => { const h = JSON.parse(localStorage.getItem(k)); const o = JSON.parse(JSON.stringify(h[0])); o.title = 'bad: ' + nm; new Function('t', fn)(o.timing); h.push(o); localStorage.setItem(k, JSON.stringify(h)); }, [HK, name, `(${mutate.toString()})(t)`]);
  }
  const before = await p.evaluate(k => localStorage.getItem(k), HK); await p.reload(); await p.waitForTimeout(400);
  for (const name of Object.keys(variants)) { await openHist(p, 'bad: ' + name); const v = await view(p); check(!v.hasGrid && v.ruler === 'fallback-grid' && v.ticks.length > 3, `3: "${name}": opens, falls back and labels it (${v.ruler})`); }
  check(before === await p.evaluate(k => localStorage.getItem(k), HK), '3: the unreadable records were left byte-for-byte as they were');
  await p.close();

  // 4. storage quota: never silent, and never at the expense of earlier saved teardowns
  { const q = await (await b.newContext()).newPage(); q.on('pageerror', e => errs.push(String(e))); await q.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await q.waitForTimeout(300); // its own empty storage
    await q.evaluate(() => { window.__limit = Infinity; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(v).length > window.__limit) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); }; });
    await analyse(q, path.join(ARR, 'arrangement_constant.wav'), 'arrangement_constant'); const first = await store(q);
    const sz = JSON.stringify(first).length, lean = JSON.stringify(Object.assign({}, first[0], { timing: undefined })).length, beatsBytes = JSON.stringify(first[0].timing).length;
    // size the limit from the SECOND record itself (measured in a throwaway page with unlimited storage), so it does not depend on the two tracks' notes being equally many
    const q2 = await (await b.newContext()).newPage(); await q2.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await q2.waitForTimeout(300);
    await analyse(q2, path.join(ARR, 'arrangement_drift.wav'), 'arrangement_drift'); const second = (await store(q2))[0], lean2 = JSON.stringify(Object.assign({}, second, { timing: undefined })).length, beats2 = JSON.stringify(second.timing).length; await q2.close();
    await q.evaluate(l => { window.__limit = l; }, sz + lean2 + Math.round(beats2 / 3)); // room for the new record without its beats, not with them
    await analyse(q, path.join(ARR, 'arrangement_drift.wav'), 'arrangement_drift'); await q.waitForTimeout(300);
    const after = await store(q), note = await q.locator('.tst-title').last().innerText(), latest = after[0];
    check(latest.title === 'arrangement_drift' && latest.timing === undefined && after.length === 2, `4: when the browser is nearly full the new teardown is saved WITHOUT its beats (${after.length} records)`);
    check(/without its tracked beats/.test(note) && /constant-tempo/.test(note), `4: and the user is told: "${note}"`);
    check(JSON.stringify(after[1]) === JSON.stringify(first[0]), '4: the earlier saved teardown is untouched, beats included');
    await q.evaluate(() => { window.__limit = 10; }); const beforeFail = await q.evaluate(k => localStorage.getItem(k), HK);
    await analyse(q, path.join(ARR, 'arrangement_constant.wav'), 'arrangement_constant');
    // the newest toast is the one read below: wait until it is no longer the previous one (the save runs after the teardown is shown)
    await q.waitForFunction(prev => { const t = [...document.querySelectorAll('.tst-title')].pop(); return !!t && t.textContent !== prev; }, note, { timeout: 10000 }).catch(() => {});
    const noteFail = await q.locator('.tst-title').last().innerText(), isErr = await q.locator('.tst[data-type="error"]').count() === 1;
    check(/Couldn't save this teardown/.test(noteFail) && /not changed/.test(noteFail) && isErr, `4: when nothing fits, it says so: "${noteFail}"`);
    check(beforeFail === await q.evaluate(k => localStorage.getItem(k), HK), '4: and nothing already saved was changed');
    await q.close(); }

  // 5. tempo correction: sections and ruler stay consistent, the correction is recorded, the measurement survives, the choice survives a reload
  { const r = await open(); await analyse(r, path.join(ARR, 'arrangement_drift.wav'), 'arrangement_drift');
    await r.reload(); await r.waitForTimeout(400); await openHist(r, 'arrangement_drift'); // no audio here: a corrected tempo cannot be analysed again, so it invalidates (with the audio it re-runs the analysis, see app-corrections)
    const was = (await view(r)).sections.map(s => s[3]);
    await r.locator('input[aria-label="Type the BPM"]').fill('63.5'); await r.locator('button:has-text("Set BPM")').click(); await r.waitForTimeout(600);
    const v = await view(r);
    const expectStart = v.sections.map(s => +Math.max(0, v.firstDown + s[1] * v.barSec).toFixed(2));
    check(v.ruler === 'fallback-grid' && JSON.stringify(v.sections.map(s => s[3])) === JSON.stringify(expectStart) && JSON.stringify(v.sections.map(s => s[3])) !== JSON.stringify(was), `5: after the correction the section times are recomputed from the corrected bars (${v.sections.map(s => s[3]).join(', ')}) and the ruler is the labelled fallback`);
    const rr = (await store(r))[0];
    check(rr.bpm === 63.5 && rr.bpmFixed === true && rr.timingCorrections.length === 1 && rr.timingCorrections[0].source === 'user' && rr.timingCorrections[0].type === 'bpm' && rr.timingCorrections[0].to === 63.5, `5: the correction is recorded as a user correction (${JSON.stringify(rr.timingCorrections)})`);
    check(rr.timing && rr.timing.basis.bpm === live.bpm && rr.timing.beats.length > 100 && rr.sections.every(s => s.timing === undefined), `5: the original measurement is kept (tracker tempo ${rr.timing.basis.bpm}, ${rr.timing.beats.length} beats) and no section claims tracked times`);
    await r.reload(); await r.waitForTimeout(400); await openHist(r, 'arrangement_drift'); const v2 = await view(r);
    check(v2.hasGrid && v2.ruler === 'fallback-grid' && JSON.stringify(v2.sections) === JSON.stringify(v.sections), '5: after a reload the corrected tempo still wins over the restored grid, with identical sections');
    await r.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
