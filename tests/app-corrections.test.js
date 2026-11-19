// Phase 2d (docs/ROADMAP.md step 7): a correction must leave NO contradictory results. After a tempo or bar-1 edit the result either equals
// a fresh analysis at those values, or what depends on it is marked out of date and not exported.
//   1. with the audio, a tempo correction analyses the track again: dnb_174 is read at 87 BPM (an octave error, truth 174); correcting it
//      to 174 takes the tracked beats and downbeats from wrong to right against the known answer
//   2. moving bar 1 by one beat four times is a full turn, so the result equals a fresh analysis (identical, apart from the record of the edits)
//   3. without the audio (a saved teardown) a tempo correction cannot be analysed again: Rhythm, Harmony and Notes are marked out of date
//      (hidden, not shown as valid), exports are blocked, bar 1 cannot be moved; the correction is recorded and no confidence is invented
//   4. "this track isn't in 4/4" invalidates the same way, and unticking it restores everything
//   5. a key correction is recorded with its original, keeps the measured confidence (no hard-coded 99) and invalidates nothing
//   6. chord and drum edits are recorded with their ORIGINAL value (editing one back removes the record); a re-analysis discards them but
//      keeps the key the user set
//   7. all of it survives a reload
//   npm run app:build && TT_APP_URL=... node tests/app-corrections.test.js   (npm run app:product-tests sets the URL)
"use strict";
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), URL = process.env.TT_APP_URL || `file://${ROOT}/app/dist/bench/`, SONGS = path.join(ROOT, "test-songs"), FIX = path.join(SONGS, "time-fixtures");
const truth = fs.readFileSync(path.join(FIX, "truth", "dnb_174.beats.txt"), "utf8").trim().split("\n").map(l => l.split(/\s+/).map(Number));
const refB = truth.map(r => r[0]), refD = truth.filter(r => r[1] === 1).map(r => r[0]);
const F = (pred, ref, tol = 0.07) => { const used = new Set(); let tp = 0; for (const p of pred) { let bi = -1, bd = 1e9; ref.forEach((r, i) => { const d = Math.abs(r - p); if (d < bd && !used.has(i)) { bd = d; bi = i; } }); if (bi >= 0 && bd <= tol) { used.add(bi); tp++; } } const P = tp / (pred.length || 1), R = tp / (ref.length || 1); return P + R ? 2 * P * R / (P + R) : 0; };
(async () => {
  const guard = setTimeout(() => { console.error("test timed out"); process.exit(1); }, 280000);
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }), errs = []; let failed = 0, n = 0;
  const check = (ok, msg) => { n++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };
  const open = async () => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(String(e))); await p.goto(`${URL}index.html`); await p.waitForTimeout(300); return p; };
  const analyse = async (p, file) => { await p.setInputFiles("#file", file); await p.waitForFunction(() => /Teardown ready|Couldn/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }); await p.waitForTimeout(300); };
  const again = p => p.waitForFunction(() => /Analysed again/.test(document.querySelector("#status").textContent), null, { timeout: 120000 }).then(() => p.waitForTimeout(300));
  const td = (p, f) => p.evaluate(f);
  const strip = a => { const { timingCorrections, ...r } = a; return JSON.stringify(r); };
  const full = p => p.evaluate(() => { const a = JSON.parse(JSON.stringify(window.__td)); a.__grid = window.__td.grid; return a; });
  const tab = (p, name) => p.click(`.detail [role="tab"]:has-text("${name}")`);
  const staleCount = p => p.locator(".detail [data-stale]").count();

  // 1. dnb_174: the octave correction, against the known answer
  { const p = await open(); await analyse(p, path.join(FIX, "dnb_174.wav"));
    const a = await full(p), before = { bpm: a.bpm, fb: F(a.__grid.beats, refB), fd: F(a.__grid.downbeats, refD), conf: a.bpmConf };
    check(before.bpm === 87 && before.fb < 0.8 && before.fd < 0.2, `dnb_174 is read at ${before.bpm} BPM (beat F ${before.fb.toFixed(2)}, downbeat F ${before.fd.toFixed(2)}): the octave error`);
    await p.click('button[aria-label="Double the BPM"]'); await again(p);
    const c = await full(p), after = { fb: F(c.__grid.beats, refB), fd: F(c.__grid.downbeats, refD) };
    check(Math.abs(c.bpm - 174) <= 1 && after.fb >= 0.95 && after.fd >= 0.9, `after "× 2" the track is analysed again at ${c.bpm} BPM: beat F ${before.fb.toFixed(2)} → ${after.fb.toFixed(2)}, downbeat F ${before.fd.toFixed(2)} → ${after.fd.toFixed(2)} against the known beats`);
    const rec = c.timingCorrections;
    check(rec.length === 1 && rec[0].type === "bpm" && rec[0].from === 87 && rec[0].to === 174 && rec[0].source === "user" && rec[0].recomputed === true && !c.bpmFixed, `the correction is recorded with its original (${JSON.stringify(rec[0])}) and nothing is marked stale`);
    check(c.bpmConf === before.conf && c.bpmConf !== 99 && c.keyConf !== 99, `the measured confidence is kept (${c.bpmConf}), not replaced by a made-up 99`);
    check(await staleCount(p) === 0 && !/Blocked/.test(await p.locator("#exports").innerText()) && await p.locator('[data-finding="tempo"] .basis-corrected').count() === 1, "no part of the page is out of date, exports are not blocked, and the tempo is labelled as corrected");
    check(/Check the bar lines/.test(await p.locator("#exports").innerText()), "and the bar lines must be checked again before the bar-aligned files unlock (the grid changed)");
    check(await p.locator("#out .notice.info").count() === 1 && /detected: 87 BPM/.test(await p.locator("#out .notice.info").innerText()), "the page says it analysed again at the user's tempo and names the detected one");
    // 7. survives a reload
    await p.reload(); await p.waitForTimeout(400); await p.click("#recent-btn"); await p.locator("#hist button").first().click(); await p.waitForTimeout(400);
    const r = await full(p); check(Math.abs(r.bpm - 174) <= 1 && r.timingCorrections.length === 1 && F(r.__grid.beats, refB) >= 0.95 && await p.locator('[data-finding="tempo"] .basis-corrected').count() === 1, "after a reload the corrected analysis, its tracked beats and its record are all back");
    await p.close(); }

  // 2. bar 1 moved four times by one beat = a full turn = a fresh analysis
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav")); const fresh = await full(p), beat = 60 / fresh.bpm, bar = 240 / fresh.bpm;
    await p.click('button:has-text("One beat later")'); await again(p); const one = await full(p);
    const shifted = (((one.firstDown - fresh.firstDown) % bar) + bar) % bar;
    check(Math.abs(shifted - beat) < 0.04 && JSON.stringify(one.pattern.kick) !== JSON.stringify(fresh.pattern.kick), `one beat later moves bar 1 by ${shifted.toFixed(3)} s (a beat is ${beat.toFixed(3)} s) and the drum pattern is re-read from the new bar 1`);
    check(await p.locator('[data-finding="meter"] .basis-corrected').count() === 1, "bar 1 is labelled as corrected");
    for (let i = 0; i < 3; i++) { await p.click('button:has-text("One beat later")'); await again(p); }
    const four = await full(p);
    check(four.timingCorrections.length === 4 && four.timingCorrections.every(c => c.type === "downbeat" && c.shift === 1 && c.recomputed), "four edits are recorded");
    check(strip(four) === strip(fresh) && JSON.stringify(four.__grid) === JSON.stringify(fresh.__grid), "after a full turn the result equals the fresh analysis, field for field, tracked grid included");
    await p.click('button:has-text("One beat earlier")'); await again(p); const back = await full(p);
    check(Math.abs((((back.firstDown - fresh.firstDown) % bar) + bar) % bar - (bar - beat)) < 0.04, "one beat earlier moves it back the other way");
    await p.close(); }

  // 3. no audio: a tempo correction invalidates
  let saved;
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav")); saved = await full(p); await p.reload(); await p.waitForTimeout(400); await p.click("#recent-btn"); await p.locator("#hist button").first().click(); await p.waitForTimeout(400);
    check(await p.locator('button:has-text("One beat later")').isDisabled() && /needs the audio/.test(await p.locator('[data-finding="meter"]').innerText()), "without the audio bar 1 cannot be moved, and it says why");
    check(/audio isn't here, so a corrected tempo can't be analysed again/.test(await p.locator('[data-finding="tempo"]').innerText()), "and the tempo control says what a correction will do");
    await p.locator('input[aria-label="Type the BPM"]').fill("100"); await p.locator('button:has-text("Set BPM")').click(); await p.waitForTimeout(500);
    for (const t of ["Rhythm", "Harmony", "Notes"]) { await tab(p, t); await p.waitForTimeout(100); }
    const stale = await p.evaluate(() => [...document.querySelectorAll(".detail [data-stale]")].map(e => ({ part: e.dataset.part, text: e.innerText })));
    check(stale.length === 3 && stale.every(s => /Out of date/i.test(s.text) && /audio isn't here/.test(s.text)), "Rhythm, Harmony and Notes are marked out of date, with the reason, instead of showing results that no longer match");
    check(await p.locator(".detail .rack-row, .detail .chcell, .detail svg").count() === 0, "and none of the stale drum pattern, chords or notes is drawn");
    const ex = await p.locator("#exports").innerText(); check(/Blocked/.test(ex) && await p.locator('#exports button:has-text("Download the song as MIDI")').isDisabled() && await p.locator('#exports button:has-text("lined up")').isDisabled(), "bar-aligned exports are blocked");
    const rec = await p.evaluate(() => JSON.parse(localStorage.getItem("teardown_history_v1"))[0]);
    check(rec.bpmFixed === true && rec.timingCorrections.length === 1 && rec.timingCorrections[0].from === saved.bpm && rec.timingCorrections[0].to === 100 && rec.timingCorrections[0].recomputed === undefined && rec.bpmConf === saved.bpmConf && rec.keyConf === saved.keyConf, `the correction is recorded (original ${saved.bpm}), marked as not recomputed, and no confidence was invented (bpmConf ${rec.bpmConf})`);
    check(await p.locator("#out .notice").first().innerText().then(t => /out of date/.test(t) && /Upload the track again/.test(t)), "the page tells the user to upload the track again");
    await p.close(); }

  // 4. "this track isn't in 4/4"
  { const p = await open(); await analyse(p, path.join(FIX, "meter_3_4.wav")); const box = p.locator('[data-finding="meter"] input[type=checkbox]');
    check(!(await staleCount(p)) && await p.locator('[data-finding="meter"] .basis-assumed').count() === 1, "a 3/4 track is read as 4/4 and the page says 4/4 is assumed");
    await box.check(); await p.waitForTimeout(300);
    for (const t of ["Rhythm", "Harmony", "Notes"]) { await tab(p, t); await p.waitForTimeout(100); }
    check(await staleCount(p) === 3 && /isn't in 4\/4/.test(await p.locator(".detail [data-stale]").first().innerText()), "ticking “This track isn't in 4/4” marks the bar-based parts out of date, with the reason");
    check(await p.locator('[data-finding="meter"] .big').innerText().then(t => /Not 4\/4/.test(t)) && await p.locator("#exports").innerText().then(t => /Blocked/.test(t) && /4\/4/.test(t)), "the meter reads “Not 4/4” and bar-aligned exports are blocked");
    check(await p.locator('button:has-text("Check by ear")').isDisabled(), "and “Check by ear” is off, because it would play the stale parts");
    await box.uncheck(); await p.waitForTimeout(300); await tab(p, "Rhythm");
    check(await staleCount(p) === 0 && await p.locator(".detail .rack-row").count() > 0, "unticking it brings the parts back");
    const rec = (await full(p)).timingCorrections; check(rec.length === 2 && rec.every(c => c.type === "meter") && rec[0].to === "not 4/4" && rec[1].to === "4/4", "both edits are recorded");
    await p.close(); }

  // 5 and 6. key, chord and drum edits
  { const p = await open(); await analyse(p, path.join(SONGS, "pop127_Amaj.wav")); const a0 = await full(p);
    await p.locator('select[aria-label="Set the key yourself"]').selectOption("C minor"); await p.waitForTimeout(300);
    const a1 = await full(p);
    check(a1.key === "C minor" && a1.keyFixed === true && a1.keyConf === a0.keyConf && a1.keyConf !== 99 && a1.timingCorrections.some(c => c.type === "key" && c.from === a0.key && c.to === "C minor"), `the key correction is recorded with its original (${a0.key}) and keeps the measured confidence (${a1.keyConf})`);
    check(await staleCount(p) === 0 && !(await p.locator(".findings .notice").count()), "and nothing else is marked out of date: the key does not depend on the bar grid");
    // drum edit and edit back
    await tab(p, "Rhythm"); const kickRow = () => p.locator('.detail [data-part="rhythm"] .rack').last().locator(".steps.edit").first().locator("button"); const step = kickRow().nth(1); // kick, step 2 (normally off)
    const was = await step.getAttribute("aria-pressed"); await step.click(); await p.waitForTimeout(150);
    let rec = (await full(p)).timingCorrections.filter(c => c.type === "drum"); check(rec.length === 1 && rec[0].lane === "kick" && rec[0].step === 1 && String(rec[0].from) === (was === "true" ? "true" : "false") && String(rec[0].to) !== String(rec[0].from), `a drum step edit is recorded with its original value (${JSON.stringify([rec[0].lane, rec[0].step, rec[0].from, rec[0].to])})`);
    await kickRow().nth(1).click(); await p.waitForTimeout(150);
    rec = (await full(p)).timingCorrections.filter(c => c.type === "drum"); check(rec.length === 0, "editing the step back to its original removes the record");
    // chord edit twice keeps the first original
    await tab(p, "Harmony"); await p.locator(".detail .chcell").first().click(); const orig = (await full(p)).chords.bars[+(await p.locator(".detail .chcell .chnum").first().innerText()) - 1];
    const sel = p.locator('.detail select[aria-label="Change this bar\'s chord"]'); const opts = await sel.locator("option").allInnerTexts(); const pick = opts.filter(o => o && !/Change|No chord/.test(o) && o !== orig);
    await sel.selectOption(pick[0]); await p.waitForTimeout(150); await sel.selectOption(pick[1]); await p.waitForTimeout(150);
    rec = (await full(p)).timingCorrections.filter(c => c.type === "chord"); check(rec.length === 1 && rec[0].from === orig && rec[0].to === pick[1], `two edits of one bar's chord keep the original once (${orig} → ${pick[1]})`);
    // a re-analysis discards chord/drum edits, keeps the key
    await p.click('button[aria-label="Halve the BPM"]'); await again(p); const a2 = await full(p);
    check(a2.key === "C minor" && a2.keyFixed === true && a2.timingCorrections.some(c => c.type === "key") && !a2.timingCorrections.some(c => c.type === "chord" || c.type === "drum") && !a2.patternEdited && !a2.chordChecks, "a re-analysis discards the chord and drum edits (they belonged to the old bars) but keeps the key the user set");
    await p.close(); }

  clearTimeout(guard); console.log("errors", errs); if (errs.length || failed) process.exitCode = 1; await b.close();
  if (!process.exitCode) console.log(`app corrections tests passed (${n})`);
})();
