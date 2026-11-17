const path = require('path'), ROOTURL = 'file://' + path.resolve(__dirname, '..') + '/', SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const f of ['trap142_Fsmin', 'pop127_pad300']) {
    const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(400);
    await p.setInputFiles('#file', `${SONGS}${f}.wav`);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
    await p.locator('.tdtabs button:has-text("Build it")').click(); await p.waitForTimeout(300);
    await p.locator('#plan button:has-text("Show all")').click().catch(() => {});
    await p.evaluate(() => document.querySelectorAll('#plan .pstep').forEach(c => c.classList.remove('folded')));
    const txt = await p.locator('#plan').innerText();
    console.log('=====', f, '\n', txt.split('\n').filter(l => /^\d+\.|⚠|Draw|draw|MIDI:|song bars/.test(l)).join('\n').slice(0, 3500));
    console.log('previews', await p.locator('#plan .midiprev').count());
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#plan .midiprev button').first().click()]); console.log('dl', dl.suggestedFilename());
    await p.locator('#plan .midiprev').nth(3).screenshot({ path: `${OUT}prev_${f}.png` });
    await p.close();
  }
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close();
})();
