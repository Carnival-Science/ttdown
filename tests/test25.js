// Stale analysis jobs: an older upload must never overwrite a newer one's state (teardown, buffer, status, history).
// Scenarios: (1) two uploads in quick succession, (2) a failing upload followed by a good one, (3) opening a saved
// teardown while an upload is still being analysed. Asserts what the page ends up showing, not just "no errors".
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const open = async () => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`file://${ROOT}/index.html#teardown`); await p.waitForTimeout(300);
    // record every teardown the page renders and every status text it shows
    await p.evaluate(() => {
      window.__log = { td: [], status: [] }; let v; Object.defineProperty(window, '__td', { configurable: true, get: () => v, set: x => { v = x; window.__log.td.push(x && x.title); } });
      new MutationObserver(() => window.__log.status.push(document.querySelector('#status').textContent)).observe(document.querySelector('#status'), { childList: true, characterData: true, subtree: true });
    });
    return p;
  };
  const ready = (p, title) => p.waitForFunction(t => document.querySelector('#status').textContent.includes('Teardown ready for “' + t + '”'), title, { timeout: 120000 });

  // 1. A (slower, 128 s) is started, then B (70 s) 150 ms later. B is the newer upload and must be what remains.
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await p.waitForTimeout(150);
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav'));
    await ready(p, 'pop127_Amaj'); await p.waitForTimeout(6000); // long enough for the superseded upload to finish if it is going to
    const s = await p.evaluate(() => ({ log: window.__log.td, title: window.__td.title, dur: window.__td.__buf && window.__td.__buf.duration, status: document.querySelector('#status').textContent,
      hist: [...document.querySelectorAll('#hist button')].map(x => x.textContent), ready: window.__log.status.filter(t => /Teardown ready/.test(t)) }));
    check(JSON.stringify(s.log) === JSON.stringify(['pop127_Amaj']), `1: only the newer upload was rendered (rendered: ${JSON.stringify(s.log)})`);
    check(s.title === 'pop127_Amaj' && Math.abs(s.dur - 70) < 1, `1: teardown and its audio buffer belong to the same, newer file (title ${s.title}, buffer ${s.dur && s.dur.toFixed(1)} s)`);
    check(s.hist.length === 1 && /^pop127_Amaj/.test(s.hist[0]), `1: only the newer upload was saved to history (${JSON.stringify(s.hist)})`);
    check(s.ready.length === 1 && /pop127_Amaj/.test(s.status), `1: status ends on the newer upload (${s.status})`);
    await p.close(); }

  // 2. A file whose decode fails late, then a good one. The old failure must not replace the new job's status.
  { const bad = path.join(OUT, 'not-audio.mp3'); fs.writeFileSync(bad, Buffer.from('this is not audio '.repeat(500)));
    const p = await open();
    // make the bad file's decode failure arrive late (800 ms), i.e. after the newer upload has started, so the order is deterministic
    await p.evaluate(() => { const d = OfflineAudioContext.prototype.decodeAudioData; OfflineAudioContext.prototype.decodeAudioData = function (raw, ...r) { return raw.byteLength === 9000 ? new Promise((res, rej) => setTimeout(() => d.call(this, raw, ...r).then(res, rej), 800)) : d.call(this, raw, ...r); }; });
    await p.setInputFiles('#file', bad); await p.waitForTimeout(100);
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav'));
    await ready(p, 'pop127_Amaj'); await p.waitForTimeout(5000);
    const s = await p.evaluate(() => ({ log: window.__log.td, status: document.querySelector('#status').textContent, cls: document.querySelector('#status').className, all: window.__log.status }));
    const errShown = s.all.filter(t => /Couldn't read/.test(t)).length;
    check(JSON.stringify(s.log) === JSON.stringify(['pop127_Amaj']), `2: only the newest upload was rendered (rendered: ${JSON.stringify(s.log)})`);
    check(errShown === 0 && !/err/.test(s.cls), `2: a superseded upload's decode error was never shown (error messages shown: ${errShown})`);
    await p.close(); }

  // 3. Open a saved teardown while an upload is in flight: the saved teardown stays; the late upload is dropped.
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav')); await ready(p, 'pop127_Amaj');
    await p.evaluate(() => { window.__log.td.length = 0; window.__log.status.length = 0; });
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await p.waitForTimeout(200);
    await p.locator('#hist button').first().click();
    await p.waitForTimeout(6000);
    const s = await p.evaluate(() => ({ log: window.__log.td, status: document.querySelector('#status').textContent, hist: [...document.querySelectorAll('#hist button')].map(x => x.textContent) }));
    check(s.log.length === 1 && s.log[0] === 'pop127_Amaj', `3: the saved teardown the user opened is what remains (rendered: ${JSON.stringify(s.log)})`);
    check(/stopped/.test(s.status), `3: the user is told the in-progress analysis was stopped (${s.status})`);
    check(s.hist.length === 1, `3: the dropped upload was not saved (${s.hist.length} history item)`);
    await p.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
