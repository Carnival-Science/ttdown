#!/usr/bin/env node
// End-to-end: the critical user journey, in a real browser, through the page only (no test hooks), on the PRODUCTION build.
//   empty page -> upload a track -> analysis renders the timeline and findings -> download all parts as MIDI from the piano roll and
//   read it back -> the teardown was saved -> reload -> reopen it from Recent -> its tracked grid is back.
// Runs in Chromium, Firefox or WebKit:  TT_BROWSER=firefox node tests/e2e-journey.test.js   (default chromium)
// Needs: npm run songs (test-songs/pop127_Amaj.wav) and npm run app:build. Starts its own local server for app/dist/<TT_BUILD>
// (default production) unless TT_APP_URL points at a running one.
"use strict";
const path = require("node:path"), fs = require("node:fs");
const pw = require("playwright");
const { createTarget } = require("../bench/lib/target");
const { decodeMidi } = require("./lib/smf");

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
    check(await p.locator("#explorer").isVisible() && await p.locator("[data-finding]").count() === 5 && await p.locator("#exports").count() === 0, "2: the findings are shown (and there is no Export panel)");

    // 3. MIDI from the piano roll (the first tab, open by default): all parts, the whole track, quantized; no bar-line confirmation step
    check(await p.locator('.detail [role="tab"][aria-selected="true"]').innerText() === "Piano roll", "3: the Piano roll is the open tab");
    await p.click(".detail .phead .midi"); await p.waitForTimeout(200);
    for (const [name, v] of [["part", "all"], ["range", "whole"], ["timing", "quantized"]]) await p.locator(`.midi-pop input[name="midi-${name}"][value="${v}"]`).check();
    const [dl] = await Promise.all([p.waitForEvent("download"), p.locator(".midi-pop .dl").click()]); const midPath = path.join(OUT, "song.mid"); await dl.saveAs(midPath);
    const d = decodeMidi(fs.readFileSync(midPath)), bpm = d.tempos[0] && d.tempos[0].bpm;
    check(d.format === 1 && d.tracks.length >= 2 && d.notes.length > 0 && Math.abs(bpm - 127) < 0.01, `3: the all-parts MIDI (${dl.suggestedFilename()}) is a readable multitrack file at ${bpm} BPM with ${d.notes.length} notes`);

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
