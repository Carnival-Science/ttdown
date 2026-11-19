// Object-URL ownership: the teardown on screen owns exactly one audio URL; a failed, cancelled or superseded upload must not
// revoke it, must not leak its own, and replacing or leaving the teardown releases the old one.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SONGS = path.join(ROOT, 'test-songs'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const errs = []; let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const open = async () => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(String(e)));
    // track every blob URL made for an uploaded File (downloads use Blobs and have their own timed revoke)
    await p.addInitScript(() => {
      const c = URL.createObjectURL.bind(URL), r = URL.revokeObjectURL.bind(URL); window.__live = new Set(); window.__made = 0;
      URL.createObjectURL = o => { const u = c(o); if (o instanceof File) { window.__live.add(u); window.__made++; } return u; };
      URL.revokeObjectURL = u => { window.__live.delete(u); return r(u); };
    });
    await p.goto(`${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`); await p.waitForTimeout(300);
    return p;
  };
  const ready = (p, t) => p.waitForFunction(x => document.querySelector('#status').textContent.includes('Teardown ready for “' + x + '”'), t, { timeout: 120000 });
  const playerSrc = p => p.evaluate(() => { const a = document.querySelector('#out audio'); return a ? a.src : null; });
  const alive = (p, url) => p.evaluate(async u => { try { return (await fetch(u)).ok; } catch (e) { return false; } }, url);
  const live = p => p.evaluate(() => window.__live.size);
  const settle = p => p.waitForTimeout(3000);

  // 1. A cancelled upload leaves the teardown on screen with working audio, and its own URL is released
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav')); await ready(p, 'pop127_Amaj');
    const a = await playerSrc(p); check(!!a && await alive(p, a) && await live(p) === 1, `1: the teardown has a working audio URL, 1 live URL`);
    await p.evaluate(() => { const st = document.querySelector('#status'); const mo = new MutationObserver(() => { if (/Finding the tempo/.test(st.textContent)) { mo.disconnect(); document.querySelector('#cancel').click(); } }); mo.observe(st, { childList: true, characterData: true, subtree: true }); });
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await p.waitForFunction(() => /cancelled/i.test(document.querySelector('#status').textContent)); await settle(p);
    check(await playerSrc(p) === a && await alive(p, a), `1: after a cancelled upload the player still points at the same, still-valid URL`);
    check(await live(p) === 1, `1: the cancelled upload's URL was released (${await live(p)} live)`);
    await p.close(); }

  // 2. A file that fails to decode
  { const bad = path.join(OUT, 'not-audio.mp3'); fs.writeFileSync(bad, Buffer.from('this is not audio '.repeat(500)));
    const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav')); await ready(p, 'pop127_Amaj'); const a = await playerSrc(p);
    await p.setInputFiles('#file', bad); await p.waitForFunction(() => /Couldn't read/.test(document.querySelector('#status').textContent)); await settle(p);
    check(await playerSrc(p) === a && await alive(p, a) && await live(p) === 1, `2: a failed upload leaves the previous audio valid and leaks nothing (${await live(p)} live)`);
    await p.close(); }

  // 3. A superseded upload
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'sections120.mp3')); await p.waitForTimeout(150);
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav')); await ready(p, 'pop127_Amaj'); await settle(p);
    check(await live(p) === 1 && await alive(p, await playerSrc(p)), `3: after a superseded upload exactly one URL is live and it plays (${await live(p)} live of ${await p.evaluate(() => window.__made)} made)`);
    await p.close(); }

  // 4. A successful replacement releases the old URL
  { const p = await open();
    await p.setInputFiles('#file', path.join(SONGS, 'pop127_Amaj.wav')); await ready(p, 'pop127_Amaj'); const a = await playerSrc(p);
    await p.setInputFiles('#file', path.join(SONGS, 'house124_Cmin.wav')); await ready(p, 'house124_Cmin'); const b2 = await playerSrc(p);
    check(a !== b2 && !(await alive(p, a)) && await alive(p, b2) && await live(p) === 1, `4: the replaced teardown's URL was revoked, the new one is valid (${await live(p)} live)`);
    // 5. Opening a saved teardown releases the audio URL (saved teardowns carry no audio)
    if (await p.locator('#recent-btn').count()) await p.click('#recent-btn'); await p.locator('#hist button').nth(1).click(); await p.waitForTimeout(300);
    check(await live(p) === 0 && !(await alive(p, b2)) && await playerSrc(p) === null, `5: opening a saved teardown releases the audio URL and shows no stale player (${await live(p)} live)`);
    await p.close(); }

  // 6. No growth across many uploads
  { const p = await open();
    for (const f of ['pop127_Amaj', 'house124_Cmin', 'swing100_Dmin', 'trap142_Fsmin']) { await p.setInputFiles('#file', path.join(SONGS, f + '.wav')); await ready(p, f); }
    // the pre-decode duration probe makes (and revokes) a short-lived URL per file, so made = 2 per upload; only live ones matter
    check(await live(p) === 1 && await p.evaluate(() => window.__made) >= 4, `6: after 4 sequential uploads 1 URL is live (made ${await p.evaluate(() => window.__made)}, all but one revoked)`);
    await p.close(); }

  console.log('errors', errs); if (errs.length || failed) process.exitCode = 1; await b.close();
})();
