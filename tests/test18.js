const path = require('path'), ROOTURL = 'file://' + path.resolve(__dirname, '..') + '/', SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); p.on('pageerror', e => errs.push('PE ' + String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('CE ' + m.text()); });
  await p.goto(`${ROOTURL}index.html#learn`); await p.waitForTimeout(500);
  console.log('ear panel', await p.locator('#ear').count());
  await p.locator('#ear button:has-text("Where\'s the kick")').click(); await p.waitForTimeout(300);
  await p.locator('#ear .row').last().locator('button').nth(1).click(); await p.waitForTimeout(200);
  console.log('ear fb', await p.locator('#ear p[role=status]').innerText(), '|', await p.locator('#ear b').first().innerText());
  await p.locator('#ear button:has-text("Major or minor")').click(); await p.locator('#ear button:has-text("Minor")').last().click();
  await p.locator('#ear button:has-text("Which chord")').click(); await p.locator('#ear button:has-text("V (5)")').click();
  console.log('ear score', await p.locator('#ear b').first().innerText());
  await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(400);
  await p.setInputFiles('#file', `${SONGS}lead120_Amin.wav`);
  await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  await p.locator('.tdtabs button:has-text("Build it")').click();
  console.log('today', (await p.locator('.today').innerText()).replace(/\n/g, ' | '));
  await p.locator('.today button').click(); await p.waitForTimeout(500);
  console.log('session', await p.locator('.sess').innerText());
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('td_session_v1')); s.start -= 26 * 60000; localStorage.setItem('td_session_v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(1500); console.log('after timer', await p.locator('.sess').innerText());
  await p.locator('.sess button:has-text("Tick off")').click(); await p.waitForTimeout(300);
  await p.setInputFiles('#file', `${SONGS}lead120_Amin.wav`); await p.waitForFunction(() => /ready/.test(document.querySelector('#status').textContent), null, { timeout: 120000 }); await p.locator('.tdtabs button:has-text("Build it")').click();
  console.log('plan first done', await p.locator('#plan .pstep').first().getAttribute('class'), '| today now', (await p.locator('.today h3').innerText()));
  // #5: edit drum → drumParts + plan
  await p.locator('.tdtabs button:has-text("Song map")').click(); await p.waitForTimeout(200);
  const before = await p.evaluate(() => JSON.stringify(window.__td.drumParts.map(x => x.snare[3])));
  await p.locator('section:has(h2:has-text("Drum pattern")) .rack-row').nth(2).locator('button').nth(3).click();
  const after = await p.evaluate(() => JSON.stringify(window.__td.drumParts.map(x => x.snare[3])));
  console.log('drumParts snare[3]', before, '->', after);
  // chord checker
  console.log('chips', await p.locator('.chchip').count());
  await p.locator('.chchip').nth(2).click(); await p.waitForTimeout(800);
  console.log('chord loop playing', await p.evaluate(() => !document.querySelector('audio').paused), 'rate', await p.evaluate(() => document.querySelector('audio').playbackRate), 'overlay', await p.locator('button:has-text("Stop checking")').count());
  await p.locator('.tdtabs button:has-text("Song map")').click();
  await p.locator('.chcheck select').selectOption({ index: 2 }); await p.waitForTimeout(300);
  console.log('bar3 now', await p.evaluate(() => window.__td.chords.bars[2]), 'chip class', await p.locator('.chchip').nth(2).getAttribute('class'));
  await p.locator('.chcheck button:has-text("Sounds right")').click();
  console.log('checks', await p.evaluate(() => JSON.stringify(window.__td.chordChecks)));
  await p.locator('.chcheck').screenshot({ path: 'chcheck.png' });
  const s1 = p.locator('button:has-text("Stop checking")'); if (await s1.count()) await s1.click();
  // compare twice -> part scores + progress + journal
  await p.locator('.tdtabs button:has-text("Compare")').click();
  for (const f of ['pop127_Amaj.wav', 'lead120_Amin.wav']) { await p.locator('#mine').setInputFiles(`${SONGS}` + f); await p.waitForFunction(n => document.querySelector('#compare') && /Compared/.test(document.querySelector('#compare').innerText) && document.querySelector('#compare').innerText.includes(n), f, { timeout: 120000 }); }
  console.log('part stats', (await p.locator('#compare .stats').nth(1).innerText()).replace(/\n/g, ' '));
  console.log('progress', (await p.locator('#compare table').first().innerText()).replace(/\n/g, ' | ').slice(0, 300));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button:has-text("Make a review page")').click()]); await dl.saveAs(OUT + 'review.html'); console.log('review', dl.suggestedFilename(), fs.statSync(OUT + 'review.html').size);
  // journal
  await p.evaluate(() => { location.hash = '#journal'; }); await p.waitForTimeout(500);
  console.log('journal cards', await p.locator('.jcard').count(), (await p.locator('.jcard').first().innerText()).replace(/\n/g, ' | ').slice(0, 250));
  await p.locator('.jcard textarea').first().fill('Ghost snares make the groove'); await p.locator('.jcard textarea').first().dispatchEvent('change');
  // habits: need 2 teardowns in history
  await p.evaluate(() => { location.hash = '#teardown'; }); await p.setInputFiles('#file', `${SONGS}pop127_Amaj.wav`);
  await p.waitForFunction(() => /ready/.test(document.querySelector('#status').textContent) && /pop127/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  await p.evaluate(() => { location.hash = '#journal'; }); await p.waitForTimeout(400);
  const hb = p.locator('section:has(h2:has-text("Producer habits")) .row button'); console.log('habit songs', await hb.count());
  await hb.nth(0).click(); await hb.nth(1).click(); await p.waitForTimeout(200);
  console.log('habits', (await p.locator('section:has(h2:has-text("Producer habits")) ul').innerText()).replace(/\n/g, ' | '));
  console.log('learned saved', await p.evaluate(() => JSON.parse(localStorage.getItem('beat_journal_v1'))[0].learned));
  await p.screenshot({ path: 'journal.png', fullPage: false });
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close();
})();
