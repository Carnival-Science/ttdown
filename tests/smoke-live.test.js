#!/usr/bin/env node
// Live-site smoke test: READ-ONLY checks of the deployed app (default https://trackteardown.netlify.app/, or TT_LIVE_URL).
// It loads the page like a visitor, checks that every asset loads and nothing throws, and analyses a short generated click track in
// the browser (analysis runs locally in the page; nothing is uploaded). It never deploys, signs in or changes anything.
// Run by hand: npm run smoke:live  (also a manually triggered GitHub workflow, .github/workflows/live-smoke.yml).
"use strict";
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { chromium } = require("playwright");
const { clickTrackWav } = require("./lib/click-wav");

const URL_ = (process.env.TT_LIVE_URL || "https://trackteardown.netlify.app/").replace(/\/?$/, "/");

(async () => {
  const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tt-live-")), "live smoke click 120.wav");
  fs.writeFileSync(wav, clickTrackWav({ bpm: 120, seconds: 12 }));
  const b = await chromium.launch(), errs = [], badRequests = [], offsite = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const origin = new URL(URL_).origin;
  console.log(`live smoke: ${URL_}`);
  try {
    const p = await b.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
    p.on("requestfailed", r => { const why = r.failure() && r.failure().errorText; if (!(r.url().startsWith("blob:") && why === "net::ERR_ABORTED")) badRequests.push(`${r.url()} (${why})`); }); // see smoke-fast: <audio> media abort
    p.on("request", r => { if (!r.url().startsWith("data:") && !r.url().startsWith("blob:") && new URL(r.url()).origin !== origin) offsite.push(r.url()); });
    p.on("response", r => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`); });
    const res = await p.goto(URL_, { waitUntil: "networkidle" });
    check(res && res.ok(), `the site responds (${res && res.status()})`);
    check(/text\/html/.test((res && res.headers()["content-type"]) || ""), "and serves HTML");
    check(await p.locator("#empty").isVisible() && await p.locator("#file").count() === 1, "the app starts: empty state and upload control");
    await p.setInputFiles("#file", wav);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 90000 });
    const status = (await p.locator("#status").innerText()).trim();
    check(/Teardown ready for/.test(status), `a short generated track analyses in the page ("${status.slice(0, 60)}")`);
    check(await p.locator("#out .barruler span").count() >= 2, "and the timeline renders");
    check(badRequests.length === 0, `no failed requests (${badRequests.length})`);
    check(offsite.length === 0, `no requests to other sites (${offsite.length})`);
    if (badRequests.length) console.log("failed requests:", badRequests);
    if (offsite.length) console.log("requests to other sites:", [...new Set(offsite)]);
  } catch (e) { failed++; console.log("FAIL the live smoke test stopped: " + (e && e.stack || e)); }
  check(errs.length === 0, `no page or console errors (${errs.length})`);
  if (errs.length) console.log("errors:", errs);
  await b.close();
  console.log(`\nlive smoke: ${n - failed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
