#!/usr/bin/env node
// End-to-end: the critical user journey, in a real browser, through the page only (no test hooks), on the PRODUCTION build.
//   empty page -> upload a track -> analysis renders the timeline and findings -> confirm the bar lines -> download the MIDI zip and
//   the analysis data, and read both back -> the teardown was saved -> reload -> reopen it from Recent -> its tracked grid is back.
// Runs in Chromium, Firefox or WebKit:  TT_BROWSER=firefox node tests/e2e-journey.test.js   (default chromium)
// Needs: npm run songs (test-songs/pop127_Amaj.wav) and npm run app:build. Starts its own local server for app/dist/<TT_BUILD>
// (default production) unless TT_APP_URL points at a running one.
"use strict";
const path = require("node:path"), fs = require("node:fs");
const pw = require("playwright");
const { createTarget } = require("../bench/lib/target");
const { decodeMidi, readZip } = require("./lib/smf");

const ROOT = path.resolve(__dirname, ".."), SONG = path.join(ROOT, "test-songs", "pop127_Amaj.wav"), HK = "teardown_history_v1";
const BROWSER = process.env.TT_BROWSER || "chromium", BUILD = process.env.TT_BUILD || "production";
const OUT = path.join(__dirname, "out", `e2e-journey-${BROWSER}`);

(async () => {
  if (!pw[BROWSER]) throw new Error(`Unknown TT_BROWSER "${BROWSER}" (chromium, firefox or webkit)`);
  if (!fs.existsSync(SONG)) throw new Error(`Missing ${SONG}: run npm run songs first`);
  fs.mkdirSync(OUT, { recursive: true });
  let target = null, base = process.env.TT_APP_URL;
  if (!base) { target = createTarget({ kind: "svelte", root: ROOT, build: BUILD }); await target.start(); base = target.url().replace(/index\.html#teardown$/, ""); }
  const b = await pw[BROWSER].launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  console.log(`e2e journey: ${BROWSER} ${b.version()}, ${BUILD} build at ${base}`);
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e)));
    const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]"), HK);

    // 1. the empty page
    await p.goto(`${base}index.html#teardown`); await p.waitForTimeout(300);
    check(await p.locator("#empty").isVisible() && (await store()).length === 0, "1: the page opens empty, with nothing saved");

    // 2. upload and analyse
    const t0 = Date.now();
    await p.setInputFiles("#file", SONG);
    await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 180000 });
    const status = await p.locator("#status").innerText();
    check(/Teardown ready for/.test(status), `2: the analysis finishes ("${status.trim().slice(0, 60)}", ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const ticks = await p.locator("#out .barruler span").count(), grid = await p.locator("#out .barruler").getAttribute("data-grid");
    check(ticks >= 4 && grid === "tracked", `2: the timeline shows a bar ruler on the tracked beats (${ticks} ticks, ${grid})`);
    check(await p.locator("#explorer").isVisible() && await p.locator("#exports").isVisible(), "2: the findings and the export panel are shown");

    // 3. exports: bar-aligned MIDI only after the bar lines are confirmed; the analysis data always
    const midi = p.locator('#exports button:has-text("Download the song as MIDI")'), json = p.locator('#exports button:has-text("Analysis data")');
    check(await midi.isDisabled(), "3: the MIDI export is locked until the bar lines are confirmed");
    await p.locator("#exports input[type=checkbox]").nth(0).check(); await p.locator("#exports input[type=checkbox]").nth(1).check();
    await p.locator('#exports button:has-text("Confirm and unlock")').click(); await p.waitForTimeout(150);
    check(await midi.isEnabled(), "3: after confirming, the MIDI export is available");
    let [dl] = await Promise.all([p.waitForEvent("download"), midi.click()]); const zipPath = path.join(OUT, "song.zip"); await dl.saveAs(zipPath);
    const parts = readZip(fs.readFileSync(zipPath)).map(f => ({ name: f.name, d: decodeMidi(f.data) }));
    const bpm = parts[0] && parts[0].d.tempos[0] && parts[0].d.tempos[0].bpm;
    check(parts.length === 6 && parts.every(x => x.d.format === 1 || x.d.format === 0) && Math.abs(bpm - 127) < 0.01,
      `3: the MIDI zip (${dl.suggestedFilename()}) holds ${parts.length} readable MIDI files at ${bpm} BPM`);
    [dl] = await Promise.all([p.waitForEvent("download"), json.click()]); const jsonPath = path.join(OUT, "analysis.json"); await dl.saveAs(jsonPath);
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    check(Math.abs(data.bpm - 127) < 1 && data.timing && data.timing.beats.length > 16 && !("__buf" in data), `3: the analysis data parses (${data.bpm} BPM, ${data.timing && data.timing.beats.length} tracked beats)`);

    // 4. it was saved, with its tracked timing and without the audio
    const saved = await store();
    check(saved.length === 1 && saved[0].title === "pop127_Amaj" && saved[0].timing && saved[0].timing.v === 1 && !JSON.stringify(saved).includes("__buf"),
      `4: the teardown is saved in this browser with its tracked timing (${saved.length} record)`);

    // 5. reload the page and reopen it from Recent
    await p.reload(); await p.waitForTimeout(400);
    await p.click("#recent-btn"); await p.locator("#hist .h-open", { hasText: "pop127_Amaj" }).first().click(); await p.waitForTimeout(500);
    const reGrid = await p.locator("#out .barruler").getAttribute("data-grid"), reTicks = await p.locator("#out .barruler span").count();
    check(reGrid === "tracked" && reTicks === ticks, `5: after a reload, the reopened teardown has its tracked grid and the same ruler (${reTicks} ticks, ${reGrid})`);
    check(JSON.stringify(await store()) === JSON.stringify(saved), "5: reopening does not rewrite what is saved");
  } catch (e) { failed++; console.log("FAIL the journey stopped: " + (e && e.stack || e)); }
  check(errs.length === 0, `no page errors (${errs.length})`);
  if (errs.length) console.log("page errors:", errs);
  await b.close(); if (target) await target.stop();
  console.log(`\ne2e journey (${BROWSER}): ${n - failed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
