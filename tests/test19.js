const path = require('path'), ROOTURL = process.env.TT_APP_URL || ('file://' + path.resolve(__dirname, '..') + '/'), SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } }); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(400);
  await p.setInputFiles('#file', `${SONGS}lead120_Amin.wav`);
  await p.waitForFunction(() => /ready/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  await p.click('#volbtn'); await p.locator('#vol-song').fill('30'); await p.locator('#vol-sounds').fill('20');
  console.log('audio vol', await p.evaluate(() => document.querySelector('audio').volume));
  await p.locator('.tdtabs button:has-text("Song map")').click(); await p.locator('button:has-text("Check by ear")').click(); await p.waitForTimeout(500);
  console.log('ctx gain', await p.evaluate(() => { const c = new AudioContext(); const v = c.destination.gain ? c.destination.gain.value : 'n/a'; c.close(); return v; }));
  await p.click('#vol-mute').catch(async () => { await p.click('#volbtn'); await p.click('#vol-mute'); });
  console.log('muted audio', await p.evaluate(() => document.querySelector('audio').volume), 'stored', await p.evaluate(() => localStorage.getItem('app_volume_v1')));
  await p.reload(); await p.waitForTimeout(400); await p.click('#volbtn');
  console.log('after reload sliders', await p.locator('#vol-song').inputValue(), await p.locator('#vol-sounds').inputValue(), await p.locator('#vol-mute').innerText());
  await p.screenshot({ path: 'vol.png', clip: { x: 600, y: 0, width: 600, height: 300 } });
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close();
})();
