// What v1 is, and what it deliberately is not (docs/SVELTE_MIGRATION.md §14).
//   * every finding says how it is known (measured / estimated / assumed / unknown / corrected)
//   * the arrangement timeline is the central object: clicking a section selects it, shows its detail and seeks the player
//   * volume lives in the player; there is no navigation, coach, journal, sample organiser, practice or lesson content,
//     no DAW-specific or plugin advice, no style or mood guesses, no uncalibrated confidence labels
//   * nothing leaves the browser, and the page never reaches for an account or assistant runtime
//   * what the analyzer cannot find is shown as unknown, not filled in
//   * the page never shows numbers before a track is analysed
//   npm run app:build && TT_APP_URL=... node tests/app-product.test.js   (npm run app:feature-tests sets the URL)
"use strict";
const path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs");
(async () => {
  const b = await chromium.launch(), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }), requests = [];
  await ctx.addInitScript(() => { window.claude = { use() { window.__claudeTouched = true; return Promise.reject(new Error("no runtime")); } }; });
  const open = async () => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); p.on("request", r => requests.push(r.url())); await p.goto(`${URL}index.html`); await p.waitForTimeout(400); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(300); };

  // empty state
  let p = await open();
  check(await p.locator("#out .stat, #out .basis, #out [data-finding]").count() === 0 && await p.evaluate(() => window.__td === undefined), "before a track is analysed no numbers are shown (no example teardown)");
  check(/drop a track/i.test(await p.locator("#empty h2").innerText()) && await p.locator('#empty button.motif[aria-label^="Open a track"]').count() === 1, "the empty state is the motif: one line (“Drop a track.”) and the motif itself opens a file");
  check(/never uploaded/.test(await p.locator('[data-help-files]').textContent()) && /8 minutes/.test(await p.locator('[data-help-files]').textContent()), "formats and that audio stays in the browser are in the help menu");
  { const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 3000 }), p.locator("#empty button.motif").click()]); check(!!chooser, "clicking the motif opens the file chooser"); }

  // a real analysis
  await analyse(p, path.join(SONGS, "sections120.mp3"));
  const kinds = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-finding]")].map(f => [f.dataset.finding, [...f.querySelectorAll(".basis")].map(x => (x.className.match(/basis-(\w+)/) || [])[1])])));
  check(JSON.stringify(kinds.tempo) === '["estimated"]' && JSON.stringify(kinds.key) === '["estimated"]' && kinds.meter[0] === "assumed" && JSON.stringify(kinds.level) === '["measured"]' && JSON.stringify(kinds.bands) === '["measured"]', `every finding carries how it is known: ${JSON.stringify(kinds)}`);
  await p.click('button[aria-label^="Help"]'); await p.waitForTimeout(250);
  const legend = await p.locator("#howto").innerText(); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  check(/Measured/i.test(legend) && /Estimated/i.test(legend) && /Assumed/i.test(legend) && /Unknown/i.test(legend) && /not been measured on real recordings/.test(legend), "the page explains the labels and says accuracy on real recordings has not been measured");
  await p.click('[data-finding="meter"] summary'); await p.waitForTimeout(100);
  const meter = await p.locator('[data-finding="meter"]').innerText();
  check(/does not detect meter/.test(meter) && /4\/4/.test(meter), "meter is shown as an assumption, not a detection");

  // removed features and unsupported claims are gone
  const text = await p.evaluate(() => document.body.innerText);
  const banned = [/FL Studio/i, /Fruity|plugin|Sytrus|Vital|Splice|Looperman/i, /\bcoach\b/i, /journal|portfolio/i, /sample lab|shelf/i, /practice|mentor|mission|lesson|curriculum/i, /build it|idea generator|rebuild/i, /likely style|mood|bright \/ uplifting/i, /high confidence|medium confidence|low confidence/i, /EQ and mix|shopping list/i];
  const hit = banned.filter(r => r.test(text)).map(String);
  check(hit.length === 0, `no FL Studio, plugin, coach, journal, sample, practice, lesson, style or confidence content${hit.length ? " (found " + hit.join(" ") + ")" : ""}`);
  check(await p.locator("nav, .tdtabs, #view-learn, #view-journal, #view-samples, #dispbtn, #volbtn, .lcd, .sess, .coach-fab").count() === 0, "no navigation, header volume or display menus, LCD, session timer or coach button");
  const claude = await p.evaluate(() => !!window.__claudeTouched); check(!claude, "the page never reaches for an account or assistant runtime");

  // the timeline is the central object
  const secs = await p.evaluate(() => window.__td.sections.map(s => ({ label: s.label, start: s.start, startBar: s.startBar, bars: s.bars })));
  check(secs.length >= 3, `the arrangement has ${secs.length} sections to explore`);
  const segs = p.locator("#explorer .timeline .seg"); check(await segs.count() === secs.length, "one clickable block per section");
  check(await segs.nth(0).getAttribute("aria-checked") === "true", "the first section starts selected");
  const hdr0 = await p.locator(".detail h3").first().innerText();
  await p.evaluate(() => document.querySelector("#explorer audio").pause());
  const sb = await segs.nth(2).boundingBox(), cx = sb.x + sb.width / 2, mb = await p.locator(".map").boundingBox(), tWant = (cx - mb.x) / mb.width * (await p.evaluate(() => window.__td.duration));
  await p.mouse.click(cx, sb.y + sb.height / 2); await p.waitForTimeout(400);
  const hdr2 = await p.locator(".detail h3").first().innerText(), t = await p.evaluate(() => document.querySelector("#explorer audio").currentTime);
  check(hdr2 !== hdr0 && hdr2.includes(secs[2].label) && hdr2.includes(`bars ${secs[2].startBar + 1}–${secs[2].startBar + secs[2].bars}`), `clicking a section shows its detail ("${hdr2.replace(/\s+/g, " ")}")`);
  check(await segs.nth(2).getAttribute("aria-checked") === "true" && await segs.nth(0).getAttribute("aria-checked") === "false", "and marks it selected");
  check(t >= secs[2].start - 0.1 && Math.abs(t - tWant) < 0.3, `and the player seeks to exactly where it was clicked, inside it (${t.toFixed(2)} s for ${tWant.toFixed(2)} s, section starts ${secs[2].start} s)`);
  // the song map: measured loudness per bar inside the estimated sections, a transport, keyboard section choice
  const nb = await p.evaluate(() => ({ cols: document.querySelectorAll("#explorer svg.loud g").length, bars: window.__td.nBars }));
  check(nb.cols >= nb.bars - 1 && nb.cols <= nb.bars + 2 && await p.locator("#explorer .keyloud .basis-measured").count() === 1, `the map draws the loudness of each bar, labelled Measured (${nb.cols} columns, ${nb.bars} bars)`);
  await p.evaluate(() => document.querySelector("#explorer audio").pause()); await p.waitForTimeout(150);
  await p.click('#explorer button[aria-label="Play"]'); await p.waitForTimeout(500);
  check(await p.evaluate(() => !document.querySelector("#explorer audio").paused) && await p.locator('#explorer button[aria-label="Pause"]').count() === 1, "the play button plays and turns into Pause");
  await p.click('#explorer button[aria-label="Pause"]'); await p.waitForTimeout(150);
  const scrub = p.locator('#explorer .barruler[role="slider"]'); await scrub.focus(); await p.keyboard.press("End"); await p.waitForTimeout(150);
  const tEnd = await p.evaluate(() => document.querySelector("#explorer audio").currentTime);
  check(tEnd > (await p.evaluate(() => window.__td.duration)) - 1, `the ruler is a keyboard slider that moves the song (End → ${tEnd.toFixed(1)} s)`);
  await segs.nth(2).focus(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(250);
  check(await segs.nth(1).getAttribute("aria-checked") === "true" && (await p.locator(".detail h3").first().innerText()).includes(secs[1].label), "arrow keys move between sections and show the chosen one");
  const tabs = await p.locator('.detail [role="tab"]').allInnerTexts(); check(JSON.stringify(tabs) === '["Piano roll","Rhythm"]', `a section's detail has Piano roll then Rhythm (${tabs})`);
  await p.click('.detail [role="tab"]:has-text("Piano roll")'); await p.waitForTimeout(150);
  check(await p.locator('.detail [data-part="roll"] [data-annotations="chords"] .ann-item').count() >= 1, "the Piano roll names the chords of the bars in view");

  // volume is in the player
  check(await p.locator("#explorer .playerbar #volume").count() === 1, "volume is a control inside the player");
  const vin = p.locator("#volume input[type=range]"); await vin.focus(); await p.keyboard.press("Home"); for (let k = 0; k < 3; k++) await p.keyboard.press("PageUp"); await p.waitForTimeout(100);
  const vol = await p.evaluate(() => JSON.parse(localStorage.getItem("app_volume_v1")));
  check(Math.abs(vol.song - 0.3) < 0.01 && Math.abs(vol.sounds - 0.3) < 0.01 && vol.muted === false, `it sets the song and the sounds played over it together, and is remembered (${JSON.stringify(vol)})`);
  await p.click("#mute"); check((await p.evaluate(() => JSON.parse(localStorage.getItem("app_volume_v1")))).muted === true && await p.locator("#mute").getAttribute("aria-pressed") === "true", "mute works and says so");

  // corrections are labelled
  await p.click('button[aria-label="Halve the BPM"]'); await p.waitForFunction(() => /Analysed again/.test(document.querySelector('#status').textContent), null, { timeout: 120000 }); await p.waitForTimeout(300);
  check(await p.locator('[data-finding="tempo"] .basis-corrected').count() === 1 && /Analysed again at your tempo/.test(await p.locator("#out .notice").first().innerText()), "a tempo correction is labelled, and the page says the track was analysed again at it");
  await p.locator('select[aria-label="Set the key yourself"]').selectOption("C minor"); await p.waitForTimeout(300);
  check(await p.locator('[data-finding="key"] .basis-corrected').count() === 1 && /C minor/.test(await p.locator('[data-finding="key"] .big').innerText()), "a key correction is labelled and shown");
  await p.close();

  // unknown is shown as unknown
  const seed = await (async () => { const q = await open(); await analyse(q, path.join(SONGS, "pop127_Amaj.wav")); const r = await q.evaluate(() => JSON.parse(localStorage.getItem("teardown_history_v1"))[0]); await q.close(); return r; })();
  { const q = await open(); const rec = JSON.parse(JSON.stringify(seed)); delete rec.chords; delete rec.chordRegions; delete rec.transcription; rec.hook = null; rec.bassline = null; rec.swing = null;
    await q.evaluate(r => localStorage.setItem("teardown_history_v1", JSON.stringify([r])), rec); await q.reload(); await q.waitForTimeout(400); await q.click("#recent-btn"); await q.click("#hist .h-open"); await q.waitForTimeout(400);
    await q.click('.detail [role="tab"]:has-text("Piano roll")'); const nn = await q.locator('.detail [data-part="roll"]').innerText();
    await q.click('.detail [role="tab"]:has-text("Rhythm")'); const rh = await q.locator('.detail [data-part="rhythm"]').innerText();
    check(/No melody, bass or chords could be read reliably/.test(nn) && await q.locator('.detail [data-part="roll"] .basis-unknown').count() === 1 && await q.locator('.detail [data-part="roll"] .mroll').count() === 0, "no chords, melody or bass found: the Piano roll says unknown instead of inventing some");
    check(/Swing: unknown/.test(rh), "swing that could not be measured is reported as unknown");
    check(/a saved teardown doesn't keep the audio/.test(await q.locator("#explorer").innerText()), "a saved teardown says it has no audio to play");
    check(await q.locator("#explorer svg.loud").count() === 0 && await q.locator("#explorer .transport").count() === 0 && await q.locator("#explorer .timeline .seg").count() >= 1, "and shows its sections without a loudness shape or a player (nothing measured is invented)");
    await q.close(); }

  // nothing leaves the browser
  const origin = new globalThis.URL(URL).origin, foreign = requests.filter(u => !/^(data|blob):/.test(u) && !u.startsWith(origin) && !u.startsWith("file://"));
  check(foreign.length === 0, `every request stayed on this origin${foreign.length ? ": " + foreign.slice(0, 3).join(", ") : ""} (${requests.length} requests)`);
  console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app product tests passed (${n})`);
})();
