const path = require('path'), ROOTURL = 'file://' + path.resolve(__dirname, '..') + '/', SONGS = path.resolve(__dirname, '../test-songs') + '/', SAMPLES = path.resolve(__dirname, 'samples') + '/', OUT = path.resolve(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 950 }, acceptDownloads: true }); p.on('pageerror', e => errs.push('PE ' + String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('CE ' + m.text()); });
  await p.goto(`${ROOTURL}index.html#teardown`); await p.waitForTimeout(500);
  console.log('example tabs', (await p.locator('.tdtabs button').allInnerTexts()).join(' | '));
  await p.setInputFiles('#file', `${SONGS}lead120_Amin.wav`);
  await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  console.log('overview h2', await p.locator('#out h2:visible').allInnerTexts());
  console.log('mixmatch rows', await p.locator('#out section:has(h2:has-text("Mixes with")) tbody tr').count(), '|', (await p.locator('#out section:has(h2:has-text("Mixes with")) p.small').innerText()).slice(0, 110));
  // song map
  await p.locator('.tdtabs button:has-text("Song map")').click(); await p.waitForTimeout(300);
  console.log('map h2', await p.locator('#out h2:visible').allInnerTexts());
  console.log('ptools', await p.locator('.ptools button').allInnerTexts());
  await p.locator('.ptools button:has-text("50%")').click(); console.log('rate', await p.evaluate(() => document.querySelector('audio').playbackRate));
  await p.locator('.ptools select').selectOption({ index: 1 }); await p.waitForTimeout(400); console.log('loop playing', await p.evaluate(() => !document.querySelector('audio').paused));
  await p.locator('.ptools button:has-text("Kick + bass")').click(); await p.waitForTimeout(200); console.log('solo pressed', await p.locator('.ptools button:has-text("Kick + bass")').getAttribute('aria-pressed'));
  await p.evaluate(() => document.querySelector('audio').pause());
  console.log('swing:', (await p.locator('section:has(h2:has-text("Drum pattern")) p.small').nth(1).innerText()).slice(0, 90));
  console.log('sec drums', await p.locator('.secdr').count());
  console.log('transcription blocks', await p.locator('section:has(h2:has-text("What the song plays")) .idea h3').allInnerTexts());
  await p.locator('section:has(h2:has-text("What the song plays")) button:has-text("Use as my melody idea")').click(); await p.waitForTimeout(400);
  console.log('after use → visible h2', await p.locator('#out h2:visible').allInnerTexts(), '| melody label:', await p.locator('#ideas .idea:has(h3:has-text("Melody")) .ilabel').innerText());
  // generator: style, weird, kit, favorites
  await p.locator('#ideas select.isel').selectOption('jersey'); await p.waitForTimeout(200);
  console.log('jersey:', await p.locator('#ideas .idea:has(h3:has-text("Drum groove")) .ilabel').innerText());
  await p.locator('#ideas select.isel').selectOption('ukg'); console.log('ukg:', (await p.locator('#ideas .idea:has(h3:has-text("Drum groove")) .ilabel').innerText()).slice(0, 70));
  await p.locator('#ideas input[type=range]').fill('90'); await p.locator('#ideas input[type=range]').dispatchEvent('change'); await p.waitForTimeout(200);
  console.log('weird labels:', (await p.locator('#ideas .ilabel').allInnerTexts()).map(t => t.slice(0, 80)).join(' || '));
  await p.locator('#ideas .kit input[multiple]').setInputFiles([`${SAMPLES}kick.wav`, `${SAMPLES}snare.wav`, `${SAMPLES}hat.wav`, `${SAMPLES}808 test.wav`].filter(f => fs.existsSync(f)));
  await p.waitForTimeout(2500); console.log('kit:', (await p.locator('#ideas .kit button').allInnerTexts()).join(' | '));
  const pb = p.locator('#ideas .row button.cool').first(); await pb.click(); await p.waitForTimeout(500); await p.locator('#ideas button:has-text("■ Stop")').first().click();
  await p.locator('#ideas .idea:has(h3:has-text("Melody")) button:has-text("Save")').click(); await p.locator('#ideas .idea:has(h3:has-text("Drum groove")) button:has-text("Save")').click(); await p.waitForTimeout(200);
  console.log('favs:', await p.locator('#favs h3').innerText(), await p.locator('#favs .fav').count());
  await p.locator('#favs .fav button:has-text("Load")').first().click(); await p.locator('#favs .fav button:has-text("Remove")').first().click(); console.log('favs after remove:', await p.locator('#favs h3').innerText());
  await p.locator('#ideas').screenshot({ path: 'ideas2.png' });
  // sounds tab
  await p.locator('.tdtabs button:has-text("Sounds and mix")').click(); console.log('shelf panel:', (await p.locator('section:has(h2:has-text("Your samples that fit")) p.small').innerText()).slice(0, 80));
  // compare
  await p.locator('.tdtabs button:has-text("Compare")').click(); await p.waitForTimeout(200);
  console.log('compare h2', await p.locator('#out h2:visible').allInnerTexts());
  const cin = p.locator('#out section[data-group=compare] input[type=file]').first(); await cin.setInputFiles(`${SONGS}pop127_Amaj.wav`);
  await p.waitForSelector('.bchart', { timeout: 90000 }); console.log('band chart:', (await p.locator('.bchart .tip').innerText()).slice(0, 110), '| rows', await p.locator('.brow').count());
  await p.locator('.bchart').screenshot({ path: 'bchart.png' });
  await p.locator('section:has(h2:has-text("Share with your mentor")) textarea').fill('Does my 808 sit right under the kick?');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button:has-text("Save as a page")').click()]); await dl.saveAs(OUT + 'share.html'); console.log('share file', dl.suggestedFilename(), fs.statSync(OUT + 'share.html').size);
  // session
  await p.locator('.sess button:has-text("Session")').click(); console.log('goal default:', await p.locator('.sess input').inputValue());
  await p.locator('.sess button:has-text("25 min")').click(); await p.waitForTimeout(1200); console.log('timer:', await p.locator('.sess .stime').innerText());
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('td_session_v1')); s.start -= 3 * 60000; localStorage.setItem('td_session_v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(600); console.log('timer after reload:', await p.locator('.sess .stime').innerText());
  await p.locator('.sess button:has-text("End")').click(); await p.waitForTimeout(300); console.log('sess msg:', await p.locator('.sess').innerText());
  await p.goto(`${ROOTURL}index.html#learn`); await p.waitForTimeout(500);
  console.log('log has timed session:', await p.locator('text=Timed session').count());
  await p.screenshot({ path: 'learn2.png' });
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close();
})();
