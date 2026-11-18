const path = require('path'), ROOTURL = process.env.TT_APP_URL || ('file://' + path.resolve(__dirname, '..') + '/'), SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 950 } }); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(400);
  await p.setInputFiles('#file', `${SONGS}sections120.mp3`);
  await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  const tab = await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => /Chords/.test(x.textContent)); const s = h.closest('section'); return s.dataset.group || s.closest('[data-group]')?.dataset.group; });
  console.log('group', tab);
  const btns = await p.locator('.tdtabs button').allInnerTexts(); console.log(btns);
  for (const t of btns) { await p.locator('.tdtabs button', { hasText: t }).first().click(); await p.waitForTimeout(150); if (await p.locator('section:has(h2:has-text("Chords"))').isVisible()) { console.log('in tab', t); break; } }
  const sec = p.locator('section:has(h2:has-text("Chords"))');
  await sec.screenshot({ path: OUT + 'chords.png' });
  await sec.locator('.chcell:not(.none)').first().click(); await p.waitForTimeout(800);
  console.log('after click tab visible map?', await p.locator('.ptools').first().isVisible(), 'playing', await p.evaluate(() => !document.querySelector('audio').paused));
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close();
})();
