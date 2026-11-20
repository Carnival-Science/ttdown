#!/usr/bin/env node
// The circle motif (app/src/lib/ui/art/Scene.svelte) is ONE scene for the whole session, told apart by depth of field:
//   1. one .scene with three discs is mounted, and the SAME element stays through idle -> drop -> idle -> analyse -> workspace
//   2. idle and analyse are soft (blurred), drop is sharp, workspace is a heavy wash behind the work (the panels stay unblurred)
//   3. only a file being dragged in shows the orbit (not idle, analysis or the workspace)
//   4. once the workspace wash settles the discs stop moving (nothing animates behind the work)
//   5. the "Teardown ready" status is still announced (role=status) but not shown
//   6. under prefers-reduced-motion the discs are placed, not animated
// Run through tests/run-app-tests.js (TT_APP_URL).
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const URL = `${process.env.TT_APP_URL || `file://${ROOT}/`}index.html#teardown`;
const SONG = path.join(ROOT, 'test-songs', 'pop127_Amaj.wav');

(async () => {
  const b = await chromium.launch(); let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const look = p => p.evaluate(() => {
    const sc = document.querySelector('.scene'), d = [...document.querySelectorAll('.scene .disc')];
    const blur = el => { const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter); return m ? +m[1] : 0; };
    return { n: document.querySelectorAll('.scene').length, discs: d.length, state: sc && sc.dataset.state, blur: d.length ? blur(d[0]) : -1,
      orbit: sc ? +getComputedStyle(sc.querySelector('.orbit')).opacity : -1, transforms: d.map(e => e.style.transform).join('|') };
  });
  const drag = (p, type, x, y) => p.evaluate(([type, x, y]) => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.wav', { type: 'audio/wav' }));
    window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, [type, x, y]);

  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(URL); await p.waitForTimeout(1200);
    await p.evaluate(() => { window.__scene = document.querySelector('.scene'); });
    const same = () => p.evaluate(() => document.querySelector('.scene') === window.__scene);
    let s = await look(p);
    check(s.n === 1 && s.discs === 3 && s.state === 'idle' && s.blur >= 4 && s.blur <= 10 && s.orbit < 0.05, `1-2: idle: one scene of three slightly soft discs (blur ${s.blur}px, silhouettes still readable), no orbit`);
    await drag(p, 'dragenter', 400, 400); await drag(p, 'dragover', 420, 380); await p.waitForTimeout(800); s = await look(p);
    check(s.state === 'drop' && s.blur === 0 && s.orbit > 0.5 && await same(), `1-3: dragging a file brings the same discs into sharp focus (blur ${s.blur}px), with the orbit`);
    const t1 = s.transforms; await drag(p, 'dragover', 900, 300); await p.waitForTimeout(500);
    check((await look(p)).transforms !== t1, '2: and they follow the pointer');
    await drag(p, 'dragleave', 900, 300); await p.waitForTimeout(1000); s = await look(p);
    check(s.state === 'idle' && s.blur >= 4 && await same(), `2: dragging away reverses it (blur ${s.blur}px)`);
    await p.setInputFiles('#file', SONG);
    await p.waitForFunction(() => document.querySelector('.scene').dataset.state === 'analyse', null, { timeout: 20000 }); s = await look(p); const kept = await same();
    check(s.state === 'analyse' && s.blur >= 4 && s.orbit < 0.05 && kept, `3: analysing: still soft, no orbit (state ${s.state}, blur ${s.blur}px, orbit ${s.orbit}, same scene ${kept})`);
    check(/taking it apart|downbeat|bars|listening|nook|got/i.test(await p.locator('#empty h2').innerText()), '3: the same one-line treatment says it is working');
    await p.waitForFunction(() => !!document.querySelector('#out.has-result'), null, { timeout: 120000 }); await p.waitForTimeout(2600); s = await look(p);
    check(s.state === 'workspace' && s.blur >= 20 && s.orbit < 0.05 && await same(), `2-3: the workspace: the same discs become a heavy wash (blur ${s.blur}px before their ~2x scale), no orbit`);
    check(await p.evaluate(() => getComputedStyle(document.querySelector('.workspace')).filter === 'none' && getComputedStyle(document.querySelector('.mroll')).filter === 'none'), '2: the work itself is not blurred');
    const a = (await look(p)).transforms; await p.waitForTimeout(700);
    check((await look(p)).transforms === a, '4: once settled, the wash stays still');
    const st = await p.evaluate(() => { const el = document.querySelector('#status'); return { text: el.textContent, role: el.getAttribute('role'), w: el.getBoundingClientRect().width }; });
    check(/Teardown ready/.test(st.text) && st.role === 'status' && st.w <= 1, `5: "Teardown ready" is announced (role=${st.role}) but not shown (${st.w}px wide)`);
    check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await ctx.close(); }

  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(800); const a = (await look(p)).transforms; await p.waitForTimeout(800);
    check(a && (await look(p)).transforms === a, '6: prefers-reduced-motion: the discs are placed, not animated');
    await ctx.close(); }

  await b.close();
  console.log(`Scene tests: ${failed ? failed + ' failed' : 'all passed'}.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
