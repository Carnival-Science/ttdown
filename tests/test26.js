// Cancellation: the Cancel control and Esc stop an analysis for real (no further checkpoints are reached), leave the
// previous teardown and history untouched, and a superseded upload is stopped instead of running to completion.
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs');

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const open = async () => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300);
    await p.evaluate(() => { window.__log = { td: [], status: [] }; let v = window.__td; Object.defineProperty(window, '__td', { configurable: true, get: () => v, set: x => { v = x; window.__log.td.push(x && x.title); } });
      new MutationObserver(() => window.__log.status.push(document.querySelector('#status').textContent)).observe(document.querySelector('#status'), { childList: true, characterData: true, subtree: true }); });
    return p;
  };
  const started = p => p.waitForFunction(() => /Finding the tempo/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  const stats = p => p.evaluate(() => ({ ...window.__analysisStats }));
  // run `action` inside the page the moment analysis reports it has started, so the cancel lands early and deterministically
  // (a full analysis of this file reaches 10 checkpoints; a cancel made at the start must stop well short of that)
  const onStart = (p, action) => p.evaluate(a => { const st = document.querySelector('#status'); const mo = new MutationObserver(() => { if (/Finding the tempo/.test(st.textContent)) { mo.disconnect(); new Function(a)(); } }); mo.observe(st, { childList: true, characterData: true, subtree: true }); }, action);
  const cancelled = p => p.waitForFunction(() => /cancelled/i.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  const FULL = 10;
  const settle = async p => { const a = await stats(p); await p.waitForTimeout(3500); const z = await stats(p); return { before: a, after: z }; };

  // 1. Cancel button
  { const p = await open();
    check(await p.locator('#cancel').isHidden(), '1: the Cancel control is hidden while idle');
    await onStart(p, "window.__sawCancelVisible = !document.querySelector('#cancel').hidden; document.querySelector('#cancel').click()");
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await cancelled(p); await p.waitForTimeout(150);
    check(await p.evaluate(() => window.__sawCancelVisible), '1: the Cancel control was shown while analysing');
    const s = await settle(p), t = await p.evaluate(() => ({ td: window.__log.td, status: document.querySelector('#status').textContent, ready: window.__log.status.some(x => /Teardown ready/.test(x)) }));
    check(/cancelled/i.test(t.status) && !t.ready, `1: status says cancelled and no teardown was produced (${t.status})`);
    check(t.td.length === 0, `1: nothing was rendered (${JSON.stringify(t.td)})`);
    check(s.after.checkpoints === s.before.checkpoints && s.after.checkpoints < FULL && s.after.aborted === 1, `1: the analysis really stopped early: ${s.after.checkpoints} of ${FULL} checkpoints reached, none added over 3.5 s, aborted ${s.after.aborted}`);
    check(await p.locator('#cancel').isHidden(), '1: the Cancel control is hidden again');
    await p.close(); }

  // 2. Esc key
  { const p = await open();
    await onStart(p, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await cancelled(p); await p.waitForTimeout(150);
    const s = await settle(p), t = await p.evaluate(() => document.querySelector('#status').textContent);
    check(/cancelled/i.test(t) && s.after.checkpoints === s.before.checkpoints && s.after.checkpoints < FULL && s.after.aborted === 1, `2: Esc cancels and stops the analysis (${t}; aborted ${s.after.aborted})`);
    await p.close(); }

  // 3. Cancelling leaves the previous teardown and history alone
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav'));
    await p.waitForFunction(() => /Teardown ready for “pop127_Amaj”/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const bpm0 = await p.evaluate(() => window.__td.bpm);
    await onStart(p, "document.querySelector('#cancel').click()");
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await cancelled(p); await settle(p);
    const t = await p.evaluate(() => ({ title: window.__td.title, bpm: window.__td.bpm, hist: [...document.querySelectorAll('#hist button')].map(x => x.textContent), h2: document.querySelector('#out h2') && document.querySelector('#out h2').textContent }));
    check(t.title === 'pop127_Amaj' && t.bpm === bpm0 && t.hist.length === 1, `3: the previous teardown is still on screen and the only one in history (${t.title}, ${t.hist.length} saved)`);
    await p.close(); }

  // 4. A superseded upload is stopped, not run to completion
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await started(p);
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav'));
    await p.waitForFunction(() => /Teardown ready for “pop127_Amaj”/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const s = await settle(p), t = await p.evaluate(() => window.__log.td);
    check(s.after.aborted === 1 && s.after.checkpoints === s.before.checkpoints && s.after.checkpoints < 2 * FULL, `4: the older upload was aborted before finishing (aborted ${s.after.aborted}; ${s.after.checkpoints} checkpoints in total, a full run of both would be ${2 * FULL}) and nothing kept running`);
    check(JSON.stringify(t) === JSON.stringify(['pop127_Amaj']), `4: only the newer upload was rendered (${JSON.stringify(t)})`);
    await p.close(); }

  // 5. Normal analysis still works and does not leave the Cancel control showing
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'house124_Cmin.wav'));
    await p.waitForFunction(() => /Teardown ready/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const s = await stats(p);
    check(await p.locator('#cancel').isHidden() && s.aborted === 0, `5: uncancelled analysis completes with the control hidden (aborted ${s.aborted}, checkpoints ${s.checkpoints})`);
    await p.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
