const path = require('path'), ROOTURL = 'file://' + path.resolve(__dirname, '..') + '/', SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const f of ['pop127_Amaj', 'pop127_pad300', 'pop127_pad1200']) {
    const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(400);
    await p.setInputFiles('#file', `${SONGS}${f}.wav`);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    const fd = await p.evaluate(() => window.__td && window.__td.firstDown);
    await p.locator('.tdtabs button:has-text("Build it")').click(); await p.waitForTimeout(300);
    const plan = await p.locator('#plan').innerText();
    let [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#plan button:has-text("Download the song as MIDI")').click()]); await dl.saveAs(`/tmp/${f}.zip`);
    [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#plan button:has-text("lined up to bar 1")').click()]); await dl.saveAs(`/tmp/${f}_ref.wav`);
    console.log(f, 'firstDown', fd, '| bar 2 mentioned:', /at bar 2\b/.test(plan), '| note:', await p.locator('#plan .row .small').filter({ hasText: 'Saved' }).first().innerText().catch(() => '-'));
    await p.close();
  }
  console.log('errors', errs); await b.close();
})();
