// The page stays usable while the note model runs. The model (Basic Pitch) runs in a Web Worker; on the CPU backend (forced here, the worst
// case: what a browser without WebGL gets) a single batch used to block the page's thread for about 70 s, so the first click after the
// teardown appeared timed out (the Firefox journey in CI, PR 45).
//   1. after "Teardown ready" the status says the notes are being transcribed (the model is really running)
//   2. a checkbox in the export panel can be clicked at once, while it runs (not after the model finishes)
//   3. no task on the page's own thread blocks it for more than 2 s during that time
// The test stops after the interaction; it does not wait for the notes.   npm run app:build && node tests/run-app-tests.js app-notes-responsive.test.js
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav");
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 240000);
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", e => errs.push(String(e)));
  await p.addInitScript(() => { window.__ttBasicPitch = true; window.__ttBpBackend = "cpu"; });
  await p.goto(`${URL}index.html#teardown`);
  await p.setInputFiles("#file", SONG);
  await p.waitForFunction(() => /Teardown ready/.test(document.querySelector("#status").textContent), null, { timeout: 120000 });
  await p.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ["longtask"] }); });
  await p.waitForFunction(() => /Transcribing the notes/.test(document.querySelector("#status").textContent), null, { timeout: 30000 });
  check(true, "1: the note model is running (status says so)");
  const t0 = Date.now(); let ok = true;
  try { await p.locator("#exports input[type=checkbox]").nth(0).check({ timeout: 10000 }); } catch (e) { ok = false; }
  check(ok && Date.now() - t0 < 5000 && /Transcribing the notes/.test(await p.locator("#status").innerText()), `2: a checkbox is clickable while the model runs (${Date.now() - t0} ms)`);
  await p.waitForTimeout(8000); // let the model work for a while: the page's thread must stay free
  const lt = await p.evaluate(() => window.__lt), max = Math.max(0, ...lt);
  check(max < 2000, `3: the longest task on the page's thread while the model runs is ${Math.round(max)} ms (${lt.length} long tasks)`);
  check(errs.length === 0, `no page errors (${errs.join("; ")})`);
  await b.close(); clearTimeout(guard);
  console.log(`app notes responsive: ${n - failed} passed, ${failed} failed.`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error("FAIL:", e.stack); process.exit(1); });
