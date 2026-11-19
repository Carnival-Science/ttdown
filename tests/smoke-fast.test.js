#!/usr/bin/env node
// Fast smoke test (the first CI stage, well under a minute): does the PRODUCTION build start and work at all?
//   the page and every asset load (no failed requests), nothing throws, the empty state and the upload control are there, and a short
//   generated click track analyses to a timeline. Needs only `npm run app:build` (no Python, no generated test songs).
// The thorough checks are in app/tests/smoke.mjs (dev, production and bench builds) and the product tests.
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { chromium } = require("playwright");
const { createTarget } = require("../bench/lib/target");
const { clickTrackWav } = require("./lib/click-wav");

const ROOT = path.resolve(__dirname, "..");
// The <audio> element cancels its first request for the uploaded file's object URL when it switches to range requests. That is the
// browser's normal media loading, not a failure; any other failed request (or a blob: failure for another reason) still fails the test.
const isMediaAbort = (url, why) => url.startsWith("blob:") && why === "net::ERR_ABORTED";

(async () => {
  const started = Date.now(), wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tt-smoke-")), "smoke click 120.wav");
  fs.writeFileSync(wav, clickTrackWav({ bpm: 120, seconds: 12 }));
  const target = createTarget({ kind: "svelte", root: ROOT, build: "production" }); await target.start();
  const url = target.url(), b = await chromium.launch(), errs = [], badRequests = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  try {
    const p = await b.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
    p.on("requestfailed", r => { const why = r.failure() && r.failure().errorText; if (!isMediaAbort(r.url(), why)) badRequests.push(`${r.url()} (${why})`); });
    p.on("response", r => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`); });
    const res = await p.goto(url); await p.waitForTimeout(300);
    check(res && res.ok(), `the production build is served (${res && res.status()})`);
    check((await p.title()).length > 0, `the page has a title ("${await p.title()}")`);
    check(await p.locator("#empty").isVisible(), "the empty state is shown");
    check(await p.locator("#file").count() === 1, "the upload control is there");
    await p.setInputFiles("#file", wav);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
    const status = (await p.locator("#status").innerText()).trim();
    check(/Teardown ready for/.test(status), `a short generated track analyses ("${status.slice(0, 60)}")`);
    check(await p.locator("#out .barruler span").count() >= 2, "and the timeline renders a bar ruler");
    check(badRequests.length === 0, `no failed requests (${badRequests.length})`);
    if (badRequests.length) console.log("failed requests:", badRequests);
  } catch (e) { failed++; console.log("FAIL the smoke test stopped: " + (e && e.stack || e)); }
  check(errs.length === 0, `no page or console errors (${errs.length})`);
  if (errs.length) console.log("errors:", errs);
  await b.close(); await target.stop();
  console.log(`\nfast smoke: ${n - failed} passed, ${failed} failed, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
